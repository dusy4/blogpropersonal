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

export const sendMessage = (chatId: number | string, text: string, extra: Record<string, unknown> = {}) =>
  call('sendMessage', { chat_id: chatId, text, ...extra });

export const editMessageText = (
  chatId: number | string,
  messageId: number,
  text: string,
  extra: Record<string, unknown> = {},
) => call('editMessageText', { chat_id: chatId, message_id: messageId, text, ...extra });

export const answerCallbackQuery = (id: string, text?: string, showAlert = false) =>
  call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}), show_alert: showAlert });

export const setWebhook = (url: string, secret: string) =>
  call('setWebhook', {
    url,
    secret_token: secret,
    allowed_updates: ['message', 'callback_query', 'channel_post'],
    drop_pending_updates: true,
  });

export const deleteWebhook = () => call('deleteWebhook', { drop_pending_updates: true });
export const getWebhookInfo = () => call('getWebhookInfo');
export const deleteCommands = () => call('deleteMyCommands');
export const resetMenuButton = () => call('setChatMenuButton', { menu_button: { type: 'default' } });
