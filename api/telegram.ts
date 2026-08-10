import {
  ARTICLE_PATH, CASE_PATH, CMS, SITE_URL, WEBHOOK_SECRET,
  TELEGRAM_ALLOW_ANY_USER, TELEGRAM_ALLOWED_USER_IDS,
  TELEGRAM_ALLOW_ANY_SOURCE_CHANNEL, TELEGRAM_SOURCE_CHANNEL_IDS,
  isAllowed, isSourceChannelAllowed, missingRuntimeConfig,
} from './_lib/config';
import { generateKeyTakeaways } from './_lib/anthropic';
import { commitFile } from './_lib/github';
import { parseSubmission, toArticleMarkdown, toCaseMarkdown } from './_lib/markdown';
import { answerCallbackQuery, editMessageText, sendMessage } from './_lib/telegram';

type ArticleFieldKey = 'title' | 'keyTakeaways' | 'body';
type ArticleDraft = { title: string; keyTakeaways: string; bodySet: boolean };
type CaseFieldKey = 'title' | 'client' | 'url' | 'result' | 'description' | 'notes';
type CaseDraft = Record<CaseFieldKey, string>;

const ARTICLE_FIELD_KEYS: ArticleFieldKey[] = ['title', 'keyTakeaways', 'body'];
const CASE_FIELD_KEYS: CaseFieldKey[] = ['title', 'client', 'url', 'result', 'description', 'notes'];

export default {
  async fetch(request: Request) {
    if (request.method === 'GET') {
      return Response.json({ ok: true, service: 'ProPersonal Telegram CMS' });
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
      const chatId = update.message?.chat?.id || update.callback_query?.message?.chat?.id;
      if (chatId) {
        await sendMessage(chatId, `⚠️ Помилка: ${localizeError(error?.message || 'невідома помилка')}`, menu()).catch(() => {});
      }
    }

    return Response.json({ ok: true });
  },
};

async function handleMessage(message: any) {
  const chatId = message.chat.id;
  const fromId = message.from?.id ?? chatId;
  const text = (message.text || message.caption || '').trim();

  if (text === '/start') return void (await showHome(chatId, fromId));
  if (text === CMS.idButton) return void (await sendMessage(chatId, `Ваш Telegram ID: ${fromId}`, menu()));
  if (text === CMS.helpButton) return void (await sendMessage(chatId, HELP, { ...menu(), parse_mode: 'HTML' }));
  if (text === CMS.statusButton) return void (await showStatus(chatId, fromId));

  if (!isAllowed(fromId)) {
    return void (await sendMessage(
      chatId,
      `⛔ Публікацію для цього акаунта вимкнено.\n\nВаш Telegram ID: ${fromId}\nДодайте його до TELEGRAM_ALLOWED_USER_IDS у Vercel або встановіть TELEGRAM_ALLOWED_USER_IDS=0, щоб дозволити всім.`,
      menu(),
    ));
  }

  if (text === CMS.articleButton) {
    return void (await sendMessage(chatId, buildArticleDraftText(emptyArticleDraft()), {
      reply_markup: articleDraftKeyboard(),
      disable_web_page_preview: true,
    }));
  }

  if (text === CMS.caseButton) {
    return void (await sendMessage(chatId, buildCaseDraftText(emptyCaseDraft()), {
      reply_markup: caseKeyboard(),
      disable_web_page_preview: true,
    }));
  }

  const replied = message.reply_to_message?.text || '';
  if (replied.startsWith(CMS.articleEditPrefix)) {
    return void (await saveArticleFieldReply(message));
  }
  if (replied.startsWith(CMS.caseEditPrefix)) {
    return void (await saveCaseFieldReply(message));
  }

  return void (await sendMessage(chatId, 'Оберіть дію кнопками нижче.', menu()));
}

async function saveArticleFieldReply(message: any) {
  const chatId = message.chat.id;
  const prompt = message.reply_to_message?.text || '';
  const field = articleFieldFromPrompt(prompt);
  const draftMessageId = Number(prompt.match(/Чернетка #(\d+)/)?.[1] || '0');
  const markerIndex = prompt.indexOf(CMS.articleDraftMarker);

  if (!field || !draftMessageId || markerIndex < 0) {
    return await sendMessage(chatId, 'Не вдалося відновити чернетку. Відкрийте «Нова стаття» і спробуйте ще раз.', menu());
  }

  const snapshot = prompt.slice(markerIndex + CMS.articleDraftMarker.length).trim();
  const draft = parseArticleDraftText(snapshot);
  let value = (message.text || message.caption || '').trim();
  const config = CMS.articleFields[field];

  if (value !== CMS.clearValue && value.length > config.maxLength) {
    return await sendMessage(
      chatId,
      `Поле «${config.label}» задовге. Максимум — ${config.maxLength} символів в одному повідомленні.`,
      menu(),
    );
  }

  if (field === 'body') {
    if (value === CMS.clearValue || !value) {
      draft.bodySet = false;
      await editMessageText(chatId, draftMessageId, buildArticleDraftText(draft), {
        reply_markup: articleDraftKeyboard(),
        disable_web_page_preview: true,
      });
      return void (await sendMessage(chatId, `✅ Поле «${config.label}» очищено.`, menu()));
    }

    draft.bodySet = true;
    await sendMessage(chatId, buildArticleDraftText(draft), {
      reply_markup: articleDraftKeyboard(),
      reply_parameters: { message_id: message.message_id },
      disable_web_page_preview: true,
    });
    await editMessageText(chatId, draftMessageId, '↪️ Чернетку оновлено нижче.');
    return void (await sendMessage(chatId, `✅ Поле «${config.label}» збережено.`, menu()));
  }

  if (value === CMS.clearValue) value = '';
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (field === 'title') draft.title = normalized;
  else draft.keyTakeaways = normalized;

  await editMessageText(chatId, draftMessageId, buildArticleDraftText(draft), {
    reply_markup: articleDraftKeyboard(),
    disable_web_page_preview: true,
  });

  await sendMessage(
    chatId,
    value ? `✅ Поле «${config.label}» збережено.` : `✅ Поле «${config.label}» очищено.`,
    menu(),
  );
}

async function saveCaseFieldReply(message: any) {
  const chatId = message.chat.id;
  const prompt = message.reply_to_message?.text || '';
  const field = caseFieldFromPrompt(prompt);
  const draftMessageId = Number(prompt.match(/Чернетка #(\d+)/)?.[1] || '0');
  const markerIndex = prompt.indexOf(CMS.caseDraftMarker);

  if (!field || !draftMessageId || markerIndex < 0) {
    return await sendMessage(chatId, 'Не вдалося відновити чернетку. Відкрийте «Новий кейс» і спробуйте ще раз.', menu());
  }

  const snapshot = prompt.slice(markerIndex + CMS.caseDraftMarker.length).trim();
  const draft = parseCaseDraftText(snapshot);
  let value = (message.text || message.caption || '').trim();
  if (value === CMS.clearValue) value = '';

  const fieldConfig = CMS.caseFields[field];
  if (value.length > fieldConfig.maxLength) {
    return await sendMessage(
      chatId,
      `Поле «${fieldConfig.label}» задовге. Максимум — ${fieldConfig.maxLength} символів.`,
      menu(),
    );
  }

  if (field === 'url' && value && !/^https?:\/\//i.test(value)) {
    return await sendMessage(chatId, 'Посилання має починатися з http:// або https://.', menu());
  }

  draft[field] = field === 'notes' ? value : value.replace(/\s+/g, ' ').trim();

  await editMessageText(chatId, draftMessageId, buildCaseDraftText(draft), {
    reply_markup: caseKeyboard(),
    disable_web_page_preview: true,
  });

  await sendMessage(chatId, `✅ Поле «${fieldConfig.label}» збережено.`, menu());
}

async function handleCallback(callback: any) {
  const chatId = callback.message?.chat?.id;
  const fromId = callback.from?.id;
  const messageId = callback.message?.message_id;
  const action = callback.data || '';

  if (!chatId || !messageId) return;
  if (!isAllowed(fromId)) {
    return void (await answerCallbackQuery(callback.id, 'Публікацію для цього акаунта вимкнено.', true));
  }

  if (action === 'cancel') {
    await answerCallbackQuery(callback.id, 'Скасовано');
    return void (await editMessageText(chatId, messageId, '❌ Чернетку скасовано.'));
  }

  if (action.startsWith('article_edit:')) {
    const field = action.slice('article_edit:'.length) as ArticleFieldKey;
    if (!ARTICLE_FIELD_KEYS.includes(field)) return void (await answerCallbackQuery(callback.id));

    const draft = parseArticleDraftText(callback.message.text || '');
    await answerCallbackQuery(callback.id, `Редагування: ${CMS.articleFields[field].label}`);
    return void (await sendArticleFieldPrompt(chatId, messageId, field, draft));
  }

  if (action.startsWith('case_edit:')) {
    const field = action.slice('case_edit:'.length) as CaseFieldKey;
    if (!CASE_FIELD_KEYS.includes(field)) return void (await answerCallbackQuery(callback.id));

    const draft = parseCaseDraftText(callback.message.text || '');
    await answerCallbackQuery(callback.id, `Редагування: ${CMS.caseFields[field].label}`);
    return void (await sendCaseFieldPrompt(chatId, messageId, field, draft));
  }

  if (action === 'publish_article') {
    const draft = parseArticleDraftText(callback.message.text || '');
    if (!draft.title) {
      return void (await answerCallbackQuery(callback.id, 'Спочатку заповніть заголовок.', true));
    }
    if (!draft.bodySet) {
      return void (await answerCallbackQuery(callback.id, 'Спочатку додайте текст статті.', true));
    }

    const bodyMessage = callback.message.reply_to_message;
    const bodyText = (bodyMessage?.text || bodyMessage?.caption || '').trim();
    if (!bodyMessage || !bodyText) {
      return void (await answerCallbackQuery(callback.id, 'Текст статті не знайдено. Натисніть «Текст» і додайте його ще раз.', true));
    }

    await answerCallbackQuery(callback.id, 'Публікацію розпочато');
    await sendMessage(chatId, '⏳ Публікую статтю…', menu());

    const bodyEntities = bodyMessage.entities || bodyMessage.caption_entities || [];
    const keyTakeaways = draft.keyTakeaways || await generateKeyTakeaways(bodyText);
    const post = toArticleMarkdown(draft.title, keyTakeaways, bodyText, bodyEntities);
    await commitFile(`${ARTICLE_PATH}/${post.date}-${post.slug}.md`, post.content, `publish article: ${post.slug}`);

    const liveUrl = `${SITE_URL}/articles/${post.slug}`;
    await editMessageText(chatId, messageId, '✅ Чернетку статті опубліковано.');
    return void (await sendMessage(
      chatId,
      `✅ Статтю успішно опубліковано.\n\n🔗 ${liveUrl}\n\nСторінка може з’явитися після завершення Vercel deployment.`,
      menu(),
    ));
  }

  if (action === 'publish_case') {
    const draft = parseCaseDraftText(callback.message.text || '');
    if (!draft.title) {
      return void (await answerCallbackQuery(callback.id, 'Спочатку заповніть назву кейсу.', true));
    }
    if (!draft.description && !draft.url && !draft.notes) {
      return void (await answerCallbackQuery(callback.id, 'Додайте опис, посилання або нотатки.', true));
    }

    await answerCallbackQuery(callback.id, 'Публікацію розпочато');
    await sendMessage(chatId, '⏳ Публікую кейс…', menu());

    const post = toCaseMarkdown(draft.title, draft.notes, [], {
      client: draft.client,
      url: draft.url,
      result: draft.result,
      description: draft.description,
    });
    await commitFile(`${CASE_PATH}/${post.date}-${post.slug}.md`, post.content, `publish case: ${post.slug}`);

    const liveUrl = `${SITE_URL}/#case-${post.slug}`;
    const external = draft.url ? `\nЗовнішнє джерело: ${draft.url}` : '';
    await editMessageText(chatId, messageId, '✅ Чернетку кейсу опубліковано.');
    return void (await sendMessage(
      chatId,
      `✅ Кейс успішно опубліковано.\n\n🔗 ${liveUrl}${external}\n\nСторінка може оновитися після завершення Vercel deployment.`,
      menu(),
    ));
  }

  await answerCallbackQuery(callback.id);
}

async function sendArticleFieldPrompt(chatId: number, draftMessageId: number, field: ArticleFieldKey, draft: ArticleDraft) {
  const config = CMS.articleFields[field];
  const current = field === 'body'
    ? (draft.bodySet ? '✅ додано' : CMS.clearValue)
    : (draft[field] || CMS.clearValue);
  const instruction = field === 'body'
    ? `Відповідайте на це повідомлення повним текстом статті одним повідомленням. Щоб очистити поле, надішліть «${CMS.clearValue}».`
    : field === 'keyTakeaways'
      ? `Відповідайте новими ключовими висновками. Поле необов’язкове: якщо залишити порожнім, Claude згенерує його під час публікації. Щоб очистити поле, надішліть «${CMS.clearValue}».`
      : `Відповідайте новим заголовком. Щоб очистити поле, надішліть «${CMS.clearValue}».`;

  const prompt = [
    `${CMS.articleEditPrefix} ${config.label}`,
    '',
    `Поточне значення: ${current}`,
    instruction,
    '',
    `Чернетка #${draftMessageId}`,
    CMS.articleDraftMarker,
    buildArticleDraftText(draft),
  ].join('\n');

  await sendMessage(chatId, prompt, {
    reply_markup: {
      force_reply: true,
      input_field_placeholder: field === 'body' ? 'Текст статті…' : `${config.label}…`,
    },
    disable_web_page_preview: true,
  });
}

async function sendCaseFieldPrompt(chatId: number, draftMessageId: number, field: CaseFieldKey, draft: CaseDraft) {
  const config = CMS.caseFields[field];
  const current = draft[field] || CMS.clearValue;
  const prompt = [
    `${CMS.caseEditPrefix} ${config.label}`,
    '',
    `Поточне значення: ${current}`,
    `Відповідайте на це повідомлення новим значенням. Щоб очистити поле, надішліть «${CMS.clearValue}».`,
    '',
    `Чернетка #${draftMessageId}`,
    CMS.caseDraftMarker,
    buildCaseDraftText(draft),
  ].join('\n');

  await sendMessage(chatId, prompt, {
    reply_markup: {
      force_reply: true,
      input_field_placeholder: `Нове значення: ${config.label.toLowerCase()}…`,
    },
    disable_web_page_preview: true,
  });
}

async function handleChannelPost(message: any) {
  const chatId = Number(message.chat?.id || 0);
  if (!chatId || !isSourceChannelAllowed(chatId)) {
    console.warn('Ignored channel_post from unconfigured channel', chatId || 'unknown');
    return;
  }

  const source = parseSubmission(message);
  if (!source.title || !source.bodyText) {
    console.warn('Ignored channel_post without title/body', chatId);
    return;
  }

  const keyTakeaways = source.keyTakeaways || await generateKeyTakeaways(source.bodyText);
  const post = toArticleMarkdown(source.title, keyTakeaways, source.bodyText, source.bodyEntities);
  await commitFile(`${ARTICLE_PATH}/${post.date}-${post.slug}.md`, post.content, `publish article from channel: ${post.slug}`);
  console.info('Published article from Telegram channel', chatId, post.slug);
}

async function showHome(chatId: number, fromId: number) {
  const allowed = isAllowed(fromId);
  const intro = allowed
    ? 'ProPersonal CMS готова. Оберіть, що хочете опублікувати.'
    : `ProPersonal CMS\n\nВаш Telegram ID: ${fromId}\nПублікація заблокована, доки цей ID не буде додано до TELEGRAM_ALLOWED_USER_IDS у Vercel. Значення 0 дозволяє всім користувачам.`;
  await sendMessage(chatId, intro, menu());
}

async function showStatus(chatId: number, fromId: number) {
  if (!isAllowed(fromId)) {
    return void (await sendMessage(chatId, `Ваш Telegram ID: ${fromId}\nПублікацію для цього акаунта вимкнено.`, menu()));
  }

  const missing = missingRuntimeConfig();
  const userAccess = TELEGRAM_ALLOW_ANY_USER
    ? 'усі користувачі'
    : `${TELEGRAM_ALLOWED_USER_IDS.length} дозволених ID`;
  const channelAccess = TELEGRAM_ALLOW_ANY_SOURCE_CHANNEL
    ? 'усі канали'
    : TELEGRAM_SOURCE_CHANNEL_IDS.length
      ? `${TELEGRAM_SOURCE_CHANNEL_IDS.length} дозволених каналів`
      : 'автопублікацію вимкнено';
  const base = missing.length
    ? `⚠️ У Vercel бракує змінних:\n${missing.join('\n')}`
    : '✅ Основна конфігурація CMS заповнена.';
  await sendMessage(
    chatId,
    `${base}\n\n👤 Доступ до бота: ${userAccess}\n📣 Канали-джерела: ${channelAccess}`,
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

function articleDraftKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: CMS.articleFields.title.button, callback_data: 'article_edit:title' },
        { text: CMS.articleFields.keyTakeaways.button, callback_data: 'article_edit:keyTakeaways' },
      ],
      [{ text: CMS.articleFields.body.button, callback_data: 'article_edit:body' }],
      [{ text: CMS.publishArticle, callback_data: 'publish_article' }],
      [{ text: CMS.cancel, callback_data: 'cancel' }],
    ],
  };
}

function caseKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: CMS.caseFields.title.button, callback_data: 'case_edit:title' },
        { text: CMS.caseFields.client.button, callback_data: 'case_edit:client' },
      ],
      [
        { text: CMS.caseFields.url.button, callback_data: 'case_edit:url' },
        { text: CMS.caseFields.result.button, callback_data: 'case_edit:result' },
      ],
      [
        { text: CMS.caseFields.description.button, callback_data: 'case_edit:description' },
        { text: CMS.caseFields.notes.button, callback_data: 'case_edit:notes' },
      ],
      [{ text: CMS.publishCase, callback_data: 'publish_case' }],
      [{ text: CMS.cancel, callback_data: 'cancel' }],
    ],
  };
}

function emptyArticleDraft(): ArticleDraft {
  return { title: '', keyTakeaways: '', bodySet: false };
}

function buildArticleDraftText(draft: ArticleDraft) {
  return [
    CMS.articleDraftTitle,
    '',
    `${CMS.articleFields.title.label}: ${draft.title || CMS.clearValue}`,
    `${CMS.articleFields.keyTakeaways.label}: ${draft.keyTakeaways || `${CMS.clearValue} (якщо порожньо — Claude)`}`,
    `${CMS.articleFields.body.label}: ${draft.bodySet ? '✅ додано' : CMS.clearValue}`,
  ].join('\n');
}

function parseArticleDraftText(text: string): ArticleDraft {
  const draft = emptyArticleDraft();
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  const titlePrefix = `${CMS.articleFields.title.label}:`;
  const takeawaysPrefix = `${CMS.articleFields.keyTakeaways.label}:`;
  const bodyPrefix = `${CMS.articleFields.body.label}:`;

  const titleLine = lines.find((line) => line.startsWith(titlePrefix));
  const takeawaysLine = lines.find((line) => line.startsWith(takeawaysPrefix));
  const bodyLine = lines.find((line) => line.startsWith(bodyPrefix));

  if (titleLine) {
    const value = titleLine.slice(titlePrefix.length).trim();
    draft.title = value === CMS.clearValue ? '' : value;
  }
  if (takeawaysLine) {
    const value = takeawaysLine.slice(takeawaysPrefix.length).trim();
    draft.keyTakeaways = value.startsWith(CMS.clearValue) ? '' : value;
  }
  draft.bodySet = Boolean(bodyLine?.includes('✅'));

  return draft;
}

function emptyCaseDraft(): CaseDraft {
  return { title: '', client: '', url: '', result: '', description: '', notes: '' };
}

function buildCaseDraftText(draft: CaseDraft) {
  const value = (key: CaseFieldKey) => draft[key] || CMS.clearValue;
  return [
    CMS.caseDraftTitle,
    '',
    `${CMS.caseFields.title.label}: ${value('title')}`,
    `${CMS.caseFields.client.label}: ${value('client')}`,
    `${CMS.caseFields.url.label}: ${value('url')}`,
    `${CMS.caseFields.result.label}: ${value('result')}`,
    `${CMS.caseFields.description.label}: ${value('description')}`,
    '',
    `${CMS.caseFields.notes.label}:`,
    value('notes'),
  ].join('\n');
}

function parseCaseDraftText(text: string): CaseDraft {
  const draft = emptyCaseDraft();
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const notesLabel = `${CMS.caseFields.notes.label}:`;
  const notesIndex = lines.findIndex((line) => line.trim() === notesLabel);

  for (const key of CASE_FIELD_KEYS.filter((item) => item !== 'notes')) {
    const prefix = `${CMS.caseFields[key].label}:`;
    const line = lines.find((item) => item.startsWith(prefix));
    if (!line) continue;
    const parsed = line.slice(prefix.length).trim();
    draft[key] = parsed === CMS.clearValue ? '' : parsed;
  }

  if (notesIndex >= 0) {
    const parsed = lines.slice(notesIndex + 1).join('\n').trim();
    draft.notes = parsed === CMS.clearValue ? '' : parsed;
  }

  return draft;
}

function articleFieldFromPrompt(prompt: string): ArticleFieldKey | null {
  const firstLine = prompt.split('\n')[0] || '';
  for (const key of ARTICLE_FIELD_KEYS) {
    if (firstLine === `${CMS.articleEditPrefix} ${CMS.articleFields[key].label}`) return key;
  }
  return null;
}

function caseFieldFromPrompt(prompt: string): CaseFieldKey | null {
  const firstLine = prompt.split('\n')[0] || '';
  for (const key of CASE_FIELD_KEYS) {
    if (firstLine === `${CMS.caseEditPrefix} ${CMS.caseFields[key].label}`) return key;
  }
  return null;
}

function localizeError(message: string) {
  return message
    .replace('TELEGRAM_BOT_TOKEN is not configured.', 'не налаштовано TELEGRAM_BOT_TOKEN.')
    .replace('ANTHROPIC_API_KEY is not configured.', 'не налаштовано ANTHROPIC_API_KEY. Заповніть «Ключові висновки» вручну або додайте ключ Anthropic.')
    .replace('Case URL must start with http:// or https://', 'посилання кейсу має починатися з http:// або https://')
    .replace('Not Found', 'не знайдено');
}

const HELP =
  '<b>Публікація контенту</b>\n\n' +
  `<b>Стаття</b>\n1. Натисніть <b>${CMS.articleButton}</b>.\n2. Заповніть кнопками «Заголовок», «Ключові висновки» та «Текст».\n3. «Ключові висновки» можна залишити порожніми — тоді Claude згенерує їх під час публікації.\n4. Натисніть <b>${CMS.publishArticle}</b>.\n\n` +
  '<b>Кейс</b>\n1. Натисніть <b>💼 Новий кейс</b>.\n2. У чернетці натискайте окремі кнопки «Назва», «Клієнт», «Посилання», «Результат», «Опис», «Нотатки» та заповнюйте лише потрібні поля.\n3. Кожна відповідь одразу зберігається в чернетці.\n4. Натисніть <b>✅ Опублікувати кейс</b>.\n\n' +
  'Якщо у кейсу задано «Посилання», його картка на сайті відкриватиме зовнішнє джерело.';
