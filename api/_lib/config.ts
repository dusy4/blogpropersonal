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

const allowedUsersRaw = (process.env.TELEGRAM_ALLOWED_USER_IDS ?? process.env.ALLOWED_IDS ?? '').trim();
export const TELEGRAM_ALLOW_ANY_USER = allowedUsersRaw === '0';
export const TELEGRAM_ALLOWED_USER_IDS = allowedUsersRaw === '0'
  ? []
  : allowedUsersRaw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);

const sourceChannelsRaw = (process.env.TELEGRAM_SOURCE_CHANNEL_IDS || '').trim();
export const TELEGRAM_ALLOW_ANY_SOURCE_CHANNEL = sourceChannelsRaw === '0';
export const TELEGRAM_SOURCE_CHANNEL_IDS = sourceChannelsRaw === '0'
  ? []
  : sourceChannelsRaw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map(Number)
      .filter(Number.isFinite);

export const SITE_URL = (process.env.SITE_URL || '').replace(/\/$/, '');
export const DEFAULT_AUTHOR = process.env.DEFAULT_AUTHOR || 'ProPersonal';

// Шляхи до контенту в репозиторії. Змінювати лише якщо змінюється структура Astro.
export const ARTICLE_PATH = process.env.ARTICLE_PATH || 'astro/src/content/articles';
export const CASE_PATH = process.env.CASE_PATH || 'astro/src/content/cases';

// Увесь видимий текст Telegram CMS та поля форми кейсу зібрані тут.
// Посилання конкретного кейсу є частиною контенту, а не Vercel-конфігурацією.
export const CMS = {
  articleButton: '📝 Нова стаття',
  caseButton: '💼 Новий кейс',
  statusButton: '⚙️ Стан',
  idButton: '🆔 Мій ID',
  helpButton: '❓ Допомога',

  articlePrompt: '📝 НОВА СТАТТЯ\n\nВідповідайте на це повідомлення:\n\nЗаголовок\n\nТекст статті\n\nЗа бажанням першим абзацом додайте “Ключові висновки: …”. Якщо їх немає, Claude згенерує їх автоматично.',

  caseDraftTitle: '🧩 Чернетка кейсу',
  caseEditPrefix: '✏️ Редагування поля кейсу:',
  caseDraftMarker: '--- ПОТОЧНА ЧЕРНЕТКА ---',
  clearValue: '—',

  caseFields: {
    title: { label: 'Назва', button: '✏️ Назва', maxLength: 160 },
    client: { label: 'Клієнт', button: '🏢 Клієнт', maxLength: 120 },
    url: { label: 'Посилання', button: '🔗 Посилання', maxLength: 1000 },
    result: { label: 'Результат', button: '📈 Результат', maxLength: 300 },
    description: { label: 'Опис', button: '📝 Опис', maxLength: 500 },
    notes: { label: 'Нотатки', button: '📎 Нотатки', maxLength: 1400 },
  },

  publishArticle: '✅ Опублікувати статтю',
  publishCase: '✅ Опублікувати кейс',
  cancel: '❌ Скасувати',
  editTakeaways: '✏️ Ключові висновки',
  regenerateTakeaways: '♻️ Згенерувати знову',
} as const;

export function isAllowed(id: number): boolean {
  if (ADMIN_ID !== 0 && id === ADMIN_ID) return true;
  if (TELEGRAM_ALLOW_ANY_USER) return true;
  return TELEGRAM_ALLOWED_USER_IDS.includes(id);
}

export function isSourceChannelAllowed(id: number): boolean {
  if (TELEGRAM_ALLOW_ANY_SOURCE_CHANNEL) return true;
  return TELEGRAM_SOURCE_CHANNEL_IDS.includes(id);
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
