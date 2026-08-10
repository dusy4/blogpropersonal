# Client Handoff — operational runbook

Цей файл — покрокова інструкція передачі готового блогу в інфраструктуру клієнта. Після handoff production не повинен залежати від GitHub/Vercel/Telegram/Anthropic credentials розробника.

Ніякий VPS, daemon або database не потрібен.

---

# A. Що передається

Клієнт повинен контролювати:

- GitHub repository;
- Vercel project;
- Telegram bot;
- Anthropic API key;
- GitHub publishing token;
- domain/DNS, якщо є custom domain.

Site structure після handoff не змінюється:

```text
/                         blog homepage: Articles + Cases
/articles                 article archive
/articles/<slug>          article reader
/cases                    case archive
/llms.txt                 machine-facing summary
/llms-full.txt            machine-facing full corpus
/api/telegram             Telegram webhook
/api/setup                protected webhook setup
```

Cases на homepage мають stable anchors:

```text
/#case-<slug>
```

Немає `/cases/<slug>` route.

---

# B. GitHub

## B1. Transfer repository

Використайте GitHub **Transfer ownership** або перенесіть repository/history у client-owned repo.

Після transfer визначте:

```text
GITHUB_OWNER=<client owner>
GITHUB_REPO=<repo name>
GITHUB_BRANCH=main
```

## B2. GitHub token для Telegram CMS

Створіть **client-owned fine-grained Personal Access Token**.

Repository access:

```text
Only selected repositories -> production blog repo
```

Permission:

```text
Contents -> Read and write
```

Зберегти у Vercel як:

```text
GITHUB_TOKEN=<token>
```

Не вставляти token у repository, README або Telegram.

---

# C. Telegram

Через BotFather створіть або передайте production bot.

Отримайте:

```text
TELEGRAM_BOT_TOKEN=<token>
```

Token зберігається в Vercel Environment Variables.

Content management працює кнопками:

```text
📝 New article     💼 New case
⚙️ Status          🆔 My ID      ❓ Help
```

Slash commands не використовуються як CMS interface. Telegram native Start може технічно надсилати `/start`, але користувач нічого не вводить вручну.

---

# D. Anthropic

У client Anthropic Console створіть API key:

```text
ANTHROPIC_API_KEY=<client key>
ANTHROPIC_MODEL=claude-sonnet-5
```

Key потрібен для:

- automatic Key Takeaways у Telegram;
- Claude summarization під час генерації `/llms.txt`.

`/llms-full.txt` збирається напряму з Markdown і Claude не потребує.

---

# E. Generate secrets

Створіть два незалежні випадкові значення.

Наприклад:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Зберегти як:

```text
WEBHOOK_SECRET=<first value>
SETUP_SECRET=<second value>
```

`WEBHOOK_SECRET` передається Telegram при `setWebhook`. Telegram потім повертає його в header `X-Telegram-Bot-Api-Secret-Token` кожного webhook request.

`SETUP_SECRET` використовується тільки людиною на `/api/setup`.

---

# F. Vercel

## F1. Create/import project

У client Vercel account:

1. Add New -> Project.
2. Import client GitHub repository.
3. Production branch = `main`.
4. `vercel.json` залишити source of truth для install/build/output settings.

## F2. Production Environment Variables

Project -> Settings -> Environment Variables -> Production.

Додати:

```text
TELEGRAM_BOT_TOKEN=<client bot token>
ANTHROPIC_API_KEY=<client Anthropic key>
ANTHROPIC_MODEL=claude-sonnet-5
GITHUB_TOKEN=<client fine-grained PAT>
GITHUB_OWNER=<client GitHub owner>
GITHUB_REPO=<repo name>
GITHUB_BRANCH=main
WEBHOOK_SECRET=<generated secret>
SETUP_SECRET=<generated setup secret>
ADMIN_ID=
ALLOWED_IDS=
SITE_URL=<final or temporary production URL>
TELEGRAM_CHANNEL_URL=<public Telegram channel URL>
DEFAULT_AUTHOR=Pro Personal Agency
```

Do **not** set in Production:

```text
SKIP_LLM_GENERATION=1
```

## F3. Deploy

Deploy/redeploy after env variables are saved.

The site can technically build with deterministic `llms.txt` fallback if Anthropic is missing, but production acceptance should have the real Anthropic key configured.

---

# G. Domain

If using custom domain:

1. Vercel -> Project -> Settings -> Domains.
2. Add `blog.client.com` or final domain.
3. Apply DNS records exactly as Vercel requests.
4. Wait for Vercel to mark domain valid.
5. Set:

```text
SITE_URL=https://blog.client.com
```

6. Redeploy.

`SITE_URL` controls:

- article URLs;
- Telegram webhook URL;
- bot publish links;
- links in `llms.txt`;
- sitemap/robots source URLs.

After changing `SITE_URL`, webhook must be re-registered.

---

# H. Register / re-register Telegram webhook

Open:

```text
https://FINAL_DOMAIN/api/setup
```

Enter:

```text
SETUP_SECRET
```

Click:

```text
Register / re-register webhook
```

Expected webhook:

```text
https://FINAL_DOMAIN/api/telegram
```

Registration performs:

1. Telegram `setWebhook`;
2. `secret_token = WEBHOOK_SECRET`;
3. old bot commands deletion;
4. Telegram custom menu reset;
5. webhook status readback.

`/api/setup` can also Check status or Delete webhook.

---

# I. Configure admin

1. Open production bot.
2. Tap Telegram native **Start**.
3. Tap:

```text
🆔 My ID
```

4. Copy returned number.
5. Set in Vercel:

```text
ADMIN_ID=<number>
```

6. Redeploy.

No webhook re-registration is needed after changing `ADMIN_ID`.

Additional publishers:

```text
ALLOWED_IDS=111111111,222222222
```

---

# J. End-to-end acceptance test

## J1. Article

Telegram -> `📝 New article`.

Send:

```text
Handoff test article

## Test heading

This article verifies the production publishing pipeline.
```

Do not provide Key Takeaways, so Anthropic is exercised.

Expected:

1. Claude generates 3–4 sentence Key Takeaways;
2. preview appears;
3. `✅ Publish article` works;
4. GitHub gets `.md` in `astro/src/content/articles/`;
5. GitHub commit triggers Vercel deployment;
6. deployment becomes READY;
7. homepage shows article;
8. `/articles/<slug>` opens;
9. Key Takeaways appear above body;
10. original share buttons are present;
11. Telegram CTA is under article;
12. source contains `TechArticle` JSON-LD;
13. `/llms.txt` contains article;
14. `/llms-full.txt` contains full Markdown.

## J2. Case

Telegram -> `💼 New case`.

Publish a test case.

Expected:

1. `.md` appears in `astro/src/content/cases/`;
2. Vercel deployment runs;
3. case appears in **Cases section on the same homepage**;
4. bot link points to:

```text
https://FINAL_DOMAIN/#case-<slug>
```

5. `/cases` archive also contains the case;
6. `/llms.txt` contains case summary;
7. `/llms-full.txt` contains case Markdown.

---

# K. AI/indexing verification

Open:

```text
https://FINAL_DOMAIN/llms.txt
https://FINAL_DOMAIN/llms-full.txt
https://FINAL_DOMAIN/sitemap.xml
https://FINAL_DOMAIN/robots.txt
```

Human frontend should **not** display `llms.txt` promotional links.

Open an article, View Source, search:

```text
application/ld+json
TechArticle
```

Sitemap should include real pages only:

```text
/
/articles
/articles/<slug>
/cases
```

It must not contain `/cases/<slug>` because that route does not exist.

---

# L. Replacement matrix

## Change domain

Update:

```text
SITE_URL
```

Then:

1. Redeploy.
2. `/api/setup` -> Register / re-register webhook.
3. Check status.

## Change Telegram bot/token

Update:

```text
TELEGRAM_BOT_TOKEN
```

Then:

1. Redeploy.
2. Register webhook again.
3. Start new bot.
4. Re-check `ADMIN_ID`/`ALLOWED_IDS`.

## Rotate WEBHOOK_SECRET

Update:

```text
WEBHOOK_SECRET
```

Then:

1. Redeploy.
2. Register webhook again.

If step 2 is skipped, Telegram keeps sending the old secret and Vercel returns 401.

## Rotate SETUP_SECRET

Update `SETUP_SECRET`, then redeploy.

No webhook registration required.

## Replace Anthropic key

Update:

```text
ANTHROPIC_API_KEY
```

Redeploy only.

## Change Claude model

Update:

```text
ANTHROPIC_MODEL
```

Redeploy only.

## Transfer/change GitHub repo

Update:

```text
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH
GITHUB_TOKEN
```

Also reconnect Vercel Git integration to the same target repository/branch.

Redeploy and test Telegram publication.

No webhook re-registration unless domain, bot or webhook secret also changed.

## Add/remove publishers

Update:

```text
ADMIN_ID
ALLOWED_IDS
```

Redeploy only.

---

# M. Troubleshooting

## Bot does not answer

1. `/api/setup` -> Check webhook status.
2. Confirm URL matches final `SITE_URL`.
3. Read Telegram `last_error_message`.
4. Ensure Vercel Deployment Protection does not block Telegram.

## Webhook returns 401

Vercel `WEBHOOK_SECRET` and Telegram stored secret differ.

Redeploy and re-register webhook.

## GitHub 401/403

Check PAT:

- not expired/revoked;
- correct selected repository;
- Contents Read and write;
- correct `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`.

## Markdown appears in GitHub but site does not update

Telegram/GitHub worked. Check that Vercel Git integration watches the exact repo/branch the bot writes to.

## Claude fails

Check:

```text
ANTHROPIC_API_KEY
ANTHROPIC_MODEL
```

Article publication without manual Key Takeaways needs Anthropic. Build-time `llms.txt` has deterministic fallback, so an Anthropic outage should not make the static site undeployable.

---

# N. Final ownership checklist

Before developer access is removed, client confirms:

- [ ] GitHub repo is client-owned;
- [ ] Vercel project is client-owned;
- [ ] final domain is client-controlled;
- [ ] Vercel project watches correct repository/branch;
- [ ] `GITHUB_TOKEN` belongs to client;
- [ ] `ANTHROPIC_API_KEY` belongs to client;
- [ ] Telegram bot/token belongs to client;
- [ ] client has `SETUP_SECRET` stored securely;
- [ ] webhook status shows final production URL;
- [ ] button CMS works without typed commands;
- [ ] test article publication passed;
- [ ] test case publication passed;
- [ ] homepage contains only blog + Articles + Cases content structure;
- [ ] article reader/share/CTA works;
- [ ] `llms.txt` works but is not promoted in frontend;
- [ ] `llms-full.txt` works;
- [ ] sitemap contains only real routes;
- [ ] JSON-LD is present;
- [ ] developer secrets removed from Vercel;
- [ ] developer GitHub/Anthropic tokens revoked.

After this there is no runtime dependency on developer infrastructure.
