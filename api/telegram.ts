import {
  ADMIN_ID, ARTICLE_PATH, CASE_PATH, CMS, SITE_URL, WEBHOOK_SECRET,
  TELEGRAM_ALLOW_ANY_USER, TELEGRAM_ALLOWED_USER_IDS, TELEGRAM_SOURCE_CHANNEL_IDS,
  isAllowed, isSourceChannelAllowed, missingRuntimeConfig,
} from './_lib/config';
import { generateKeyTakeaways } from './_lib/anthropic';
import { commitFile } from './_lib/github';
import {
  buildArticlePreview, parseArticlePreview, parseSubmission,
  toArticleMarkdown, toCaseMarkdown,
} from './_lib/markdown';
import { answerCallbackQuery, editMessageText, sendMessage } from './_lib/telegram';

type CaseFieldKey = 'title' | 'client' | 'url' | 'result' | 'description' | 'notes';
type CaseDraft = Record<CaseFieldKey, string>;

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

  // Нативна кнопка Start у Telegram технічно надсилає /start. Користувач не вводить команди вручну.
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
    return void (await sendMessage(chatId, CMS.articlePrompt, {
      reply_markup: { force_reply: true, input_field_placeholder: 'Заголовок, порожній рядок, текст статті…' },
    }));
  }

  if (text === CMS.caseButton) {
    return void (await sendMessage(chatId, buildCaseDraftText(emptyCaseDraft()), {
      reply_markup: caseKeyboard(),
      disable_web_page_preview: true,
    }));
  }

  const replied = message.reply_to_message?.text || '';
  if (replied.startsWith(CMS.caseEditPrefix)) {
    return void (await saveCaseFieldReply(message));
  }

  if (isArticlePreview(message.reply_to_message)) {
    const preview = message.reply_to_message;
    const existing = parseArticlePreview(preview);
    const keyTakeaways = text.replace(/^(key takeaways|kt|ключові висновки)\s*:\s*/i, '').trim();
    if (!keyTakeaways) return void (await sendMessage(chatId, 'Ключові висновки не можуть бути порожніми.', menu()));

    const previewData = buildArticlePreview(existing.title, keyTakeaways, existing.bodyText, existing.bodyEntities);
    await editMessageText(chatId, preview.message_id, previewData.text, {
      entities: previewData.entities,
      reply_markup: articleKeyboard(),
    });
    return void (await sendMessage(chatId, '✅ Ключові висновки збережено.', menu()));
  }

  if (replied.startsWith('📝 НОВА СТАТТЯ')) return void (await prepareArticle(message));

  return void (await sendMessage(chatId, 'Оберіть дію кнопками нижче.', menu()));
}

async function prepareArticle(message: any) {
  const chatId = message.chat.id;
  const source = parseSubmission(message);
  if (!source.title || !source.bodyText) {
    return await sendMessage(
      chatId,
      `Потрібні заголовок, порожній рядок і текст статті. Натисніть «${CMS.articleButton}» та спробуйте ще раз.`,
      menu(),
    );
  }

  const keyTakeaways = source.keyTakeaways || await generateKeyTakeaways(source.bodyText);
  const preview = buildArticlePreview(source.title, keyTakeaways, source.bodyText, source.bodyEntities);
  await sendMessage(chatId, preview.text, {
    entities: preview.entities,
    reply_markup: articleKeyboard(),
    reply_parameters: { message_id: message.message_id },
  });
}

async function saveCaseFieldReply(message: any) {
  const chatId = message.chat.id;
  const prompt = message.reply_to_message?.text || '';
  const field = fieldFromPrompt(prompt);
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

  if (action.startsWith('case_edit:')) {
    const field = action.slice('case_edit:'.length) as CaseFieldKey;
    if (!CASE_FIELD_KEYS.includes(field)) return void (await answerCallbackQuery(callback.id));

    const draft = parseCaseDraftText(callback.message.text || '');
    await answerCallbackQuery(callback.id, `Редагування: ${CMS.caseFields[field].label}`);
    return void (await sendCaseFieldPrompt(chatId, messageId, field, draft));
  }

  if (action === 'edit_kt') {
    return void (await answerCallbackQuery(
      callback.id,
      'Відповідайте безпосередньо на прев’ю новими ключовими висновками (3–4 речення).',
      true,
    ));
  }

  if (action === 'regen_kt') {
    const original = callback.message.reply_to_message;
    if (!original) return void (await answerCallbackQuery(callback.id, 'Оригінальну статтю не знайдено.', true));
    await answerCallbackQuery(callback.id, 'Генерую знову…');
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
    if (!original) return void (await answerCallbackQuery(callback.id, 'Оригінальну статтю не знайдено.', true));
    await answerCallbackQuery(callback.id, 'Публікую…');

    const source = parseSubmission(original);
    const preview = parseArticlePreview(callback.message);
    const keyTakeaways = preview.keyTakeaways.startsWith('Ключові висновки буде згенеровано')
      ? ''
      : preview.keyTakeaways;
    const post = toArticleMarkdown(source.title, keyTakeaways, source.bodyText, source.bodyEntities);
    await commitFile(`${ARTICLE_PATH}/${post.date}-${post.slug}.md`, post.content, `publish article: ${post.slug}`);
    return void (await editMessageText(chatId, messageId, `✅ Статтю опубліковано\n${SITE_URL}/articles/${post.slug}`, {
      disable_web_page_preview: true,
    }));
  }

  if (action === 'publish_case') {
    const draft = parseCaseDraftText(callback.message.text || '');
    if (!draft.title) {
      return void (await answerCallbackQuery(callback.id, 'Спочатку заповніть назву кейсу.', true));
    }
    if (!draft.description && !draft.url && !draft.notes) {
      return void (await answerCallbackQuery(callback.id, 'Додайте опис, посилання або нотатки.', true));
    }

    await answerCallbackQuery(callback.id, 'Публікую кейс…');
    const post = toCaseMarkdown(draft.title, draft.notes, [], {
      client: draft.client,
      url: draft.url,
      result: draft.result,
      description: draft.description,
    });
    await commitFile(`${CASE_PATH}/${post.date}-${post.slug}.md`, post.content, `publish case: ${post.slug}`);

    const external = draft.url ? `\nЗовнішнє джерело: ${draft.url}` : '';
    return void (await editMessageText(
      chatId,
      messageId,
      `✅ Кейс опубліковано\n${SITE_URL}/#case-${post.slug}${external}`,
      { disable_web_page_preview: true },
    ));
  }

  await answerCallbackQuery(callback.id);
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
  if (fromId !== ADMIN_ID) return void (await sendMessage(chatId, `Ваш Telegram ID: ${fromId}`, menu()));
  const missing = missingRuntimeConfig();
  const userAccess = TELEGRAM_ALLOW_ANY_USER
    ? 'усі користувачі'
    : `${TELEGRAM_ALLOWED_USER_IDS.length + (ADMIN_ID ? 1 : 0)} дозволених ID`;
  const channelAccess = TELEGRAM_SOURCE_CHANNEL_IDS.length
    ? TELEGRAM_SOURCE_CHANNEL_IDS.join(', ')
    : 'не налаштовано';
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

function articleKeyboard() {
  return {
    inline_keyboard: [
      [{ text: CMS.publishArticle, callback_data: 'publish_article' }, { text: CMS.cancel, callback_data: 'cancel' }],
      [{ text: CMS.editTakeaways, callback_data: 'edit_kt' }, { text: CMS.regenerateTakeaways, callback_data: 'regen_kt' }],
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

function fieldFromPrompt(prompt: string): CaseFieldKey | null {
  const firstLine = prompt.split('\n')[0] || '';
  for (const key of CASE_FIELD_KEYS) {
    if (firstLine === `${CMS.caseEditPrefix} ${CMS.caseFields[key].label}`) return key;
  }
  return null;
}

function isArticlePreview(message: any) {
  return Boolean(
    message?.entities?.some((entity: any) => entity.type === 'blockquote') &&
    message?.entities?.some((entity: any) => entity.type === 'bold' && entity.offset === 0),
  );
}

function localizeError(message: string) {
  return message
    .replace('TELEGRAM_BOT_TOKEN is not configured.', 'не налаштовано TELEGRAM_BOT_TOKEN.')
    .replace('Case URL must start with http:// or https://', 'посилання кейсу має починатися з http:// або https://')
    .replace('Not Found', 'не знайдено');
}

const HELP =
  '<b>Публікація контенту</b>\n\n' +
  `<b>Стаття</b>\n1. Натисніть <b>${CMS.articleButton}</b>.\n2. Надішліть заголовок, порожній рядок і текст.\n3. Перевірте прев’ю та натисніть «${CMS.publishArticle}».\n\n` +
  '<b>Кейс</b>\n1. Натисніть <b>💼 Новий кейс</b>.\n2. У чернетці натискайте окремі кнопки «Назва», «Клієнт», «Посилання», «Результат», «Опис», «Нотатки» та заповнюйте лише потрібні поля.\n3. Кожна відповідь одразу зберігається в чернетці.\n4. Натисніть <b>✅ Опублікувати кейс</b>.\n\n' +
  'Якщо у кейсу задано «Посилання», його картка на сайті відкриватиме зовнішнє джерело. Для цього не потрібно змінювати Vercel-конфігурацію.';
