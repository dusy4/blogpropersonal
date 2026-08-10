declare const process: { env: Record<string, string | undefined> };

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

// Repository content locations. Change here only if the Astro structure changes.
export const ARTICLE_PATH = process.env.ARTICLE_PATH || 'astro/src/content/articles';
export const CASE_PATH = process.env.CASE_PATH || 'astro/src/content/cases';

// Telegram CMS copy/configuration. Per-case external URLs are content and are
// entered in Telegram as `URL: https://...`; they are not Vercel secrets.
export const CMS = {
  articleButton: '📝 New article',
  caseButton: '💼 New case',
  statusButton: '⚙️ Status',
  idButton: '🆔 My ID',
  helpButton: '❓ Help',
  articlePrompt: '📝 NEW ARTICLE\n\nReply with:\n\nTitle\n\nArticle body\n\nOptional: put “Key Takeaways: …” as the first paragraph. If omitted, Claude generates it.',
  casePrompt: '💼 NEW CASE\n\nReply with:\n\nCase title\n\nClient: Company name (optional)\nURL: https://external-source.example/case (optional)\nResult: measurable result (optional)\nDescription: short card description (optional)\n\nOptional longer case notes/body after the fields. If URL is supplied, the website card opens that external source.',
} as const;

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
