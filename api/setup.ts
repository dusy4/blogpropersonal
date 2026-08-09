import { SETUP_SECRET, SITE_URL, WEBHOOK_SECRET } from './_lib/config';
import { deleteCommands, deleteWebhook, getWebhookInfo, setWebhook } from './_lib/telegram';

export default {
  async fetch(request: Request) {
    if (request.method === 'GET') return html(setupPage());
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const form = await request.formData();
    const secret = String(form.get('secret') || '');
    const action = String(form.get('action') || 'status');

    if (!SETUP_SECRET || secret !== SETUP_SECRET) {
      return html(resultPage('Access denied', 'SETUP_SECRET does not match the Vercel environment variable.'), 403);
    }

    try {
      let result: unknown;
      if (action === 'register') {
        if (!SITE_URL || !WEBHOOK_SECRET) throw new Error('SITE_URL and WEBHOOK_SECRET must be configured first.');
        const webhookUrl = `${SITE_URL}/api/telegram`;
        const registered = await setWebhook(webhookUrl, WEBHOOK_SECRET);
        await deleteCommands(); // Button CMS; no command menu.
        result = { webhookUrl, registered, current: await getWebhookInfo() };
      } else if (action === 'delete') {
        result = { deleted: await deleteWebhook(), current: await getWebhookInfo() };
      } else {
        result = await getWebhookInfo();
      }
      return html(resultPage('Done', JSON.stringify(result, null, 2)));
    } catch (error: any) {
      return html(resultPage('Setup failed', error?.message || String(error)), 500);
    }
  },
};

function setupPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>ProPersonal setup</title>${styles()}</head><body><main><h1>ProPersonal Telegram setup</h1><p>This page changes Telegram's stored webhook configuration. It does not expose your Vercel secrets.</p><form method="post"><label>SETUP_SECRET<input name="secret" type="password" required autocomplete="current-password"></label><div class="buttons"><button name="action" value="register">Register / re-register webhook</button><button name="action" value="status">Check webhook status</button><button class="danger" name="action" value="delete">Delete webhook</button></div></form><p class="small">After changing SITE_URL, TELEGRAM_BOT_TOKEN or WEBHOOK_SECRET in Vercel: redeploy first, then come back here and press Register / re-register.</p></main></body></html>`;
}

function resultPage(title: string, output: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title>${styles()}</head><body><main><h1>${escapeHtml(title)}</h1><pre>${escapeHtml(output)}</pre><p><a href="/api/setup">← Back to setup</a></p></main></body></html>`;
}

function styles() {
  return `<style>body{font-family:system-ui,sans-serif;background:#f7f8fa;color:#101828;margin:0}main{max-width:720px;margin:64px auto;padding:32px;background:white;border:1px solid #e4e7ec;border-radius:18px}h1{margin-top:0}label{display:grid;gap:8px;font-weight:600}input{font:inherit;padding:12px;border:1px solid #d0d5dd;border-radius:10px}.buttons{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}button{font:inherit;font-weight:650;padding:11px 16px;border:0;border-radius:10px;background:#155eef;color:white;cursor:pointer}.danger{background:#b42318}pre{white-space:pre-wrap;background:#101828;color:#eaecf0;padding:16px;border-radius:12px;overflow:auto}.small{color:#667085;font-size:14px;line-height:1.5}a{color:#155eef}</style>`;
}

function html(value: string, status = 200) {
  return new Response(value, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char] || char));
}
