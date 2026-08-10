# Client Handoff — operational runbook

ProPersonal Blog працює без VPS, daemon, Redis або database. Source of truth — GitHub Markdown; Vercel хостить Astro та serverless Telegram webhook.

## 1. Що передається клієнту

Клієнт повинен контролювати:

- GitHub repository;
- Vercel project;
- Telegram bot;
- public Telegram channel URL для CTA сайту;
- optional Telegram source channel(s) для автоматичної публікації;
- Anthropic API key;
- GitHub publishing token;
- custom domain / DNS, якщо використовується.

Основні routes:

```text
/                                  homepage: latest article + Articles + Cases
/articles                          archive
/articles/<slug>                   article reader
/cases                             cases archive
/llms.txt                          machine-facing summary
/llms-full.txt                     machine-facing full content
/api/telegram                      Telegram webhook
/api/set-webhook?token=<secret>    one-shot protected webhook registration
```

Старого public `/api/setup` UI немає.

## 2. GitHub

Після transfer repository змініть у Vercel, якщо потрібно:

```text
GITHUB_OWNER=<client owner>
GITHUB_REPO=<repo name>
GITHUB_BRANCH=main
```

Створіть client-owned fine-grained PAT тільки для production repo з permission:

```text
Contents: Read and write
```

і збережіть:

```text
GITHUB_TOKEN=<token>
```

## 3. Telegram bot

Створіть або передайте production bot через BotFather та встановіть у Vercel:

```text
TELEGRAM_BOT_TOKEN=<bot token>
```

CMS працює кнопками:

```text
📝 Нова стаття     💼 Новий кейс
⚙️ Стан            🆔 Мій ID      ❓ Допомога
```

Telegram native Start технічно надсилає `/start`; вручну slash commands для CMS не потрібні.

## 4. Telegram access model

Є тільки дві access variables.

### Users, які можуть користуватися ботом

Дозволити всім:

```text
TELEGRAM_ALLOWED_USER_IDS=0
```

Або restrict:

```text
TELEGRAM_ALLOWED_USER_IDS=111111111,222222222
```

Порожнє значення означає: ніхто не може публікувати через private bot CMS.

### Channels, з яких дозволена автоматична публікація

Дозволити будь-який channel, де bot отримує `channel_post`:

```text
TELEGRAM_SOURCE_CHANNEL_IDS=0
```

Або restrict:

```text
TELEGRAM_SOURCE_CHANNEL_IDS=-1001234567890,-1009876543210
```

Порожнє значення означає: channel auto-publishing disabled.

`ADMIN_ID` не використовується і не потрібен.

`⚙️ Стан` доступний allowed users і показує лише safe summary: чи заповнений runtime config та чи access відкритий/обмежений. Secrets і списки ID не виводяться.

## 5. Public Telegram URL

Це окремо від source channels:

```text
TELEGRAM_CHANNEL_URL=https://t.me/public_channel
```

Використовується тільки в website header/footer/article CTA. Не визначає право публікації.

## 6. Private source channel

1. Додайте production bot у Telegram channel.
2. Webhook повинен мати `channel_post` в `allowed_updates`.
3. Для будь-якого channel:

```text
TELEGRAM_SOURCE_CHANNEL_IDS=0
```

4. Для allowlist конкретного private channel, якщо ID невідомий:
   - залиште `TELEGRAM_SOURCE_CHANNEL_IDS` порожнім;
   - зробіть test post;
   - відкрийте Vercel Runtime Logs для `/api/telegram`;
   - знайдіть рядок виду:

```text
Ignored channel_post from unconfigured channel -1001234567890
```

5. Встановіть знайдений ID та redeploy.
6. Готова стаття в channel:

```text
Заголовок статті

Текст статті...
```

Pipeline:

```text
Telegram channel_post
-> Vercel /api/telegram
-> Claude Key Takeaways якщо їх немає
-> GitHub Markdown commit
-> Vercel auto-deploy
-> article on site
```

Bot не мусить писати confirmation назад у source channel.

## 7. Anthropic

```text
ANTHROPIC_API_KEY=<client key>
ANTHROPIC_MODEL=claude-sonnet-5
```

Claude використовується для:

- Key Takeaways, якщо автор їх не задав;
- build-time summaries для `/llms.txt`.

`/llms-full.txt` збирається з Markdown без Claude. Build має deterministic fallback для AI files, якщо Anthropic недоступний.

## 8. Webhook secrets

Створіть два різні random secrets, наприклад:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Vercel:

```text
WEBHOOK_SECRET=<secret 1>
SETUP_SECRET=<secret 2>
```

`WEBHOOK_SECRET` передається Telegram як `setWebhook.secret_token`. Telegram повертає його у header:

```text
X-Telegram-Bot-Api-Secret-Token
```

`SETUP_SECRET` використовується тільки для одноразового setup endpoint URL:

```text
/api/set-webhook?token=<SETUP_SECRET>
```

Missing/wrong token повертає `404`.

Повний setup URL вважати секретом. Query token може залишитися в browser history або infrastructure request logs, тому його не пересилати третім особам. Response має `Cache-Control: no-store` і `Referrer-Policy: no-referrer`.

## 9. Production env baseline

```text
TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_ALLOWED_USER_IDS=0
TELEGRAM_SOURCE_CHANNEL_IDS=0

ANTHROPIC_API_KEY=<client key>
ANTHROPIC_MODEL=claude-sonnet-5

GITHUB_TOKEN=<fine-grained PAT>
GITHUB_OWNER=<owner>
GITHUB_REPO=blogpropersonal
GITHUB_BRANCH=main

WEBHOOK_SECRET=<random secret>
SETUP_SECRET=<random setup secret>

TELEGRAM_CHANNEL_URL=https://t.me/public_channel
DEFAULT_AUTHOR=Pro Personal Agency

SITE_NAME=ProPersonal
SITE_MARK=PP
BLOG_SUBTITLE=Блог про AI-інтеграції та автоматизацію
SITE_DESCRIPTION=Практичні статті та кейси про AI-інтеграції й автоматизацію.
ARTICLES_URL=/articles
CASES_URL=/cases
```

### SITE_URL

На Vercel зазвичай не задавати `SITE_URL`.

Backend/frontend/build resolve URL так:

```text
SITE_URL override
-> VERCEL_PROJECT_PRODUCTION_URL
-> VERCEL_URL
```

Тому `*.vercel.app` production domain працює автоматично. Після підключення production custom domain Vercel production URL використовується автоматично для нових builds/runtime calls.

`SITE_URL` потрібен лише як explicit override, наприклад для non-Vercel deployment або якщо навмисно треба force specific canonical domain.

## 10. First webhook registration

Після того як Vercel env variables встановлені і production redeploy завершений, відкрийте один раз:

```text
https://CURRENT_PRODUCTION_DOMAIN/api/set-webhook?token=<SETUP_SECRET>
```

Valid request автоматично resolve production URL і реєструє в Telegram:

```text
https://CURRENT_PRODUCTION_DOMAIN/api/telegram
```

Registration також:

- передає `WEBHOOK_SECRET` як `secret_token`;
- встановлює `allowed_updates = message, callback_query, channel_post`;
- не видаляє pending Telegram updates при re-registration;
- видаляє registered slash commands;
- reset menu button;
- читає `getWebhookInfo` назад і повертає його JSON response.

У successful response перевірити:

```text
ok: true
current.result.url = https://CURRENT_PRODUCTION_DOMAIN/api/telegram
current.result.allowed_updates contains message, callback_query, channel_post
```

Після цього bot готовий приймати повідомлення через webhook.

## 11. Коли треба re-register webhook

### Змінився bot token

1. Update `TELEGRAM_BOT_TOKEN` у Vercel.
2. Redeploy.
3. Open:

```text
https://CURRENT_PRODUCTION_DOMAIN/api/set-webhook?token=<SETUP_SECRET>
```

4. Add new bot to source channels.
5. Test bot + channel publication.

Old bot має свій власний webhook, доки його не видалити/змінити старим token або не retire bot/token.

### Змінився WEBHOOK_SECRET

1. Update secret.
2. Redeploy.
3. Обов'язково повторно відкрити setup URL.

Інакше Telegram продовжить надсилати старий secret і `/api/telegram` поверне 401.

### Змінився SETUP_SECRET

Redeploy. Новий setup URL використовує новий token. Telegram webhook re-registration не потрібен лише через зміну `SETUP_SECRET`.

### Додано custom domain

Існуючий webhook на `*.vercel.app/api/telegram` продовжує працювати, поки цей Vercel domain активний. Re-register не потрібен для функціональності.

Якщо хочете, щоб Telegram зберіг webhook саме на custom domain, після activation відкрийте setup URL вже на custom domain:

```text
https://CUSTOM_DOMAIN/api/set-webhook?token=<SETUP_SECRET>
```

### Змінилися access vars

```text
TELEGRAM_ALLOWED_USER_IDS
TELEGRAM_SOURCE_CHANNEL_IDS
```

Redeploy only. Webhook re-registration не потрібен.

### Змінився public Telegram URL

```text
TELEGRAM_CHANNEL_URL
```

Redeploy only.

### Змінився GitHub token/repository

Update GitHub envs, verify Vercel Git integration watches the same repo/branch, redeploy and test publication. Telegram webhook change не потрібен.

### Змінився Anthropic key/model

Redeploy only.

## 12. Acceptance tests

### Bot article

1. Open bot.
2. Press `📝 Нова стаття`.
3. Send title + blank line + article.
4. Publish preview.

Expected:

```text
Markdown commit
-> Vercel deploy
-> homepage/archive
-> article reader
-> Key Takeaways
-> TechArticle JSON-LD
-> share buttons
-> Telegram CTA
-> llms.txt / llms-full.txt
```

### Source-channel article

Bot is member of source channel and channel is allowed by `TELEGRAM_SOURCE_CHANNEL_IDS`.

Expected:

```text
channel_post -> Markdown commit -> Vercel deploy -> article appears
```

### Case

1. `💼 Новий кейс`.
2. Fill fields using inline edit buttons.
3. Publish.

Expected: case Markdown -> deploy -> homepage Cases + `/cases`. If `url` exists, card opens external source.

## 13. AIO/indexing verification

Check:

```text
/llms.txt
/llms-full.txt
/sitemap.xml
/robots.txt
```

Human frontend must not promote `llms.txt`.

Article source must contain:

```text
application/ld+json
TechArticle
```

## 14. Troubleshooting

### Bot does not answer

- run the tokenized setup URL again and inspect returned `getWebhookInfo`;
- check Telegram `last_error_message` in the JSON response;
- ensure Deployment Protection does not block `/api/telegram`;
- verify `TELEGRAM_ALLOWED_USER_IDS`; `0` allows everyone.

### Source channel does not publish

- bot is member of channel;
- `channel_post` is in allowed updates;
- verify `TELEGRAM_SOURCE_CHANNEL_IDS`; `0` allows any channel;
- inspect Runtime Logs for channel ID in allowlist mode;
- redeploy after env change.

### Webhook 401

`WEBHOOK_SECRET` differs from Telegram's stored secret. Redeploy and run setup URL again.

### Setup URL returns 404

- wrong/missing `SETUP_SECRET` token;
- `SETUP_SECRET` was changed without using the new value;
- old `/api/setup` route no longer exists by design.

### GitHub 401/403

Verify PAT, selected repository and `Contents: Read and write`.

### Markdown committed but site not updated

Verify Vercel Git integration watches the exact repo/branch where Telegram commits.

### Claude fails

Verify `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`.

## 15. Final ownership checklist

- [ ] GitHub repo client-owned
- [ ] Vercel project client-owned
- [ ] domain client-controlled if custom domain is used
- [ ] Vercel watches correct repo/branch
- [ ] client-owned GitHub token installed
- [ ] client-owned Anthropic key installed
- [ ] client-owned Telegram bot/token installed
- [ ] `TELEGRAM_ALLOWED_USER_IDS` configured
- [ ] `TELEGRAM_SOURCE_CHANNEL_IDS` configured
- [ ] public `TELEGRAM_CHANNEL_URL` configured
- [ ] tokenized setup endpoint returned valid Telegram webhook info
- [ ] bot article test passed
- [ ] source-channel test passed if used
- [ ] case test passed
- [ ] article reader/share/CTA works
- [ ] `/llms.txt` works but is not promoted in frontend
- [ ] `/llms-full.txt` works
- [ ] sitemap contains real routes only
- [ ] JSON-LD present
- [ ] developer secrets removed/revoked
