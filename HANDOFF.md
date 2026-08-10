# Client Handoff — operational runbook

Цей файл — покрокова інструкція передачі готового блогу в інфраструктуру клієнта. Після handoff production не повинен залежати від GitHub/Vercel/Telegram/Anthropic credentials розробника.

VPS, daemon, Redis або database не потрібні.

---

# A. Що передається

Клієнт повинен контролювати:

- GitHub repository;
- Vercel project;
- Telegram bot;
- public Telegram channel для CTA;
- optional private Telegram source channel(s) для автопублікації;
- Anthropic API key;
- GitHub publishing token;
- domain/DNS, якщо є custom domain.

Основні routes:

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

Cases на homepage мають stable anchors `/#case-<slug>`.

---

# B. GitHub

## B1. Transfer repository

Використайте GitHub **Transfer ownership** або перенесіть repository/history у client-owned repo.

Після transfer:

```text
GITHUB_OWNER=<client owner>
GITHUB_REPO=<repo name>
GITHUB_BRANCH=main
```

## B2. GitHub token для Telegram CMS

Створіть client-owned fine-grained PAT.

Repository access:

```text
Only selected repositories -> production blog repo
```

Permission:

```text
Contents -> Read and write
```

Vercel secret:

```text
GITHUB_TOKEN=<token>
```

---

# C. Telegram bot

Через BotFather створіть або передайте production bot.

```text
TELEGRAM_BOT_TOKEN=<token>
```

Token зберігається тільки у Vercel Environment Variables.

CMS працює кнопками:

```text
📝 Нова стаття     💼 Новий кейс
⚙️ Стан            🆔 Мій ID      ❓ Допомога
```

Slash commands не використовуються як CMS interface. Telegram native Start технічно надсилає `/start`, але користувач нічого не вводить вручну.

---

# D. Telegram access model

Люди і source channels мають **різні allowlists**.

## D1. Люди, які можуть користуватися ботом

```text
ADMIN_ID=<telegram user id>
TELEGRAM_ALLOWED_USER_IDS=<comma-separated user ids>
```

`ADMIN_ID` завжди дозволений і бачить розширений `⚙️ Стан`.

Дозволити бот усім користувачам:

```text
TELEGRAM_ALLOWED_USER_IDS=0
```

Обмежити конкретними людьми:

```text
TELEGRAM_ALLOWED_USER_IDS=111111111,222222222
```

Порожнє значення означає: користуватися CMS може тільки `ADMIN_ID`.

Старий `ALLOWED_IDS` підтримується лише як backward-compatible fallback; у новій конфігурації використовувати `TELEGRAM_ALLOWED_USER_IDS`.

## D2. Приватні/публічні канали-джерела

```text
TELEGRAM_SOURCE_CHANNEL_IDS=-1001234567890,-1009876543210
```

Тільки явно вказані channel IDs можуть автоматично створювати статті через `channel_post`.

`0` тут **не означає allow all**. Якщо список порожній, автопублікація з каналів вимкнена.

Це окремо від:

```text
TELEGRAM_CHANNEL_URL=https://t.me/public_channel
```

`TELEGRAM_CHANNEL_URL` — public CTA/header/footer URL на сайті. Він не дає права публікувати контент.

## D3. Як підключити приватний source channel

1. Додайте production bot у приватний канал. Telegram доставляє боту channel posts для каналів, де бот є учасником.
2. Переконайтесь, що webhook уже зареєстрований і включає `channel_post`.
3. Якщо numeric ID каналу ще невідомий, залиште `TELEGRAM_SOURCE_CHANNEL_IDS` порожнім і зробіть один тестовий пост.
4. Відкрийте Vercel -> Project -> Logs / Runtime Logs для `/api/telegram`.
5. Знайдіть рядок:

```text
Ignored channel_post from unconfigured channel -1001234567890
```

6. Додайте отриманий ID у Vercel:

```text
TELEGRAM_SOURCE_CHANNEL_IDS=-1001234567890
```

7. Redeploy.
8. Зробіть готовий тестовий пост у каналі у форматі:

```text
Заголовок статті

Текст статті...
```

9. Очікування: `.md` з'являється в GitHub, Git commit запускає Vercel deploy, стаття з'являється на сайті.

Код не намагається писати confirmation назад у source channel; тому йому не потрібне право публікувати повідомлення в канал для цього workflow.

---

# E. Anthropic

У client Anthropic Console:

```text
ANTHROPIC_API_KEY=<client key>
ANTHROPIC_MODEL=claude-sonnet-5
```

Використовується для:

- automatic Key Takeaways у Telegram;
- build-time summarization `/llms.txt`.

---

# F. Generate secrets

Створіть два незалежні random secrets, наприклад:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Vercel:

```text
WEBHOOK_SECRET=<first value>
SETUP_SECRET=<second value>
```

`WEBHOOK_SECRET` передається Telegram у `setWebhook.secret_token`; Telegram повертає його в `X-Telegram-Bot-Api-Secret-Token`.

`SETUP_SECRET` захищає `/api/setup`.

---

# G. Vercel

## G1. Import project

1. Add New -> Project.
2. Import client GitHub repository.
3. Production branch = `main`.
4. `vercel.json` залишається source of truth для install/build/output settings.

## G2. Production Environment Variables

```text
TELEGRAM_BOT_TOKEN=<client bot token>
TELEGRAM_ALLOWED_USER_IDS=0
TELEGRAM_SOURCE_CHANNEL_IDS=
ADMIN_ID=

ANTHROPIC_API_KEY=<client Anthropic key>
ANTHROPIC_MODEL=claude-sonnet-5

GITHUB_TOKEN=<client fine-grained PAT>
GITHUB_OWNER=<client GitHub owner>
GITHUB_REPO=<repo name>
GITHUB_BRANCH=main

WEBHOOK_SECRET=<generated secret>
SETUP_SECRET=<generated setup secret>

SITE_URL=<final or temporary production URL>
TELEGRAM_CHANNEL_URL=<public Telegram CTA channel URL>
DEFAULT_AUTHOR=Pro Personal Agency
```

Optional frontend config:

```text
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

Redeploy after changing environment variables.

---

# H. Domain

If using custom domain:

1. Vercel -> Project -> Settings -> Domains.
2. Add final domain/subdomain.
3. Apply DNS records requested by Vercel.
4. Wait until domain is valid.
5. Set:

```text
SITE_URL=https://blog.client.com
```

6. Redeploy.
7. **Re-register Telegram webhook**, because webhook URL depends on `SITE_URL`.

`SITE_URL` controls article links, bot publish links, webhook target, `llms.txt`, sitemap and robots URLs.

---

# I. Webhook setup — first registration

After production deploy and final/current `SITE_URL` are ready:

1. Open:

```text
https://CURRENT_DOMAIN/api/setup
```

2. Enter `SETUP_SECRET`.
3. Click **«Зареєструвати / перереєструвати webhook»**.
4. Expected Telegram target:

```text
https://CURRENT_DOMAIN/api/telegram
```

Registration performs:

1. Telegram `setWebhook`;
2. `secret_token = WEBHOOK_SECRET`;
3. `allowed_updates = message, callback_query, channel_post`;
4. removes old registered slash commands;
5. resets Telegram menu button;
6. reads webhook status back.

Then use **«Перевірити стан»** in `/api/setup` and confirm:

- webhook URL is the current production domain;
- there is no `last_error_message`;
- allowed updates include `channel_post`.

Telegram supports only one active outgoing webhook per bot. Registering a new URL replaces the previous webhook for that bot.

---

# J. When webhook must be re-registered

## J1. Domain changed, same bot

Change:

```text
SITE_URL=https://NEW_DOMAIN
```

Then:

1. Redeploy.
2. Open `https://NEW_DOMAIN/api/setup`.
3. Register / re-register webhook.
4. Check status.
5. Test private bot message and, if configured, source-channel post.

The old domain no longer needs to receive Telegram updates after successful re-registration.

## J2. New Telegram bot/token, same domain

Change:

```text
TELEGRAM_BOT_TOKEN=<new bot token>
```

Then:

1. Redeploy.
2. Open `/api/setup` on current domain.
3. Register webhook. This registers the webhook on the **new bot**.
4. Open the new bot and press Telegram Start.
5. Re-check `ADMIN_ID` / `TELEGRAM_ALLOWED_USER_IDS`.
6. Add the new bot to every source channel.
7. Re-check `TELEGRAM_SOURCE_CHANNEL_IDS` and test channel publication.

The old bot keeps whatever webhook it had until you explicitly delete/change it using the old token. During handoff, delete the old webhook or revoke the old bot token if the bot is being retired.

## J3. Domain and bot both changed

1. Update `SITE_URL`.
2. Update `TELEGRAM_BOT_TOKEN`.
3. Redeploy.
4. Open `https://NEW_DOMAIN/api/setup`.
5. Register webhook.
6. Configure user/channel allowlists.
7. Add new bot to source channels.
8. Test bot publication and channel publication.

## J4. WEBHOOK_SECRET changed

Change `WEBHOOK_SECRET`, redeploy, then **always re-register webhook**.

If not re-registered, Telegram continues sending the old secret and `/api/telegram` returns 401.

## J5. SETUP_SECRET changed

Change `SETUP_SECRET`, redeploy. Webhook registration is not required.

## J6. User/channel allowlists changed

Change any of:

```text
ADMIN_ID
TELEGRAM_ALLOWED_USER_IDS
TELEGRAM_SOURCE_CHANNEL_IDS
```

Redeploy only. Webhook re-registration is not required.

## J7. Public CTA channel URL changed

Change:

```text
TELEGRAM_CHANNEL_URL
```

Redeploy only. This does not affect webhook/source-channel permissions.

---

# K. Configure admin

1. Open production bot.
2. Press Telegram native Start.
3. Tap `🆔 Мій ID`.
4. Copy returned ID.
5. Set `ADMIN_ID=<id>` in Vercel.
6. Redeploy.

No webhook re-registration required.

---

# L. End-to-end acceptance tests

## L1. Bot article

Telegram -> `📝 Нова стаття`.

Send:

```text
Тестова стаття

## Тестовий заголовок

Це тест production publishing pipeline.
```

Expected:

1. Claude generates Key Takeaways if not supplied;
2. preview appears;
3. publish button works;
4. GitHub gets `.md` in `astro/src/content/articles/`;
5. Git commit triggers Vercel deployment;
6. homepage/article page update;
7. JSON-LD, share buttons, Telegram CTA work;
8. `/llms.txt` and `/llms-full.txt` contain the article.

## L2. Source-channel article

1. Bot is a member of configured source channel.
2. Channel ID is in `TELEGRAM_SOURCE_CHANNEL_IDS`.
3. Publish:

```text
Тест із приватного каналу

Текст готової статті...
```

Expected: Markdown commit -> Vercel deployment -> article appears. No button confirmation is expected inside the channel.

## L3. Case

Telegram -> `💼 Новий кейс`, fill fields with buttons, publish.

Expected: case Markdown commit -> deploy -> card appears on homepage and `/cases`; external URL opens if supplied.

---

# M. AI/indexing verification

Check:

```text
https://FINAL_DOMAIN/llms.txt
https://FINAL_DOMAIN/llms-full.txt
https://FINAL_DOMAIN/sitemap.xml
https://FINAL_DOMAIN/robots.txt
```

Human frontend must not promote `llms.txt` links.

Article View Source must contain `application/ld+json` and `TechArticle`.

---

# N. Troubleshooting

## Bot does not answer

1. `/api/setup` -> Check webhook status.
2. Confirm webhook URL matches current `SITE_URL`.
3. Check Telegram `last_error_message`.
4. Ensure Vercel Deployment Protection does not block Telegram.
5. Check `TELEGRAM_ALLOWED_USER_IDS`; `0` allows everyone.

## Private source channel does not publish

1. Confirm bot is a member of the channel.
2. Confirm webhook allowed updates include `channel_post`.
3. Post a test message and inspect Vercel Runtime Logs.
4. If log says `Ignored channel_post from unconfigured channel -100...`, copy that ID into `TELEGRAM_SOURCE_CHANNEL_IDS`.
5. Redeploy and retry.

## Webhook returns 401

`WEBHOOK_SECRET` in Vercel and Telegram's stored webhook secret differ. Redeploy and re-register webhook.

## GitHub 401/403

Check PAT, selected repo, `Contents: Read and write`, owner/repo/branch.

## Markdown exists but site does not update

Check Vercel Git integration watches the exact repo/branch the bot writes to.

## Claude fails

Check `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`. Build-time `llms.txt` has deterministic fallback; Telegram auto-Key-Takeaways need Anthropic unless provided manually.

---

# O. Final ownership checklist

- [ ] GitHub repo is client-owned;
- [ ] Vercel project is client-owned;
- [ ] final domain is client-controlled;
- [ ] Vercel watches correct repo/branch;
- [ ] `GITHUB_TOKEN` belongs to client;
- [ ] `ANTHROPIC_API_KEY` belongs to client;
- [ ] Telegram bot/token belongs to client;
- [ ] `TELEGRAM_ALLOWED_USER_IDS` policy is intentional;
- [ ] private source channel IDs are in `TELEGRAM_SOURCE_CHANNEL_IDS` if used;
- [ ] public CTA URL is in `TELEGRAM_CHANNEL_URL`;
- [ ] webhook status shows current production domain and correct bot;
- [ ] source-channel test passed if required;
- [ ] bot article test passed;
- [ ] case publication test passed;
- [ ] article reader/share/CTA works;
- [ ] `llms.txt`, `llms-full.txt`, sitemap and JSON-LD work;
- [ ] developer secrets removed/revoked.
