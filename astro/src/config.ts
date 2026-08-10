export const SITE_NAME = 'ProPersonal';
export const SITE_DESCRIPTION = 'Практичні матеріали та кейси про AI-інтеграції, автоматизацію й цифрові бізнес-процеси.';

const rawSiteUrl =
  import.meta.env.SITE_URL ||
  import.meta.env.VERCEL_PROJECT_PRODUCTION_URL ||
  import.meta.env.VERCEL_URL ||
  'https://example.com';

export const SITE_URL = (/^https?:\/\//i.test(rawSiteUrl) ? rawSiteUrl : `https://${rawSiteUrl}`).replace(/\/$/, '');
export const TELEGRAM_CHANNEL_URL = import.meta.env.TELEGRAM_CHANNEL_URL || '#';
