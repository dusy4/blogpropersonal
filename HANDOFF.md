# Client Handoff — operational runbook

ProPersonal Blog працює без VPS, daemon, Redis або database. Source of truth — GitHub Markdown/assets; Vercel хостить Astro та serverless Telegram webhook.

## 1. Що передається клієнту

Клієнт повинен контролювати:

- GitHub repository;
- Vercel project;
- Telegram bot;
- public Telegram channel URL для CTA сайту;
- optional Telegram source channel(s) для автоматичної публікації;
- optional Anthropic API key для automatic Key Takeaways;
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
/sitemap.xml                       sitemap
/robots.txt                        robots
/api/telegram                      Telegram webhook
/api/set-webhook?token=<secret>    protected webhook registration
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

Telegram CMS пише article/case Markdown та, для channel-photo articles, public image assets у цей repository. Vercel Git integration має watch той самий repo/branch.

## 3. Telegram bot

Створіть або передайте production bot через BotFather та встановіть у Vercel:

```text
TELEGRAM_BOT_TOKEN=<bot token>
```

CMS працює кнопками:

```text
📝 Нова стаття      💼 Новий кейс
🗑 Видалити статтю  🗑 Видалити кейс
⚙️ Стан             🆔 Мій ID      ❓ Допомога
```

Telegram native Start технічно надсилає `/start`; вручну slash commands для CMS не потрібні.

## 4. Telegram access model

Є дві explicit access variables.

### Users, які можуть користуватися private bot CMS

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

Дозволити будь-який channel, updates якого доходять до bot webhook:

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

## 6. Article через private bot CMS

Натисніть:

```text
📝 Нова стаття
```

Bot створює editable draft з полями:

```text
✏️ Заголовок
🧠 Ключові висновки
📝 Текст + H2/H3
✅ Опублікувати статтю
❌ Скасувати
```

Правила:

- `Заголовок` required і стає article H1;
- `Текст` required;
- `Ключові висновки` optional;
- manual Key Takeaways -> Claude не викликається;
- empty Key Takeaways -> runtime викликає Claude;
- `##` у body -> H2;
- `###` -> H3;
- `##Heading` автоматично нормалізується до `## Heading`.

Після збереження article field bot надсилає новий updated draft anchor внизу chat. Старий anchor змінюється на:

```text
↪️ Чернетку оновлено нижче.
```

Після натискання Publish:

1. inline edit/publish/cancel controls блокуються/прибираються з draft anchor, але сам текст draft залишається;
2. bot надсилає progress message;
3. Markdown commit створюється в GitHub;
4. Vercel Git integration запускає deployment;
5. bot poll-ить production URL;
6. тільки після фактичного live confirmation надсилається success + live link.

Bot не надсилає повідомлення виду `Vercel не встиг підтвердитися...` як фінальний статус. Якщо live check не вклався у serverless window, він не видає false-positive success.

Article files:

```text
astro/src/content/articles/YYYY-MM-DD-slug.md
```

Frontmatter `date` містить ISO timestamp, а не лише календарний день. Це забезпечує правильне сортування `Latest article`, навіть якщо кілька статей опубліковані в один день.

## 7. Source channel CMS

### 7.1 Підключення

1. Додайте production bot у Telegram source channel.
2. Webhook повинен мати `channel_post` та `edited_channel_post` у `allowed_updates`.
3. Для будь-якого channel:

```text
TELEGRAM_SOURCE_CHANNEL_IDS=0
```

4. Для allowlist конкретного channel, якщо ID невідомий:
   - залиште `TELEGRAM_SOURCE_CHANNEL_IDS` порожнім;
   - зробіть test post;
   - відкрийте Vercel Runtime Logs для `/api/telegram`;
   - знайдіть рядок виду:

```text
Ignored channel post from unconfigured channel -1001234567890
```

5. Встановіть знайдений ID та redeploy.

### 7.2 Формат article post

Channel CMS не вимагає окремої форми. У post/caption author пише звичайний structured text.

Manual Key Takeaways задаються paragraph, який починається canonical label:

```text
Ключові висновки: <контент у цьому самому paragraph>
```

Цей paragraph може бути **будь-де** у повідомленні:

- перед title;
- після title;
- посеред body;
- останнім paragraph.

Paragraph закінчується на першому blank-line paragraph break. Усе після label усередині цього paragraph стає `keyTakeaways`. Сам tagged paragraph видаляється перед structural parsing.

Після його видалення:

```text
1-й remaining paragraph -> article title / H1
все після нього        -> article body
##                     -> H2
###                    -> H3
```

Example — Key Takeaways на початку:

```text
Ключові висновки: Короткий summary. Друге речення. Третє речення.

Заголовок статті

Звичайний абзац.

## H2
Текст під H2.

### H3
Текст під H3.
```

Example — Key Takeaways в кінці:

```text
Заголовок статті

Звичайний абзац.

## H2
Текст під H2.

Ключові висновки: Короткий summary. Друге речення. Третє речення.
```

Якщо paragraph `Ключові висновки:` **не існує**, runtime генерує Key Takeaways через Claude з article body. У цьому випадку потрібен `ANTHROPIC_API_KEY`.

Якщо `Ключові висновки:` є, Claude не викликається.

### 7.3 Фото

Якщо channel post має photo:

```text
Telegram photo
-> Bot API getFile/download
-> GitHub public asset
-> article frontmatter image
-> article cover image on site
```

Caption/text проходить той самий article parser.

### 7.4 Редагування channel post

Telegram `edited_channel_post` перебудовує article заново.

Article tracked через:

```text
sourceChannelId + sourceMessageId
```

При edit повторно обробляються:

- title/H1;
- body;
- H2/H3;
- manual `Ключові висновки:`;
- Claude fallback, якщо manual Key Takeaways були видалені;
- photo/caption changes.

Якщо tracked article уже існує, зберігаються його slug/publication identity. Якщо попередня publication того Telegram post впала до створення article, наступний edit може створити його як першу успішну publication.

### 7.5 Видалення source message

Telegram Bot API не дає звичайного `deleted_channel_post` webhook update. Тому:

```text
delete message in Telegram channel
≠ automatic delete article on website
```

Для видалення website article використовуйте private bot CMS:

```text
🗑 Видалити статтю
```

## 8. Cases

Натисніть:

```text
💼 Новий кейс
```

Bot створює editable draft:

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

Publication requires:

```text
Назва
+
at least one of: Опис / Посилання / Нотатки
```

`Клієнт` і `Результат` optional.

Якщо `Посилання` є, case card відкриває external source. Інакше це локальна on-page case card.

Case files:

```text
astro/src/content/cases/YYYY-MM-DD-slug.md
```

Case publication також чекає production confirmation перед final live success message.

## 9. Delete CMS

Private bot має:

```text
🗑 Видалити статтю
🗑 Видалити кейс
```

Flow:

```text
open delete picker
-> choose existing entry
-> explicit confirmation
-> GitHub delete
-> Vercel deploy
-> production check
-> final success only when deletion is live
```

Source-channel post deletion не є trigger для цього flow; delete виконується через bot CMS.

## 10. Anthropic

```text
ANTHROPIC_API_KEY=<client key>
ANTHROPIC_MODEL=claude-sonnet-5
```

Claude використовується для runtime Key Takeaways лише коли вони не supplied manually:

- private bot article з empty `Ключові висновки`;
- source-channel article без paragraph `Ключові висновки:`.

Також Claude може використовуватися build-time для `/llms.txt`.

`/llms-full.txt` збирається з Markdown без Claude. AI-file build має deterministic fallback, якщо Anthropic недоступний.

Якщо всі runtime article publications завжди supplies manual Key Takeaways, `ANTHROPIC_API_KEY` не потрібен для publication path. Але без нього publication, яка потребує automatic summary, завершиться помилкою до GitHub commit.

## 11. Webhook secrets

Створіть два різні random URL-safe secrets, наприклад:

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

Для Telegram `secret_token` використовуйте лише URL-safe permitted characters (`A-Z`, `a-z`, `0-9`, `_`, `-`). Hex output підходить.

`SETUP_SECRET` використовується тільки для protected setup endpoint URL:

```text
/api/set-webhook?token=<SETUP_SECRET>
```

Missing/wrong token повертає `404`.

Повний setup URL вважати секретом. Query token може залишитися в browser history або infrastructure request logs, тому його не пересилати третім особам. Response має `Cache-Control: no-store` і `Referrer-Policy: no-referrer`.

## 12. Production env baseline

```text
TELEGRAM_BOT_TOKEN=<bot token>
TELEGRAM_ALLOWED_USER_IDS=0
TELEGRAM_SOURCE_CHANNEL_IDS=0

ANTHROPIC_API_KEY=<optional client key>
ANTHROPIC_MODEL=claude-sonnet-5

GITHUB_TOKEN=<fine-grained PAT>
GITHUB_OWNER=<owner>
GITHUB_REPO=blogpropersonal
GITHUB_BRANCH=main

WEBHOOK_SECRET=<random URL-safe secret>
SETUP_SECRET=<random URL-safe setup secret>

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

Цей URL використовується для canonical URLs, sitemap/AI files, Telegram live links, production live checks і webhook registration.

`SITE_URL` потрібен лише як explicit override, наприклад для non-Vercel deployment або якщо навмисно треба force specific canonical domain.

## 13. Webhook registration

Після того як Vercel env variables встановлені і production redeploy завершений, відкрийте:

```text
https://CURRENT_PRODUCTION_DOMAIN/api/set-webhook?token=<SETUP_SECRET>
```

Valid request автоматично resolve production URL і реєструє:

```text
https://CURRENT_PRODUCTION_DOMAIN/api/telegram
```

Registration:

- передає `WEBHOOK_SECRET` як `secret_token`;
- встановлює `allowed_updates`:

```text
message
callback_query
channel_post
edited_channel_post
```

- `drop_pending_updates: false`;
- видаляє registered slash commands;
- reset Telegram chat menu button;
- читає `getWebhookInfo` назад і повертає JSON response.

У successful response перевірити:

```text
ok: true
current.result.url = https://CURRENT_PRODUCTION_DOMAIN/api/telegram
current.result.allowed_updates contains:
  message
  callback_query
  channel_post
  edited_channel_post
```

Якщо webhook був зареєстрований до додавання `edited_channel_post`, setup URL треба повторно відкрити **один раз після deployment нового коду**, інакше Telegram може не надсилати edit events.

## 14. Коли треба re-register webhook

### Змінився bot token

1. Update `TELEGRAM_BOT_TOKEN` у Vercel.
2. Redeploy.
3. Open setup URL.
4. Add new bot to source channels.
5. Test bot + channel publication + channel edit.

### Змінився WEBHOOK_SECRET

1. Update secret.
2. Redeploy.
3. Обов'язково повторно відкрити setup URL.

Інакше Telegram продовжить надсилати старий secret і `/api/telegram` поверне `401`.

### Змінився SETUP_SECRET

Redeploy. Новий setup URL використовує новий token. Telegram webhook re-registration не потрібен лише через зміну `SETUP_SECRET`.

### Змінився `allowed_updates` у коді

Redeploy + повторно відкрити setup URL.

### Додано custom domain

Існуючий webhook на `*.vercel.app/api/telegram` продовжує працювати, поки цей alias активний. Re-register не потрібен для функціональності.

Якщо хочете, щоб Telegram зберіг webhook саме на custom domain:

```text
https://CUSTOM_DOMAIN/api/set-webhook?token=<SETUP_SECRET>
```

### Змінилися access vars

```text
TELEGRAM_ALLOWED_USER_IDS
TELEGRAM_SOURCE_CHANNEL_IDS
```

Redeploy only.

### Змінився public Telegram URL

```text
TELEGRAM_CHANNEL_URL
```

Redeploy only.

### Змінився GitHub token/repository

Update GitHub envs, verify Vercel Git integration watches same repo/branch, redeploy and test publication. Telegram webhook change не потрібен.

### Змінився Anthropic key/model

Redeploy only.

## 15. Acceptance tests

### Private bot article — manual Key Takeaways

1. Open bot.
2. Press `📝 Нова стаття`.
3. Fill `Заголовок`.
4. Fill `Ключові висновки` manually.
5. Fill `Текст + H2/H3`.
6. Publish.

Expected:

```text
draft controls locked after Publish
-> GitHub Markdown commit
-> Vercel deploy
-> production check
-> final ✅ live message + article URL
-> homepage latest/article archive correct
-> H1/H2/H3 correct
-> Key Takeaways correct
-> TechArticle JSON-LD
-> share buttons
-> Telegram CTA
-> llms.txt / llms-full.txt
```

### Private bot article — Claude fallback

Requires `ANTHROPIC_API_KEY`.

1. Fill title/body.
2. Leave Key Takeaways empty.
3. Publish.

Expected: Claude-generated Key Takeaways -> commit -> deploy -> live confirmation.

### Source-channel article — manual Key Takeaways

Bot is in source channel and channel is allowed.

Test both positions:

```text
Ключові висновки: ...

Title

Body
```

and:

```text
Title

Body

Ключові висновки: ...
```

Expected:

```text
channel_post
-> tagged paragraph removed
-> first remaining paragraph = H1
-> manual Key Takeaways in frontmatter
-> GitHub commit
-> Vercel deploy
-> article appears
```

### Source-channel article — Claude fallback

Requires `ANTHROPIC_API_KEY`.

Post title + body without `Ключові висновки:` paragraph.

Expected: Claude summary -> article commit -> deploy.

### Source-channel edit

1. Edit title/body/H2/H3 in same Telegram post.
2. Add/change/remove `Ключові висновки:` paragraph.
3. If photo is used, replace/remove photo/caption where Telegram supports that edit.

Expected:

```text
edited_channel_post
-> same tracked article
-> same slug/publication identity when existing
-> rebuilt Markdown/photo state
-> Vercel deploy
```

### Delete article

1. Press `🗑 Видалити статтю`.
2. Choose article.
3. Confirm.

Expected: GitHub delete -> Vercel deploy -> article route removed -> final success only after production reflects deletion.

### Case

1. `💼 Новий кейс`.
2. Fill fields using inline edit buttons.
3. Publish.

Expected: case Markdown -> deploy -> production confirmation -> homepage Cases + `/cases`. If `url` exists, card opens external source.

### Delete case

1. `🗑 Видалити кейс`.
2. Choose case.
3. Confirm.

Expected: GitHub delete -> deploy -> case disappears -> final live success.

## 16. AIO/indexing verification

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

## 17. Troubleshooting

### Bot does not answer

- run tokenized setup URL and inspect returned `getWebhookInfo`;
- check Telegram `last_error_message`;
- ensure Deployment Protection does not block `/api/telegram`;
- verify `TELEGRAM_ALLOWED_USER_IDS`; `0` allows everyone.

### Source channel does not publish

- verify bot is in source channel;
- `channel_post` is present in `allowed_updates`;
- verify `TELEGRAM_SOURCE_CHANNEL_IDS`; `0` allows any channel;
- inspect Runtime Logs for channel ID in allowlist mode;
- if post has no manual `Ключові висновки:` paragraph, verify Anthropic key because Claude fallback is required;
- redeploy after env changes.

### Channel post publishes but edits do nothing

- verify production code includes `edited_channel_post` handler;
- run setup URL again;
- inspect `getWebhookInfo.allowed_updates` for `edited_channel_post`;
- inspect Vercel Runtime Logs after editing a channel post.

### Channel delete does not delete website article

Expected limitation. Telegram Bot API does not send the required ordinary channel-message deletion update to this webhook architecture. Use `🗑 Видалити статтю` in private bot CMS.

### Claude fails

- verify `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL`;
- or supply manual Key Takeaways in private bot;
- or add a `Ключові висновки:` paragraph anywhere in the channel message.

### Webhook 401

`WEBHOOK_SECRET` differs from Telegram's stored secret. Redeploy and run setup URL again.

### Setup URL returns 404

- wrong/missing `SETUP_SECRET` token;
- URL fragment characters such as `#` may cause part of a query token not to reach the server; use URL-safe random secrets;
- old `/api/setup` route no longer exists by design.

### GitHub 401/403

Verify PAT, selected repository and `Contents: Read and write`.

### Markdown committed but site not updated

Verify Vercel Git integration watches the exact repo/branch where Telegram commits. Also inspect Vercel deployment status/build logs. Hobby build-rate limits can temporarily reject bursts of many rapid CMS/code commits.

### Bot remains on progress without final success

The bot only sends final success after it confirms production. If the serverless live-check window ends first, no fake `live` success is sent. Check Vercel deployment state and production URL directly.

## 18. Final ownership checklist

- [ ] GitHub repo client-owned
- [ ] Vercel project client-owned
- [ ] domain client-controlled if custom domain is used
- [ ] Vercel watches correct repo/branch
- [ ] client-owned GitHub token installed
- [ ] Anthropic key installed if automatic Key Takeaways are required
- [ ] client-owned Telegram bot/token installed
- [ ] `TELEGRAM_ALLOWED_USER_IDS` configured
- [ ] `TELEGRAM_SOURCE_CHANNEL_IDS` configured
- [ ] public `TELEGRAM_CHANNEL_URL` configured
- [ ] tokenized setup endpoint returned valid Telegram webhook info
- [ ] `allowed_updates` contains `edited_channel_post`
- [ ] private bot manual article test passed
- [ ] private bot Claude fallback test passed if used
- [ ] source-channel publish test passed if used
- [ ] source-channel edit test passed if used
- [ ] channel photo update test passed if used
- [ ] article delete test passed
- [ ] case publish/delete tests passed
- [ ] article reader/share/CTA works
- [ ] `/llms.txt` works but is not promoted in frontend
- [ ] `/llms-full.txt` works
- [ ] sitemap contains real routes only
- [ ] JSON-LD present
- [ ] developer secrets removed/revoked
