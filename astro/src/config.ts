const rawSiteUrl =
  import.meta.env.SITE_URL ||
  import.meta.env.VERCEL_PROJECT_PRODUCTION_URL ||
  import.meta.env.VERCEL_URL ||
  'http://localhost:4321';

export const SITE_URL = (/^https?:\/\//i.test(rawSiteUrl) ? rawSiteUrl : `https://${rawSiteUrl}`).replace(/\/$/, '');

// Human-facing site configuration. Change these defaults here for handoff,
// or override URL-like values with Vercel environment variables.
export const SITE_NAME = import.meta.env.SITE_NAME || 'ProPersonal';
export const SITE_MARK = import.meta.env.SITE_MARK || 'PP';
export const BLOG_SUBTITLE = import.meta.env.BLOG_SUBTITLE || 'Блог про AI-інтеграції та автоматизацію';
export const SITE_DESCRIPTION = import.meta.env.SITE_DESCRIPTION || 'Практичні статті та кейси про AI-інтеграції й автоматизацію.';

export const TELEGRAM_CHANNEL_URL = import.meta.env.TELEGRAM_CHANNEL_URL || 'https://t.me/your_channel';
export const CONTACT_EMAIL = import.meta.env.CONTACT_EMAIL || 'hello@example.com';

export const ARTICLES_URL = import.meta.env.ARTICLES_URL || '/articles';
export const CASES_URL = import.meta.env.CASES_URL || '/cases';

export const UI = {
  navArticles: 'Статті',
  navCases: 'Кейси',
  featuredLabel: 'Головна стаття',
  readArticle: 'Читати статтю',
  articlesTitle: 'Статті',
  articlesDescription: 'Практичні матеріали про AI та автоматизацію',
  allArticles: 'Усі статті',
  articlesVisualTag: 'AI-інтеграції',
  casesTitle: 'Кейси',
  casesDescription: 'Реальні приклади впровадження AI-рішень',
  allCases: 'Усі кейси',
  emptyArticles: 'Наступні статті з’являться тут після публікації.',
  emptyCases: 'Кейси з’являться тут після публікації.',
  footerTagline: 'Створено для тих, хто будує майбутнє разом з AI.',
} as const;
