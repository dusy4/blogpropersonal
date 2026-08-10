# ProPersonal Blog — Astro + Telegram CMS + Claude + Vercel

Цей repository є фінальною версією тестового проєкту з ТЗ. За основу взято готовий `astroblog_tgblogposter_md`: збережено його article-reading page, Key Takeaways, Telegram CTA та rich share buttons. Додано тільки те, що потрібно для фінальної архітектури та handoff.

## Що бачить користувач сайту

Головна сторінка — **тільки блог**:

1. `H1 Блог`;
2. секція `Статті`;
3. секція `Кейси` на тій самій сторінці.

Немає landing-page блоків, services, stats, testimonials, contact forms, AI/LLM promo sections або іншого маркетингового шуму.

Структура HTML навмисно проста: один `<main>`, прямі `<section>`, semantic `<article>`, H1 → H2 → H3. Контент рендериться статично Astro і присутній у HTML одразу — без tabs, accordion, carousel або client-side fetching.

`/llms.txt` і `/llms-full.txt` існують **тільки як machine-facing endpoints**. Посилань на них у frontend немає.

---

# 1. Mental model

Є чотири частини:

- **GitHub** — source of truth для коду та Markdown контенту;
- **Vercel** — hosting, Functions і build runtime;
- **Telegram** — UI для content management;
- **Anthropic Claude** — summarization для Key Takeaways та `llms.txt`.

Ніякий VPS, daemon, Redis, Postgres або постійно запущений script не потрібен.

```mermaid
flowchart LR
  U[Author in Telegram] --> T[Telegram servers]
  T -->|POST webhook + secret header| V[Vercel Function /api/telegram]
  V -->|optional KT generation| C[Claude Sonnet 5]
  V -->|GitHub Contents API| G[(GitHub Markdown)]
  G -->|Git push triggers deploy| B[Vercel build]
  B -->|summarize Markdown| C2[Claude Sonnet 5]
  B --> L[/llms.txt]
  B --> LF[/llms-full.txt]
  B --> A[Astro static site]
```

## Що відбувається після Publish у Telegram

1. Автор натискає кнопку в Telegram bot.
2. Telegram server надсилає update на `https://DOMAIN/api/telegram`.
3. Vercel Function перевіряє `X-Telegram-Bot-Api-Secret-Token`.
4. Function формує `.md`.
5. Function комітить `.md` у GitHub через Contents API.
6. GitHub commit автоматично запускає Vercel deployment.
7. `prebuild` генерує `llms.txt` / `llms-full.txt`.
8. Astro генерує static HTML.
9. Нова стаття або кейс з'являється на сайті.

---

# 2. Чому Telegram може викликати Vercel

Telegram **не читає secret із Vercel**.

Під час одноразової реєстрації webhook наш `/api/setup` викликає Telegram `setWebhook` і передає:

```text
url = https://DOMAIN/api/telegram
secret_token = WEBHOOK_SECRET
```

Telegram запам'ятовує URL + secret. Після цього кожен update містить header:

```text
X-Telegram-Bot-Api-Secret-Token: <WEBHOOK_SECRET>
```

Vercel Function порівнює header з `process.env.WEBHOOK_SECRET`.

Отже:

- наш app → Telegram API: auth через `TELEGRAM_BOT_TOKEN`;
- Telegram → Vercel webhook: auth через `WEBHOOK_SECRET`.

---

# 3. Repository structure

```text
.
├── api/
│   ├── telegram.ts              # Telegram CMS webhook
│   ├── setup.ts                 # protected webhook setup UI
│   └── _lib/
│       ├── anthropic.ts         # Claude Key Takeaways
│       ├── config.ts            # runtime env vars
│       ├── github.ts            # GitHub Contents API
│       ├── markdown.ts          # Telegram -> Markdown
│       └── telegram.ts          # Telegram Bot API wrapper
├── astro/
│   ├── scripts/generate-llms.mjs
│   ├── src/content/articles/*.md
│   ├── src/content/cases/*.md
│   ├── src/pages/index.astro
│   ├── src/pages/articles/
│   ├── src/pages/cases.astro
│   ├── src/layouts/ArticleLayout.astro
│   └── src/components/Share.astro
├── .env.example
├── vercel.json
├── HANDOFF.md
└── README.md
```

---

# 4. Frontend structure

## `/`

Homepage:

```text
Blog
  Articles
    featured latest article
    remaining article cards

  Cases
    case cards
```

The homepage reads directly from both Astro content collections. No hardcoded fake cases are used.

Each case gets a stable anchor:

```text
/#case-<slug>
```

There is no invented `/cases/<slug>` detail route. The original project only needed a cases section/list, so case publication points to the real homepage anchor.

## `/articles`

Simple article archive retained from the baseline project.

## `/cases`

Simple case archive retained from the baseline project.

## `/articles/<slug>`

The original rich article reader is preserved:

- H1 article title;
- author/date;
- highlighted Answer-First `Key Takeaways` block;
- Markdown H2/H3 body;
- Telegram CTA;
- rich share component:
  - native device share;
  - WhatsApp;
  - Telegram;
  - LinkedIn;
  - Threads;
  - Copy Link;
- `TechArticle` JSON-LD.

This matches the TЗ requirements for Answer-First content, Schema.org, CTA and social sharing.

---

# 5. Markdown content

GitHub Markdown is the persistent database.

## Article

```md
---
title: "Article title"
slug: "article-title"
date: "2026-08-10"
keyTakeaways: "Three or four concise sentences."
author: "Pro Personal Agency"
---

## Section

Article body...

### Subsection

More content...
```

## Case

```md
---
title: "Case title"
slug: "case-title"
date: "2026-08-10"
description: "Short description for card"
client: "Optional client"
result: "Optional result"
---

Full case notes/content...
```

---

# 6. Telegram CMS — buttons, not commands

The author does not use `/publish`, `/help`, `/id`, etc.

The bot uses a persistent reply keyboard:

```text
📝 New article     💼 New case
⚙️ Status          🆔 My ID      ❓ Help
```

Telegram's native first **Start** button internally sends `/start`; the code accepts this only to reveal the keyboard. No slash commands are registered, exposed or required. `/api/setup` deletes any old registered commands and resets an old custom menu button when the webhook is registered.

## Publish article

Tap:

```text
📝 New article
```

Reply to the prompt:

```text
Article title

Article body...
```

Optional manual summary:

```text
Article title

Key Takeaways: Sentence one. Sentence two. Sentence three.

Article body...
```

If Key Takeaways are absent and `ANTHROPIC_API_KEY` is configured, Claude generates them.

Preview buttons:

```text
✅ Publish article    ❌ Cancel
✍️ Edit Key Takeaways    ♻️ Regenerate
```

Publish commits:

```text
astro/src/content/articles/YYYY-MM-DD-slug.md
```

## Publish case

Tap:

```text
💼 New case
```

Reply:

```text
Case title

Case body...
```

Preview buttons:

```text
✅ Publish case    ❌ Cancel
```

Publish commits:

```text
astro/src/content/cases/YYYY-MM-DD-slug.md
```

After deployment the bot links to:

```text
https://DOMAIN/#case-<slug>
```

## Why no database is needed

The preview is sent as a Telegram reply to the original submission. Telegram includes the replied-to message in the callback message, so Publish can reconstruct the original content without storing a draft session in Redis/Postgres.

---

# 7. Claude / Anthropic

Recommended production setup:

```text
ANTHROPIC_API_KEY=<secret>
ANTHROPIC_MODEL=claude-sonnet-5
```

Both belong in **Vercel Environment Variables**, never in GitHub/frontend code.

Claude is used in two places.

## A. Key Takeaways

If an article sent through Telegram has no manual Key Takeaways, `/api/telegram` calls Claude and stores the generated summary in the Markdown committed to GitHub.

If someone manually commits an article without `keyTakeaways`, build-time generation fills it in the Vercel build copy before Astro validates/renders content.

The build-time write is ephemeral; it is not committed back to GitHub.

## B. `/llms.txt`

During every build, `astro/scripts/generate-llms.mjs` reads the Markdown documents and asks Claude to return one concise llms-compatible resource line for each document.

The script then deterministically assembles one root file:

```text
/llms.txt
```

Crawler requests do **not** call Claude at runtime. `llms.txt` is already static in the deployment.

If Anthropic is temporarily unavailable or the key has not yet been added, the build still succeeds using deterministic Markdown-derived summaries. This keeps the site deployable during infrastructure setup. Production should still configure the Anthropic key to use the requested Claude summarization.

---

# 8. `/llms-full.txt`

`/llms-full.txt` does not need Claude.

The build concatenates the complete Markdown-derived article/case corpus with source URLs.

Article entries point to:

```text
/articles/<slug>
```

Case entries point to:

```text
/#case-<slug>
```

No `llms` link is displayed to human visitors.

---

# 9. Build lifecycle

`vercel.json` runs:

```text
cd astro && npm install
cd astro && npm run build
```

`npm run build` automatically invokes:

```text
prebuild -> node scripts/generate-llms.mjs
build    -> astro build
```

Generated static outputs include:

```text
/
/articles
/articles/<slug>
/cases
/llms.txt
/llms-full.txt
/sitemap.xml
/robots.txt
```

The sitemap contains only real HTML routes. It does not advertise nonexistent case-detail routes.

---

# 10. Vercel Environment Variables

## Secrets

These must be stored only in Vercel:

| Variable | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | authenticate our calls to Telegram |
| `ANTHROPIC_API_KEY` | Claude API |
| `GITHUB_TOKEN` | write Markdown to GitHub |
| `WEBHOOK_SECRET` | authenticate Telegram webhook requests |
| `SETUP_SECRET` | protect `/api/setup` mutations |

## Configuration

| Variable | Purpose | Typical value |
|---|---|---|
| `ANTHROPIC_MODEL` | Claude model | `claude-sonnet-5` |
| `GITHUB_OWNER` | repository owner | `dusy4` before handoff |
| `GITHUB_REPO` | repository name | `blogpropersonal` |
| `GITHUB_BRANCH` | publish branch | `main` |
| `ADMIN_ID` | Telegram admin ID | numeric |
| `ALLOWED_IDS` | additional publishers | comma-separated IDs |
| `SITE_URL` | final production origin | `https://blog.example.com` |
| `TELEGRAM_CHANNEL_URL` | public CTA destination | `https://t.me/...` |
| `DEFAULT_AUTHOR` | byline | `Pro Personal Agency` |

Do not put real secrets in `.env.example`, README, source code, Telegram messages or GitHub Actions logs.

---

# 11. GitHub token

Vercel's GitHub deployment integration does not automatically give `/api/telegram` permission to create Markdown files.

Create a client-owned **fine-grained PAT** scoped only to the blog repository with:

```text
Repository permissions
  Contents: Read and write
```

Store it as:

```text
GITHUB_TOKEN
```

The Function uses GitHub's Contents API to create/update `.md` files.

---

# 12. Webhook registration

After production env vars and final `SITE_URL` are configured, open:

```text
https://DOMAIN/api/setup
```

Enter `SETUP_SECRET` and press:

```text
Register / re-register webhook
```

The setup Function:

1. calls Telegram `setWebhook`;
2. registers `https://DOMAIN/api/telegram`;
3. passes `WEBHOOK_SECRET` as Telegram `secret_token`;
4. deletes old bot command registrations;
5. resets the Telegram menu button to default;
6. displays current webhook status.

The setup page can also check status or delete the webhook.

---

# 13. What requires webhook re-registration

| Changed value | Redeploy | Re-register webhook |
|---|---:|---:|
| `SITE_URL` / domain | yes | **yes** |
| `TELEGRAM_BOT_TOKEN` | yes | **yes** |
| `WEBHOOK_SECRET` | yes | **yes** |
| `SETUP_SECRET` | yes | no |
| `ANTHROPIC_API_KEY` | yes | no |
| `ANTHROPIC_MODEL` | yes | no |
| `GITHUB_TOKEN` | yes | no |
| `GITHUB_OWNER` / `GITHUB_REPO` | yes | no |
| `ADMIN_ID` / `ALLOWED_IDS` | yes | no |
| `TELEGRAM_CHANNEL_URL` | yes | no |

Rule: re-register only when Telegram's target URL, bot identity or webhook secret changes.

---

# 14. Initial production setup

Recommended order:

1. Push/import the repository to GitHub.
2. Create/import the Vercel project from that repository.
3. Create Telegram bot/token.
4. Create Anthropic API key.
5. Create fine-grained GitHub PAT.
6. Generate `WEBHOOK_SECRET` and `SETUP_SECRET`.
7. Add Vercel Production Environment Variables.
8. Set final domain and `SITE_URL`.
9. Redeploy.
10. Open `/api/setup` and register webhook.
11. Open Telegram bot and press native Start.
12. Tap `🆔 My ID`.
13. Set `ADMIN_ID` in Vercel.
14. Redeploy.
15. Publish test article.
16. Verify GitHub commit → Vercel deployment → article page.
17. Publish test case.
18. Verify case appears on homepage.
19. Verify `/llms.txt`, `/llms-full.txt`, `/sitemap.xml` and article JSON-LD.

---

# 15. Client handoff

The codebase should not need rewriting during handoff. Replace ownership and credentials.

## GitHub transfer

After repository ownership changes:

```text
GITHUB_OWNER=<client>
GITHUB_REPO=<repo>
GITHUB_BRANCH=main
GITHUB_TOKEN=<client-owned PAT>
```

Also ensure the client's Vercel project is connected to the same repository/branch.

## New domain

1. Attach domain in Vercel.
2. Configure DNS.
3. Set:

```text
SITE_URL=https://blog.client.com
```

4. Redeploy.
5. `/api/setup` → Register / re-register webhook.

## New Telegram bot

1. Replace `TELEGRAM_BOT_TOKEN`.
2. Redeploy.
3. `/api/setup` → Register webhook.
4. Start the new bot.
5. Re-check `ADMIN_ID` / `ALLOWED_IDS`.

## New Anthropic key

Replace:

```text
ANTHROPIC_API_KEY
```

Redeploy. No Telegram webhook change required.

## Rotate webhook secret

Replace `WEBHOOK_SECRET`, redeploy, then re-register the webhook. If you forget the second step, Telegram continues sending the old secret and `/api/telegram` returns 401.

See [`HANDOFF.md`](./HANDOFF.md) for the operational checklist.

---

# 16. Security boundaries

Public URLs:

```text
/
/articles/*
/cases
/llms.txt
/llms-full.txt
/sitemap.xml
/robots.txt
/api/telegram
/api/setup
```

`/api/telegram` being public is normal. Security comes from Telegram's secret-token header verification.

`/api/setup` being public is also acceptable because every mutation requires `SETUP_SECRET`.

Never expose:

```text
TELEGRAM_BOT_TOKEN
ANTHROPIC_API_KEY
GITHUB_TOKEN
WEBHOOK_SECRET
SETUP_SECRET
```

---

# 17. Troubleshooting

## Bot does not respond

1. Open `/api/setup`.
2. Check webhook status.
3. Confirm webhook URL equals `SITE_URL + /api/telegram`.
4. Check Telegram `last_error_message`.
5. Confirm Vercel deployment protection does not block Telegram.

## `/api/telegram` returns 401

`WEBHOOK_SECRET` in Vercel differs from the secret stored by Telegram.

Fix:

1. redeploy with correct secret;
2. `/api/setup` → Register / re-register.

## Publishing is locked

`🆔 My ID` works even before authorization. Put the returned ID into:

```text
ADMIN_ID=<number>
```

or add it to:

```text
ALLOWED_IDS=123,456
```

Then redeploy. No webhook re-registration.

## GitHub 401/403

Check:

- PAT still valid;
- selected repository is correct;
- `Contents: Read and write` permission;
- `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`.

## Markdown commits but Vercel does not deploy

The Telegram/GitHub path succeeded; the Vercel Git integration is misconfigured. Ensure the project watches the same repo/branch that the bot writes to.

## Anthropic is missing/down

Telegram-generated Key Takeaways require the API key when the article has no manual summary. Build-time `llms.txt` has a deterministic fallback so an Anthropic outage does not take the whole site offline.

## `llms.txt` appears stale

It is a build artifact. Verify a new GitHub commit produced a successful Vercel deployment and that you are opening the current production alias, not an older immutable deployment URL.

---

# 18. TЗ compliance map

| Requirement | Implementation |
|---|---|
| Astro SSG | `astro/` static build |
| Tailwind | `astro/tailwind.config.mjs` + global styles |
| Markdown content | `src/content/articles`, `src/content/cases` |
| GitHub + Vercel | repository + `vercel.json` |
| homepage articles + cases | `/` contains both direct sections |
| Answer-First | original `ArticleLayout.astro` Key Takeaways block |
| H1/H2/H3 | article layout + Markdown headings |
| TechArticle/Article schema | `TechArticle` JSON-LD on article pages |
| `/llms.txt` | build-time Claude summaries |
| `/llms-full.txt` | direct full Markdown aggregation |
| Telegram CTA | under each article |
| social sharing | original rich `Share.astro` |
| Telegram publishing | `/api/telegram` button CMS |
| GitHub `.md` creation | Contents API |
| auto deploy | GitHub → Vercel integration |
| no typed commands | persistent keyboard + inline buttons |
| client handoff | all credentials/config externalized to Vercel |

The TЗ requires the site to be Astro/SSG, Markdown-based, contain Answer-First Key Takeaways, JSON-LD, root `/llms.txt`, Telegram CTA/share buttons, a cases section, Telegram → GitHub → Vercel publication automation, and transferable GitHub/domain ownership. The implementation above maps directly to those requirements.

---

# 19. Definition of done before client handoff

- [ ] client owns GitHub repo;
- [ ] client owns Vercel project;
- [ ] Vercel watches correct `main` branch;
- [ ] client owns Telegram bot/token;
- [ ] client owns Anthropic key;
- [ ] client owns GitHub PAT;
- [ ] final `SITE_URL` is set;
- [ ] webhook registered on final URL;
- [ ] button CMS opens after Start;
- [ ] no typed commands required;
- [ ] article publish creates `.md`;
- [ ] case publish creates `.md`;
- [ ] GitHub commit triggers production deployment;
- [ ] homepage shows articles + cases only;
- [ ] article reading page has Key Takeaways + share + Telegram CTA;
- [ ] article HTML contains `TechArticle` JSON-LD;
- [ ] `/llms.txt` returns 200;
- [ ] `/llms-full.txt` returns 200;
- [ ] `/sitemap.xml` contains only real routes;
- [ ] old developer credentials are revoked after acceptance.
