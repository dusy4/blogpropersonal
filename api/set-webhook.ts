import { SETUP_SECRET, SITE_URL, WEBHOOK_SECRET } from './_lib/config';
import { deleteCommands, getWebhookInfo, resetMenuButton, setWebhook } from './_lib/telegram';

const headers = {
  'cache-control': 'no-store, max-age=0',
  'content-type': 'application/json; charset=utf-8',
  'referrer-policy': 'no-referrer',
};

export default {
  async fetch(request: Request) {
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || '';

    // Do not expose a setup UI or even confirm that the protected endpoint exists.
    if (request.method !== 'GET' || !SETUP_SECRET || token !== SETUP_SECRET) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers });
    }

    try {
      if (!SITE_URL) throw new Error('Production URL could not be resolved from Vercel.');
      if (!WEBHOOK_SECRET) throw new Error('WEBHOOK_SECRET is not configured.');

      const webhookUrl = `${SITE_URL}/api/telegram`;
      const registered = await setWebhook(webhookUrl, WEBHOOK_SECRET);
      await deleteCommands();
      await resetMenuButton();
      const current = await getWebhookInfo();

      return new Response(JSON.stringify({ ok: true, webhookUrl, registered, current }, null, 2), {
        status: 200,
        headers,
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2), {
        status: 500,
        headers,
      });
    }
  },
};
