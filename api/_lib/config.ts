export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
export const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
export const GITHUB_OWNER = process.env.GITHUB_OWNER || '';
export const GITHUB_REPO = process.env.GITHUB_REPO || '';
export const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
export const SETUP_SECRET = process.env.SETUP_SECRET || '';

export const ADMIN_ID = Number(process.env.ADMIN_ID || '0');
export const ALLOWED_IDS = (process.env.ALLOWED_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map(Number);

export const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
export const DEFAULT_AUTHOR = process.env.DEFAULT_AUTHOR || 'Pro Personal Agency';

export const ARTICLE_PATH = 'astro/src/content/articles';
export const CASE_PATH = 'astro/src/content/cases';

export function isAllowed(id: number): boolean {
  return (ADMIN_ID !== 0 && id === ADMIN_ID) || ALLOWED_IDS.includes(id);
}

export function missingRuntimeConfig(): string[] {
  const missing: string[] = [];
  if (!TELEGRAM_BOT_TOKEN) missing.push('TELEGRAM_BOT_TOKEN');
  if (!GITHUB_TOKEN) missing.push('GITHUB_TOKEN');
  if (!GITHUB_OWNER) missing.push('GITHUB_OWNER');
  if (!GITHUB_REPO) missing.push('GITHUB_REPO');
  if (!WEBHOOK_SECRET) missing.push('WEBHOOK_SECRET');
  if (!SITE_URL) missing.push('SITE_URL');
  return missing;
}
