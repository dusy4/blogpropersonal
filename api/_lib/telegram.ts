import { TELEGRAM_BOT_TOKEN } from './config';

const api = () => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function call(method: string, body: Record<string, unknown> = {}) {
  if (!TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN is not configured.');
  const response = await fetch(`${api()}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok || data?.ok === false) {
    throw new Error(`Telegram ${method} failed: ${JSON.stringify(data)}`);
  }
  return data;
}

export const sendMessage = (chatId: number | string, text: string, extra: Record<string, unknown> = {}) => {
  if (text.startsWith('Vercel не встиг підтвердитися')) {
    console.info('Suppressed Vercel live-check timeout notice');
    return Promise.resolve({ ok: true, suppressed: true });
  }
  return call('sendMessage', { chat_id: chatId, text, ...extra });
};

export const editMessageText = (
  chatId: number | string,
  messageId: number,
  text: string,
  extra: Record<string, unknown> = {},
) => call('editMessageText', { chat_id: chatId, message_id: messageId, text, ...extra });

export const editMessageReplyMarkup = (
  chatId: number | string,
  messageId: number,
  replyMarkup: Record<string, unknown> = { inline_keyboard: [] },
) => call('editMessageReplyMarkup', {
  chat_id: chatId,
  message_id: messageId,
  reply_markup: replyMarkup,
});

export async function answerCallbackQuery(id: string, text?: string, showAlert = false) {
  try {
    return await call('answerCallbackQuery', {
      callback_query_id: id,
      ...(text ? { text } : {}),
      show_alert: showAlert,
    });
  } catch (error: any) {
    const message = error?.message || String(error);
    if (/query is too old|query ID is invalid|response timeout expired/i.test(message)) {
      console.warn('Ignored stale Telegram callback query');
      return { ok: false, stale: true };
    }
    throw error;
  }
}

export const setWebhook = (url: string, secret: string) =>
  call('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query', 'channel_post'],
    drop_pending_updates: false,
  });

export const deleteWebhook = () => call('deleteWebhook', { drop_pending_updates: true });
export const getWebhookInfo = () => call('getWebhookInfo');
export const deleteCommands = () => call('deleteMyCommands');
export const resetMenuButton = () => call('setChatMenuButton', { menu_button: { type: 'default' } });
