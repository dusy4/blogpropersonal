import {
  ADMIN_ID, ARTICLE_PATH, CASE_PATH, CMS, SITE_URL, WEBHOOK_SECRET,
  isAllowed, missingRuntimeConfig,
} from './_lib/config';
import { generateKeyTakeaways } from './_lib/anthropic';
import { commitFile } from './_lib/github';
import {
  buildArticlePreview, parseArticlePreview, parseCaseSubmission, parseSubmission,
  toArticleMarkdown, toCaseMarkdown,
} from './_lib/markdown';
import { answerCallbackQuery, editMessageText, sendMessage } from './_lib/telegram';

export default {
  async fetch(request: Request) {
    if (request.method === 'GET') {
      return Response.json({ ok: true, service: 'ProPersonal Telegram webhook' });
    }
    if (request.method !== 'POST') return Response.json({ error: 'method_not_allowed' }, { status: 405 });

    if (!WEBHOOK_SECRET || request.headers.get('x-telegram-bot-api-secret-token') !== WEBHOOK_SECRET) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }

    let update: any;
    try {
      update = await request.json();
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 });
    }

    try {
      if (update.callback_query) await handleCallback(update.callback_query);
      else if (update.message) await handleMessage(update.message);
      else if (update.channel_post) await handleChannelPost(update.channel_post);
    } catch (error: any) {
      console.error('telegram webhook error', error);
      const chatId = update.message?.chat?.id || update.channel_post?.chat?.id || update.callback_query?.message?.chat?.id;
      if (chatId) await sendMessage(chatId, `⚠️ ${error?.message || 'Unknown error'}`, menu()).catch(() => {});
    }

    return Response.json({ ok: true });
  },
};

async function handleMessage(message: any) {
  const chatId = message.chat.id;
  const fromId = message.from?.id ?? chatId;
  const text = (message.text || message.caption || '').trim();

  // Telegram's native Start button sends /start. The author never needs to type commands.
  if (text === '/start') return void (await showHome(chatId, fromId));
  if (text === CMS.idButton) return void (await sendMessage(chatId, `Your Telegram ID: ${fromId}`, menu()));
  if (text === CMS.helpButton) return void (await sendMessage(chatId, HELP, { ...menu(), parse_mode: 'HTML' }));
  if (text === CMS.statusButton) return void (await showStatus(chatId, fromId));

  if (!isAllowed(fromId)) {
    return void (await sendMessage(
      chatId,
      `⛔ Publishing is disabled for this account.\n\nYour Telegram ID: ${fromId}\nAdd it to ALLOWED_IDS in Vercel, redeploy, then try again.`,
      menu(),
    ));
  }

  if (text === CMS.articleButton) {
    return void (await sendMessage(chatId, CMS.articlePrompt, {
      ...menu(),
      reply_markup: { force_reply: true, input_field_placeholder: 'Title, blank line, article…' },
    }));
  }

  if (text === CMS.caseButton) {
    return void (await sendMessage(chatId, CMS.casePrompt, {
      ...menu(),
      reply_markup: { force_reply: true, input_field_placeholder: 'Title, fields, optional notes…' },
    }));
  }

  if (isArticlePreview(message.reply_to_message)) {
    const preview = message.reply_to_message;
    const existing = parseArticlePreview(preview);
    const keyTakeaways = text.replace(/^(key takeaways|kt|ключові висновки)\s*:\s*/i, '').trim();
    if (!keyTakeaways) return void (await sendMessage(chatId, 'Key Takeaways cannot be empty.', menu()));

    const previewData = buildArticlePreview(existing.title, keyTakeaways, existing.bodyText, existing.bodyEntities);
    await editMessageText(chatId, preview.message_id, previewData.text, {
      entities: previewData.entities,
      reply_markup: articleKeyboard(),
    });
    return void (await sendMessage(chatId, '✅ Key Takeaways updated.', menu()));
  }

  const replied = message.reply_to_message?.text || '';
  if (replied.startsWith('📝 NEW ARTICLE')) return void (await prepareArticle(message));
  if (replied.startsWith('💼 NEW CASE')) return void (await prepareCase(message));

  return void (await sendMessage(chatId, 'Choose an action using the buttons below.', menu()));
}

async function prepareArticle(message: any) {
  const chatId = message.chat.id;
  const source = parseSubmission(message);
  if (!source.title || !source.bodyText) {
    return await sendMessage(chatId, `Need a title, a blank line, and article body. Tap “${CMS.articleButton}” and try again.`, menu());
  }

  const keyTakeaways = source.keyTakeaways || await generateKeyTakeaways(source.bodyText);
  const preview = buildArticlePreview(source.title, keyTakeaways, source.bodyText, source.bodyEntities);
  await sendMessage(chatId, preview.text, {
    entities: preview.entities,
    reply_markup: articleKeyboard(),
    reply_parameters: { message_id: message.message_id },
  });
}

async function prepareCase(message: any) {
  const chatId = message.chat.id;
  const source = parseCaseSubmission(message);
  if (!source.title || (!source.description && !source.url && !source.bodyText)) {
    return await sendMessage(chatId, `Need a case title plus description, URL, or body. Tap “${CMS.caseButton}” and try again.`, menu());
  }

  const preview = [
    source.title,
    source.client ? `Client: ${source.client}` : '',
    source.url ? `URL: ${source.url}` : '',
    source.result ? `Result: ${source.result}` : '',
    `Description: ${source.description}`,
  ].filter(Boolean).join('\n\n');

  await sendMessage(chatId, preview, {
    entities: [{ type: 'bold', offset: 0, length: source.title.length }],
    reply_markup: caseKeyboard(),
    reply_parameters: { message_id: message.message_id },
    disable_web_page_preview: true,
  });
}

async function handleCallback(callback: any) {
  const chatId = callback.message?.chat?.id;
  const fromId = callback.from?.id;
  const messageId = callback.message?.message_id;
  const action = callback.data || '';

  if (!chatId || !messageId) return;
  if (!isAllowed(fromId)) return void (await answerCallbackQuery(callback.id, 'Publishing is not allowed for this account.', true));

  if (action === 'cancel') {
    await answerCallbackQuery(callback.id, 'Cancelled');
    return void (await editMessageText(chatId, messageId, '❌ Draft cancelled.'));
  }

  if (action === 'edit_kt') {
    return void (await answerCallbackQuery(callback.id, 'Reply directly to this preview with your new 3–4 sentence Key Takeaways.', true));
  }

  if (action === 'regen_kt') {
    const original = callback.message.reply_to_message;
    if (!original) return void (await answerCallbackQuery(callback.id, 'Original article not found.', true));
    await answerCallbackQuery(callback.id, 'Regenerating…');
    const source = parseSubmission(original);
    const keyTakeaways = await generateKeyTakeaways(source.bodyText);
    const preview = buildArticlePreview(source.title, keyTakeaways, source.bodyText, source.bodyEntities);
    return void (await editMessageText(chatId, messageId, preview.text, {
      entities: preview.entities,
      reply_markup: articleKeyboard(),
    }));
  }

  if (action === 'publish_article') {
    const original = callback.message.reply_to_message;
    if (!original) return void (await answerCallbackQuery(callback.id, 'Original article not found.', true));
    await answerCallbackQuery(callback.id, 'Publishing…');

    const source = parseSubmission(original);
    const preview = parseArticlePreview(callback.message);
    const keyTakeaways = preview.keyTakeaways.startsWith('Key Takeaways will be generated')
      ? ''
      : preview.keyTakeaways;
    const post = toArticleMarkdown(source.title, keyTakeaways, source.bodyText, source.bodyEntities);
    await commitFile(`${ARTICLE_PATH}/${post.date}-${post.slug}.md`, post.content, `publish article: ${post.slug}`);
    return void (await editMessageText(chatId, messageId, `✅ Published\n${SITE_URL}/articles/${post.slug}`, {
      disable_web_page_preview: true,
    }));
  }

  if (action === 'publish_case') {
    const original = callback.message.reply_to_message;
    if (!original) return void (await answerCallbackQuery(callback.id, 'Original case not found.', true));
    await answerCallbackQuery(callback.id, 'Publishing…');

    const source = parseCaseSubmission(original);
    const post = toCaseMarkdown(source.title, source.bodyText, source.bodyEntities, {
      client: source.client,
      url: source.url,
      result: source.result,
      description: source.description,
    });
    await commitFile(`${CASE_PATH}/${post.date}-${post.slug}.md`, post.content, `publish case: ${post.slug}`);

    const destination = source.url ? `\nExternal source: ${source.url}` : '';
    return void (await editMessageText(
      chatId,
      messageId,
      `✅ Case published\n${SITE_URL}/#case-${post.slug}${destination}`,
      { disable_web_page_preview: true },
    ));
  }

  await answerCallbackQuery(callback.id);
}

async function handleChannelPost(message: any) {
  const chatId = message.chat.id;
  if (!isAllowed(chatId)) return;
  const source = parseSubmission(message);
  if (!source.title || !source.bodyText) return;

  const keyTakeaways = source.keyTakeaways || await generateKeyTakeaways(source.bodyText);
  const post = toArticleMarkdown(source.title, keyTakeaways, source.bodyText, source.bodyEntities);
  await commitFile(`${ARTICLE_PATH}/${post.date}-${post.slug}.md`, post.content, `publish article from channel: ${post.slug}`);
  await sendMessage(chatId, `✅ Published: ${SITE_URL}/articles/${post.slug}`, { disable_web_page_preview: true });
}

async function showHome(chatId: number, fromId: number) {
  const allowed = isAllowed(fromId);
  const intro = allowed
    ? 'ProPersonal CMS is ready. Choose what you want to publish.'
    : `ProPersonal CMS\n\nYour Telegram ID: ${fromId}\nPublishing is locked until this ID is added to ALLOWED_IDS in Vercel.`;
  await sendMessage(chatId, intro, menu());
}

async function showStatus(chatId: number, fromId: number) {
  if (fromId !== ADMIN_ID) return void (await sendMessage(chatId, `Your Telegram ID: ${fromId}`, menu()));
  const missing = missingRuntimeConfig();
  await sendMessage(
    chatId,
    missing.length ? `⚠️ Missing Vercel variables:\n${missing.join('\n')}` : '✅ Runtime configuration looks complete.',
    menu(),
  );
}

function menu() {
  return {
    reply_markup: {
      keyboard: [
        [{ text: CMS.articleButton }, { text: CMS.caseButton }],
        [{ text: CMS.statusButton }, { text: CMS.idButton }, { text: CMS.helpButton }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    },
  };
}

function articleKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '✅ Publish article', callback_data: 'publish_article' }, { text: '❌ Cancel', callback_data: 'cancel' }],
      [{ text: '✍️ Edit Key Takeaways', callback_data: 'edit_kt' }, { text: '♻️ Regenerate', callback_data: 'regen_kt' }],
    ],
  };
}

function caseKeyboard() {
  return {
    inline_keyboard: [[
      { text: '✅ Publish case', callback_data: 'publish_case' },
      { text: '❌ Cancel', callback_data: 'cancel' },
    ]],
  };
}

function isArticlePreview(message: any) {
  return Boolean(
    message?.entities?.some((entity: any) => entity.type === 'blockquote') &&
    message?.entities?.some((entity: any) => entity.type === 'bold' && entity.offset === 0),
  );
}

const HELP =
  '<b>Publishing flow</b>\n\n' +
  `1. Tap <b>${CMS.articleButton}</b> or <b>${CMS.caseButton}</b>.\n` +
  '2. Reply to the prompt and review the preview.\n' +
  '3. Use the inline Publish / Cancel buttons.\n\n' +
  '<b>Articles:</b> optionally add <code>Key Takeaways: …</code>; otherwise Claude generates them.\n\n' +
  '<b>Cases:</b> optionally add <code>Client:</code>, <code>URL:</code>, <code>Result:</code>, and <code>Description:</code>. When URL is present, the case card opens that external source. No Vercel config change is needed per case.';
