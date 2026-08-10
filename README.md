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
/api/set-webhook?token=<SETUP_SECRET>
```

## Architecture

```text
Telegram
-> Vercel /api/telegram
-> optional Claude Key Takeaways for bot-form articles only
-> GitHub Markdown commit
-> Vercel Git deployment
-> Astro static site + llms files
```

No VPS, Redis or database is required.

## Telegram CMS

Persistent keyboard:

```text
📝 Нова стаття      💼 Новий кейс
🗑 Видалити статтю  🗑 Видалити кейс
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

`TELEGRAM_SOURCE_CHANNEL_IDS=0` means any channel where the bot receives channel updates may auto-publish. Otherwise use comma-separated channel IDs such as `-1001234567890`.

`ADMIN_ID` is not used.

## Publishing an article through the bot

Press `📝 Нова стаття`. The bot creates one editable article draft with buttons for:

```text
✏️ Заголовок
🧠 Ключові висновки
📝 Текст + H2/H3
✅ Опублікувати статтю
❌ Скасувати
```

`Заголовок` and `Текст` are required. `Ключові висновки` are optional in the bot form: if omitted, the Telegram runtime uses Anthropic Claude to generate them. If they are supplied manually, Claude is not called.

Inside the article body:

```text
## H2
### H3
```

The article H1 comes from the `Заголовок` field.

Published articles are committed to:

```text
astro/src/content/articles/YYYY-MM-DD-slug.md
```

## Publishing from a Telegram channel

Add the bot to the source channel. Channel CMS uses a fixed paragraph contract and does **not** use Claude:

```text
Заголовок статті

Ключові висновки вручну

Звичайний абзац статті.

## H2
Текст під H2.

### H3
Текст під H3.
```

Rules:

- paragraph 1 = article title / H1;
- paragraph 2 = manual Key Takeaways;
- paragraph 3 onward = normal article body;
- `##` = H2 and `###` = H3;
- `##Heading` is normalized to valid Markdown `## Heading`;
- if title, the second Key Takeaways paragraph, or body is missing, the channel post is not published;
- a channel post photo is stored with the article and rendered as its cover image;
- `edited_channel_post` rebuilds the tracked article, including caption/text and photo changes, while preserving its slug/publication identity.

Telegram Bot API exposes `channel_post` and `edited_channel_post`, but no ordinary `deleted_channel_post` update. Therefore deleting a source post in the Telegram channel cannot automatically delete the article through the Bot API webhook; use `🗑 Видалити статтю` in the bot CMS for deletion.

For allowlist mode, an unknown channel ID can be discovered from Vercel Runtime Logs after a rejected test post:

```text
Ignored channel post from unconfigured channel -1001234567890
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

Each field has its own inline edit button.

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
- optional article cover image;
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

`ANTHROPIC_API_KEY` is only required when bot-form article Key Takeaways must be generated automatically. It is not required for channel CMS because channel paragraph 2 supplies Key Takeaways manually.

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

The Telegram function writes through the GitHub API, so the production token needs access to the target repository with:

```text
Contents: Read and write
```

Vercel's Git integration then detects the commit and deploys it.

## Webhook setup

After the Vercel environment variables are configured and deployed, open:

```text
https://PRODUCTION_DOMAIN/api/set-webhook?token=<SETUP_SECRET>
```

There is no public setup page. A missing or incorrect token returns `404`.

A valid request automatically resolves the current Vercel production domain and registers:

```text
https://PRODUCTION_DOMAIN/api/telegram
```

with `message`, `callback_query`, `channel_post`, and `edited_channel_post` updates plus `WEBHOOK_SECRET` as Telegram's `secret_token`. It also removes registered slash commands, resets the Telegram menu button and returns `getWebhookInfo` for verification.

The setup response uses `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Treat the full setup URL as a secret because the query token may remain in browser history or infrastructure request logs.

Re-run the setup URL after changing `TELEGRAM_BOT_TOKEN`, `WEBHOOK_SECRET`, or after deploying a change to the webhook `allowed_updates` list. Access-list changes need only a redeploy.

Adding a custom Vercel domain does not break an existing `*.vercel.app` webhook. Re-run the setup URL only if you want Telegram's stored webhook URL to use the custom domain itself.

For the complete transfer/runbook, see `HANDOFF.md`.