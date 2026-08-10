# ProPersonal Blog

Astro static blog + Telegram CMS + GitHub Markdown + Vercel Functions + Anthropic Claude.

Homepage contains only the editorial product:

```text
Header
Latest article
Articles
Cases
Footer
```

No landing-page services/stats/testimonials and no visible `llms.txt` promotion.

## Routes

```text
/
/articles
/articles/<slug>
/cases
/llms.txt
/llms-full.txt
/sitemap.xml
/robots.txt
/api/telegram
/api/setup
```

## Architecture

```text
Telegram
-> Vercel /api/telegram
-> optional Claude Key Takeaways
-> GitHub Markdown commit
-> Vercel Git deployment
-> Astro static site + llms files
```

No VPS, Redis or database is required.

## Telegram CMS

Persistent keyboard:

```text
📝 Нова стаття      💼 Новий кейс
⚙️ Стан             🆔 Мій ID      ❓ Допомога
```

The Telegram-native Start button technically sends `/start`; users do not need typed CMS commands.

### Access

There are only two access variables:

```text
TELEGRAM_ALLOWED_USER_IDS=0
TELEGRAM_SOURCE_CHANNEL_IDS=0
```

`TELEGRAM_ALLOWED_USER_IDS=0` means any Telegram user may use the bot CMS. Otherwise use comma-separated user IDs.

`TELEGRAM_SOURCE_CHANNEL_IDS=0` means any channel where the bot receives `channel_post` may auto-publish. Otherwise use comma-separated channel IDs such as `-1001234567890`.

`ADMIN_ID` is not used.

## Publishing an article through the bot

Press `📝 Нова стаття` and reply:

```text
Заголовок

Текст статті...
```

Optional author-provided answer-first summary:

```text
Заголовок

Ключові висновки: Речення 1. Речення 2. Речення 3.

Текст статті...
```

If Key Takeaways are omitted, the Telegram runtime uses Anthropic Claude to generate them.

Preview actions:

```text
✅ Опублікувати статтю
❌ Скасувати
✏️ Ключові висновки
♻️ Згенерувати знову
```

Published articles are committed to:

```text
astro/src/content/articles/YYYY-MM-DD-slug.md
```

## Publishing from a Telegram channel

Add the bot to the source channel. The webhook subscribes to `channel_post`.

Post:

```text
Заголовок

Текст статті...
```

Allowed channel posts follow the same GitHub -> Vercel publishing pipeline.

For allowlist mode, an unknown channel ID can be discovered from Vercel Runtime Logs after a rejected test post:

```text
Ignored channel_post from unconfigured channel -1001234567890
```

## Cases

Press `💼 Новий кейс`. The bot creates one editable draft:

```text
🧩 Чернетка кейсу

Назва: —
Клієнт: —
Посилання: —
Результат: —
Опис: —

Нотатки:
—
```

Each field has its own inline edit button. A reply changes only that field and updates the original draft message.

Publication requires:

```text
Назва
+
at least one of: Опис / Посилання / Нотатки
```

`Клієнт` and `Результат` are optional.

If `Посилання` is present, the case card opens that external source. Otherwise the case remains an on-page card.

Published cases are committed to:

```text
astro/src/content/cases/YYYY-MM-DD-slug.md
```

## Article reader

Article pages contain:

- H1 + author/date;
- answer-first **Ключові висновки**;
- Markdown H2/H3;
- Telegram CTA;
- native/share buttons for WhatsApp, Telegram, LinkedIn, Threads and copy link;
- `TechArticle` JSON-LD;
- canonical/OpenGraph/Twitter metadata.

## AI-readable files

`astro/scripts/generate-llms.mjs` generates at build time:

```text
/llms.txt
/llms-full.txt
/robots.txt
```

`/llms.txt` uses Anthropic when `ANTHROPIC_API_KEY` is configured and falls back to deterministic Markdown-derived summaries if the key/API is unavailable during build.

`/llms-full.txt` is assembled directly from published Markdown.

## Production URL resolution

Normally do **not** configure `SITE_URL` on Vercel.

The project resolves the production base URL in this order:

```text
SITE_URL override
-> VERCEL_PROJECT_PRODUCTION_URL
-> VERCEL_URL
```

This is used for canonical URLs, sitemap/AI files, Telegram result links and webhook registration.

`SITE_URL` exists only as an optional override for a deliberately chosen canonical domain or non-Vercel deployment.

## Required Vercel variables

Secrets/runtime:

```text
TELEGRAM_BOT_TOKEN
ANTHROPIC_API_KEY
GITHUB_TOKEN
WEBHOOK_SECRET
SETUP_SECRET
```

Publishing/config:

```text
ANTHROPIC_MODEL=claude-sonnet-5
GITHUB_OWNER=<owner>
GITHUB_REPO=blogpropersonal
GITHUB_BRANCH=main
TELEGRAM_ALLOWED_USER_IDS=0
TELEGRAM_SOURCE_CHANNEL_IDS=0
TELEGRAM_CHANNEL_URL=https://t.me/...
DEFAULT_AUTHOR=Pro Personal Agency
```

Frontend/handoff options:

```text
SITE_NAME=ProPersonal
SITE_MARK=PP
BLOG_SUBTITLE=Блог про AI-інтеграції та автоматизацію
SITE_DESCRIPTION=Практичні статті та кейси про AI-інтеграції й автоматизацію.
ARTICLES_URL=/articles
CASES_URL=/cases
```

## GitHub token

The Telegram function writes through the GitHub Contents API, so the production token needs access to the target repository with:

```text
Contents: Read and write
```

Vercel's Git integration then detects the commit and deploys it.

## Webhook setup

After environment variables are configured and deployed, open:

```text
https://PRODUCTION_DOMAIN/api/setup
```

Enter `SETUP_SECRET` and press **Зареєструвати / перереєструвати webhook**.

The setup route automatically resolves the Vercel production domain and registers:

```text
https://PRODUCTION_DOMAIN/api/telegram
```

with `message`, `callback_query`, and `channel_post` updates plus `WEBHOOK_SECRET` as Telegram's `secret_token`.

Re-register after changing `TELEGRAM_BOT_TOKEN` or `WEBHOOK_SECRET`. Access-list changes need only a redeploy.

Adding a custom Vercel domain does not break an existing `*.vercel.app` webhook. Re-register only if you want Telegram's stored webhook URL to use the custom domain itself.

For the complete transfer/runbook, see `HANDOFF.md`.
