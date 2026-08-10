const rawSiteUrl =
  import.meta.env.SITE_URL ||
  import.meta.env.VERCEL_PROJECT_PRODUCTION_URL ||
  import.meta.env.VERCEL_URL ||
  'http://localhost:4321';

export const SITE_URL = (/^https?:\/\//i.test(rawSiteUrl) ? rawSiteUrl : `https://${rawSiteUrl}`).replace(/\/$/, '');
export const SITE_NAME = import.meta.env.SITE_NAME || 'ProPersonal Agency';
export const SITE_DESCRIPTION = 'Розумні AI-інтеграції для компаній, що хочуть бути на крок попереду.';
export const TELEGRAM_CHANNEL_URL = import.meta.env.TELEGRAM_CHANNEL_URL || 'https://t.me/your_channel';
export const CONTACT_EMAIL = import.meta.env.CONTACT_EMAIL || 'hello@example.com';
