# Client Handoff — idiot-proof runbook

Це checklist для ситуації: код уже готовий, тепер треба перенести все на GitHub/Vercel/Telegram/Anthropic клієнта так, щоб після handoff розробник міг видалити свої credentials.

## Перед початком

Потрібні доступи клієнта до:

- GitHub;
- Vercel;
- Telegram / BotFather;
- Anthropic Console;
- DNS/domain provider, якщо використовується custom domain.

Ніякий VPS не потрібен.

---

# A. GitHub

## A1. Repository

Варіант 1 — Transfer ownership існуючого repo на клієнта.

Варіант 2 — створити новий client repo і перенести code history/content.

Після цього фінальний repo має виглядати як:

```text
CLIENT_OWNER/blogpropersonal
```

Запишіть:

```text
GITHUB_OWNER=CLIENT_OWNER
GITHUB_REPO=blogpropersonal
GITHUB_BRANCH=main
```

## A2. GitHub publishing token

На GitHub account клієнта створити fine-grained Personal Access Token.

Scope:

- Repository access: тільки production blog repo;
- Repository permissions:
  - Contents: Read and write.

Збережіть token тимчасово — він буде вставлений у Vercel як `GITHUB_TOKEN`.

Не класти token у `.env` в GitHub, README, Telegram або source code.

---

# B. Telegram

## B1. Bot

Через BotFather отримати production bot token.

Записати:

```text
TELEGRAM_BOT_TOKEN=...
```

Можна використати старого бота або створити нового. Якщо token/bot змінився — webhook треба register заново після deployment.

---

# C. Anthropic

У Anthropic Console створити API key клієнта.

```text
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-sonnet-5
```

Не використовувати developer key після handoff.

---

# D. Secrets

Згенерувати два випадкові secrets.

Наприклад:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Перший:

```text
WEBHOOK_SECRET=<value>
```

Другий:

```text
SETUP_SECRET=<value>
```

`WEBHOOK_SECRET` Telegram буде надсилати у header кожного webhook request.

`SETUP_SECRET` потрібен людині лише для `/api/setup`.

---

# E. Vercel

## E1. Import repository

У client Vercel account:

1. Add New -> Project.
2. Import client GitHub repository.
3. Не міняти build commands вручну, якщо `vercel.json` прочитався правильно.
4. `vercel.json` сам виконує build з `astro/`.

## E2. Production Environment Variables

Project -> Settings -> Environment Variables -> Production.

Додати:

```text
TELEGRAM_BOT_TOKEN=<client bot token>
ANTHROPIC_API_KEY=<client Anthropic key>
ANTHROPIC_MODEL=claude-sonnet-5
GITHUB_TOKEN=<client GitHub fine-grained PAT>
GITHUB_OWNER=<client GitHub owner>
GITHUB_REPO=<repo name>
GITHUB_BRANCH=main
WEBHOOK_SECRET=<generated secret>
SETUP_SECRET=<generated setup secret>
ADMIN_ID=
ALLOWED_IDS=
SITE_URL=<temporary Vercel production URL or final domain>
TELEGRAM_CHANNEL_URL=<public Telegram CTA URL>
DEFAULT_AUTHOR=Pro Personal Agency
```

Do not set:

```text
SKIP_LLM_GENERATION=1
```

in Production.

## E3. Deploy

Deploy project.

If build fails because `SITE_URL`/Anthropic key is missing, fix Production Environment Variables and Redeploy.

---

# F. Final domain

Якщо custom domain потрібен:

1. Vercel -> Project -> Settings -> Domains.
2. Add final domain, e.g. `blog.client.com`.
3. Update DNS exactly as Vercel asks.
4. Wait until Vercel shows domain as valid.
5. Update:

```text
SITE_URL=https://blog.client.com
```

6. Redeploy.

Do not register Telegram webhook to an old/temporary domain if you already know the final domain. Якщо register був зроблений раніше — просто re-register після зміни `SITE_URL`.

---

# G. Register Telegram webhook

Після production deployment відкрийте:

```text
https://FINAL_DOMAIN/api/setup
```

У password field вставити `SETUP_SECRET`.

Press:

```text
Register / re-register webhook
```

Expected status output повинен містити production URL:

```text
https://FINAL_DOMAIN/api/telegram
```

Ця дія робить Telegram API `setWebhook` і передає Telegram `WEBHOOK_SECRET`.

Telegram тепер знає:

- куди відправляти updates;
- який secret header додавати.

---

# H. Get ADMIN_ID

1. Open production bot in Telegram.
2. Tap native **Start**.
3. Bot покаже menu buttons.
4. Tap `🆔 My ID`.
5. Copy number.
6. Vercel -> Environment Variables:

```text
ADMIN_ID=<number>
```

7. Redeploy.

Webhook re-registration **не потрібна** після зміни `ADMIN_ID`.

Для додаткових авторів:

```text
ALLOWED_IDS=111111111,222222222,333333333
```

Для Telegram channel ID може бути negative number.

---

# I. End-to-end acceptance test

## I1. Article

Telegram -> `📝 New article`.

Reply:

```text
Handoff test article

## Test heading

This article verifies the production publishing pipeline.
```

Do not provide Key Takeaways — цим тестуємо Anthropic.

Expected:

1. bot generates Key Takeaways;
2. preview appears;
3. Publish button works;
4. GitHub gets new `.md` in `astro/src/content/articles/`;
5. Vercel detects commit;
6. deployment succeeds;
7. article appears on homepage;
8. article page opens;
9. Key Takeaways visible;
10. `/llms.txt` contains article entry;
11. `/llms-full.txt` contains article Markdown.

## I2. Case

Telegram -> `💼 New case`.

Publish a test case.

Expected:

- `.md` in `astro/src/content/cases/`;
- case card in **Cases section on same homepage**;
- `/cases/<slug>` opens.

---

# J. Verify AI/indexing outputs

Open:

```text
https://FINAL_DOMAIN/llms.txt
https://FINAL_DOMAIN/llms-full.txt
https://FINAL_DOMAIN/sitemap.xml
https://FINAL_DOMAIN/robots.txt
```

View source of an article and search for:

```text
application/ld+json
TechArticle
```

---

# K. What to change when something is replaced

## New domain

Change:

```text
SITE_URL
```

Then:

1. Redeploy.
2. `/api/setup` -> Register / re-register webhook.

## New Telegram bot/token

Change:

```text
TELEGRAM_BOT_TOKEN
```

Then:

1. Redeploy.
2. `/api/setup` -> Register / re-register webhook.
3. Start new bot.
4. Re-check `ADMIN_ID`/allowed users.

## Rotate WEBHOOK_SECRET

Change:

```text
WEBHOOK_SECRET
```

Then:

1. Redeploy.
2. Register / re-register webhook.

Without step 2 Telegram still sends the old secret and Vercel answers `401`.

## Rotate SETUP_SECRET

Change:

```text
SETUP_SECRET
```

Then Redeploy only.

No webhook re-registration required.

## New Anthropic key

Change:

```text
ANTHROPIC_API_KEY
```

Redeploy.

No webhook re-registration.

## Change Claude model

Change:

```text
ANTHROPIC_MODEL
```

Redeploy.

No webhook re-registration.

## New GitHub repo/owner

Change:

```text
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH
GITHUB_TOKEN
```

Then:

1. ensure Vercel Git integration points to same repo;
2. redeploy;
3. test Telegram publication.

No webhook re-registration unless domain/bot/webhook secret also changed.

---

# L. Before developer leaves the project

Client confirms:

- [ ] repo is client-owned;
- [ ] Vercel project is client-owned;
- [ ] domain is client-controlled;
- [ ] `GITHUB_TOKEN` belongs to client;
- [ ] `ANTHROPIC_API_KEY` belongs to client;
- [ ] Telegram bot/token belongs to client;
- [ ] client knows `SETUP_SECRET` storage location;
- [ ] webhook status is green;
- [ ] article test passed;
- [ ] case test passed;
- [ ] `llms.txt` passed;
- [ ] `llms-full.txt` passed;
- [ ] JSON-LD passed;
- [ ] old developer credentials removed from Vercel;
- [ ] old developer GitHub/Anthropic tokens revoked.

At this point the system has no technical dependency on the developer's infrastructure.
