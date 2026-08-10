# Client Handoff — operational runbook

Цей файл описує повну передачу ProPersonal Blog у client-owned GitHub, Vercel, Telegram та Anthropic infrastructure.

Production не потребує VPS, daemon, Redis або database.

---

# 1. Що передається

Клієнт повинен контролювати:

- GitHub repository;
- Vercel project;
- Telegram bot;
- public Telegram channel URL для CTA сайту;
- optional private/public Telegram source channel(s) для автоматичної публікації;
- Anthropic API key;
- GitHub publishing token;
- custom domain / DNS, якщо використовується.

Основні routes:

```text
/                         homepage: featured article + Articles + Cases
/articles                 archive
/articles/<slug>          article reader
/cases                    cases archive
/llms.txt                 machine-facing summary
/llms-full.txt            machine-facing full content
/api/telegram             Telegram webhook
/api/setup                protected webhook setup
```

---

# 2. GitHub

Transfer repository або перенесіть його в client-owned account/org.

Vercel env:

```text
GITHUB_OWNER=<client owner>
GITHUB_REPO=<repo name>
GITHUB_BRANCH=main
```

Створіть client-owned fine-grained PAT лише для production repo:

```text
Repository permissions
Contents: Read and write
```

Зберегти у Vercel:

```text
GITHUB_TOKEN=<token>
```

---

# 3. Telegram bot

Створіть або передайте production bot через BotFather.

Vercel secret:

```text
TELEGRAM_BOT_TOKEN=<bot token>
```

CMS працює кнопками, а не typed slash commands:

```text
📝 Нова стаття     💼 Новий кейс
⚙️ Стан            🆔 Мій ID      ❓ Допомога
```

Telegram native Start технічно надсилає `/start`; користувач вручну команд не вводить.

---

# 4. Telegram access model

Є дві основні access variables.

## 4.1 Users, які можуть користуватися ботом

Дозволити всім:

```text
TELEGRAM_ALLOWED_USER_IDS=0
```

Дозволити лише конкретних users:

```text
TELEGRAM_ALLOWED_USER_IDS=111111111,222222222
```

Порожній список означає, що новою allowlist-моделлю ніхто не дозволений.

Legacy `ALLOWED_IDS` підтримується тільки як backward-compatible fallback, якщо `TELEGRAM_ALLOWED_USER_IDS` ще не заданий.

## 4.2 Channels, з яких дозволена автоматична публікація

Дозволити будь-який канал, де bot отримує `channel_post`:

```text
TELEGRAM_SOURCE_CHANNEL_IDS=0
```

Дозволити лише конкретні source channels:

```text
TELEGRAM_SOURCE_CHANNEL_IDS=-1001234567890,-1009876543210
```

Порожній список означає: channel auto-publishing disabled.

`0` тут так само є wildcard, як і для users.

## 4.3 ADMIN_ID

```text
ADMIN_ID=<optional telegram user id>
```

`ADMIN_ID` не є основною access variable. Він залишений для backward compatibility та diagnostics-owner поведінки `⚙️ Стан`.

Для нового setup publication access налаштовується через:

```text
TELEGRAM_ALLOWED_USER_IDS
TELEGRAM_SOURCE_CHANNEL_IDS
```

Якщо не потрібен окремий diagnostics owner, `ADMIN_ID` можна залишити порожнім.

---

# 5. Public Telegram URL vs source channels

Це різні речі.

```text
TELEGRAM_CHANNEL_URL=https://t.me/public_channel
```

`TELEGRAM_CHANNEL_URL` використовується лише на сайті: header/footer/article CTA.

Він не дає права публікувати контент.

Source-channel permission задається тільки через:

```text
TELEGRAM_SOURCE_CHANNEL_IDS
```

---

# 6. Як підключити private source channel

1. Додайте production bot у приватний Telegram channel.
2. Webhook має бути зареєстрований з `channel_post` у `allowed_updates`.
3. Якщо хочете дозволити будь-який channel, встановіть:

```text
TELEGRAM_SOURCE_CHANNEL_IDS=0
```

4. Якщо потрібен allowlist конкретних channels, але numeric ID невідомий:
   - тимчасово залиште `TELEGRAM_SOURCE_CHANNEL_IDS` порожнім;
   - зробіть один test post у channel;
   - відкрийте Vercel Runtime Logs для `/api/telegram`;
   - знайдіть:

```text
Ignored channel_post from unconfigured channel -1001234567890
```

5. Додайте цей ID:

```text
TELEGRAM_SOURCE_CHANNEL_IDS=-1001234567890
```

6. Redeploy.
7. Надішліть готову статтю:

```text
Заголовок статті

Текст статті...
```

Expected pipeline:

```text
Telegram channel_post
-> Vercel /api/telegram
-> optional Claude Key Takeaways
-> GitHub Markdown commit
-> Vercel auto-deploy
-> article on site
```

Bot не мусить писати confirmation назад у source channel.

---

# 7. Anthropic

Vercel:

```text
ANTHROPIC_API_KEY=<client key>
ANTHROPIC_MODEL=claude-sonnet-5
```

Claude використовується для:

- Key Takeaways, якщо їх не задав автор;
- build-time summaries для `/llms.txt`.

`/llms-full.txt` збирається без Claude.

---

# 8. Webhook secrets

Створіть два різні random secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Vercel:

```text
WEBHOOK_SECRET=<secret 1>
SETUP_SECRET=<secret 2>
```

`WEBHOOK_SECRET` передається Telegram через `setWebhook.secret_token`. Telegram потім надсилає його в header:

```text
X-Telegram-Bot-Api-Secret-Token
```

`SETUP_SECRET` захищає `/api/setup`.

---

# 9. Vercel production environment variables

Recommended baseline:

```text
TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_ALLOWED_USER_IDS=0
TELEGRAM_SOURCE_CHANNEL_IDS=0
ADMIN_ID=

ANTHROPIC_API_KEY=<client key>
ANTHROPIC_MODEL=claude-sonnet-5

GITHUB_TOKEN=<fine-grained PAT>
GITHUB_OWNER=<owner>
GITHUB_REPO=blogpropersonal
GITHUB_BRANCH=main

WEBHOOK_SECRET=<random secret>
SETUP_SECRET=<random setup secret>

SITE_URL=https://blog.client.com
TELEGRAM_CHANNEL_URL=https://t.me/public_channel
DEFAULT_AUTHOR=Pro Personal Agency

SITE_NAME=ProPersonal
SITE_MARK=PP
BLOG_SUBTITLE=Блог про AI-інтеграції та автоматизацію
SITE_DESCRIPTION=Практичні статті та кейси про AI-інтеграції й автоматизацію.
ARTICLES_URL=/articles
CASES_URL=/cases
```

Do not set in production:

```text
SKIP_LLM_GENERATION=1
```

Redeploy after env changes.

---

# 10. First webhook registration

Після deploy і налаштованого `SITE_URL`:

1. Відкрийте:

```text
https://CURRENT_DOMAIN/api/setup
```

2. Введіть `SETUP_SECRET`.
3. Натисніть **«Зареєструвати / перереєструвати webhook»**.
4. Expected webhook URL:

```text
https://CURRENT_DOMAIN/api/telegram
```

Registration робить:

- Telegram `setWebhook`;
- передає `WEBHOOK_SECRET` як `secret_token`;
- встановлює `allowed_updates = message, callback_query, channel_post`;
- видаляє старі registered slash commands;
- reset menu button;
- читає `getWebhookInfo` назад.

Після цього натисніть **«Перевірити стан»** і перевірте:

- webhook URL правильний;
- немає `last_error_message`;
- `channel_post` є в allowed updates.

Один Telegram bot має один active outgoing webhook URL. Новий `setWebhook` для цього bot замінює старий URL.

---

# 11. Коли треба re-register webhook

## Domain changed, bot same

```text
SITE_URL=https://NEW_DOMAIN
```

Потім:

1. Redeploy.
2. Open `https://NEW_DOMAIN/api/setup`.
3. Register / re-register webhook.
4. Check status.
5. Test bot and source-channel publication.

## Bot/token changed, domain same

```text
TELEGRAM_BOT_TOKEN=<new token>
```

Потім:

1. Redeploy.
2. Open current `/api/setup`.
3. Register webhook — це реєструє webhook уже для нового bot.
4. Start new bot.
5. Add new bot to source channels.
6. Test bot CMS and channel ingestion.

Old bot retains its own old webhook until it is explicitly deleted/changed using the old token or the bot/token is retired.

## Domain and bot both changed

1. Update `SITE_URL`.
2. Update `TELEGRAM_BOT_TOKEN`.
3. Redeploy.
4. Open `https://NEW_DOMAIN/api/setup`.
5. Register webhook.
6. Test bot and channel publication.

## WEBHOOK_SECRET changed

1. Update secret.
2. Redeploy.
3. **Always re-register webhook**.

Without step 3 Telegram keeps sending the old secret and `/api/telegram` returns 401.

## SETUP_SECRET changed

Redeploy only. No webhook registration needed.

## TELEGRAM_ALLOWED_USER_IDS changed

Redeploy only.

## TELEGRAM_SOURCE_CHANNEL_IDS changed

Redeploy only.

## TELEGRAM_CHANNEL_URL changed

Redeploy only. This only changes public website links.

## GitHub token/repository changed

Update:

```text
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH
```

Reconnect Vercel Git integration to the same repo/branch if necessary, then redeploy and test publication. No Telegram webhook change is required unless bot/domain/webhook secret also changed.

## Anthropic key/model changed

Update env and redeploy. No webhook re-registration required.

---

# 12. Acceptance tests

## Bot article

1. Open bot.
2. Press `📝 Нова стаття`.
3. Send title + blank line + article.
4. Publish preview.

Expected:

- Markdown in `astro/src/content/articles/`;
- GitHub commit;
- Vercel deployment;
- article on homepage/archive;
- Key Takeaways;
- share buttons;
- Telegram CTA;
- `TechArticle` JSON-LD;
- article present in `/llms.txt` and `/llms-full.txt`.

## Source-channel article

1. Bot is member of source channel.
2. `TELEGRAM_SOURCE_CHANNEL_IDS=0` or channel ID is allowlisted.
3. Post title + blank line + article.

Expected: GitHub Markdown commit -> Vercel deploy -> article appears.

## Case

1. `💼 Новий кейс`.
2. Fill fields via inline buttons.
3. Publish.

Expected: case Markdown -> deploy -> homepage Cases section + `/cases` archive. If `url` exists, card opens external source.

---

# 13. AIO/indexing verification

Check:

```text
https://FINAL_DOMAIN/llms.txt
https://FINAL_DOMAIN/llms-full.txt
https://FINAL_DOMAIN/sitemap.xml
https://FINAL_DOMAIN/robots.txt
```

Human frontend must not show/promote `llms.txt` links.

Article View Source must contain:

```text
application/ld+json
TechArticle
```

---

# 14. Troubleshooting

## Bot does not answer

- check `/api/setup` -> webhook status;
- verify `SITE_URL`;
- check Telegram `last_error_message`;
- ensure Deployment Protection does not block Telegram;
- check `TELEGRAM_ALLOWED_USER_IDS`; `0` allows everyone.

## Source channel does not publish

- confirm bot is member of channel;
- confirm webhook allowed updates include `channel_post`;
- check `TELEGRAM_SOURCE_CHANNEL_IDS`;
- `0` allows any channel;
- for allowlist mode inspect Runtime Logs to discover `-100...` ID;
- redeploy after env change.

## Webhook 401

`WEBHOOK_SECRET` in Vercel differs from Telegram stored secret. Redeploy and re-register webhook.

## GitHub 401/403

Verify PAT, selected repository and `Contents: Read and write`.

## Markdown committed but site not updated

Verify Vercel Git integration watches the exact repo/branch where Telegram commits.

## Claude fails

Verify:

```text
ANTHROPIC_API_KEY
ANTHROPIC_MODEL
```

Build-time `llms.txt` has deterministic fallback, so Anthropic outage should not break static deployment.

---

# 15. Final ownership checklist

- [ ] GitHub repo client-owned
- [ ] Vercel project client-owned
- [ ] domain client-controlled
- [ ] Vercel watches correct repo/branch
- [ ] client-owned GitHub token installed
- [ ] client-owned Anthropic key installed
- [ ] client-owned Telegram bot/token installed
- [ ] `TELEGRAM_ALLOWED_USER_IDS` configured
- [ ] `TELEGRAM_SOURCE_CHANNEL_IDS` configured
- [ ] public `TELEGRAM_CHANNEL_URL` configured
- [ ] webhook status points to final domain
- [ ] bot article test passed
- [ ] source-channel test passed if feature used
- [ ] case test passed
- [ ] article reader/share/CTA works
- [ ] `/llms.txt` works but is not promoted in frontend
- [ ] `/llms-full.txt` works
- [ ] sitemap contains real routes only
- [ ] JSON-LD present
- [ ] developer secrets removed/revoked
