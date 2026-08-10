import { DEFAULT_AUTHOR } from './config';

type Entity = {
  type: string;
  offset: number;
  length: number;
  url?: string;
  language?: string;
};

type TelegramMessage = {
  text?: string;
  caption?: string;
  entities?: Entity[];
  caption_entities?: Entity[];
};

type ArticleMarkdownOptions = {
  slug?: string;
  publishedAt?: string;
  image?: string;
  sourceChannelId?: number;
  sourceMessageId?: number;
};

const SENDABLE = new Set([
  'bold', 'italic', 'underline', 'strikethrough', 'spoiler',
  'code', 'pre', 'text_link', 'blockquote',
]);

export function parseSubmission(message: TelegramMessage) {
  const raw = message.text ?? message.caption ?? '';
  const entities = (message.entities ?? message.caption_entities ?? []) as Entity[];

  // Channel CMS contract:
  // 1st paragraph = H1/title
  // 2nd paragraph = Key Takeaways
  // everything after that = article body; ## / ### remain Markdown headings.
  const first = splitFirstParagraph(raw, 0);
  const second = splitFirstParagraph(raw, first.nextStart);
  const bodyStart = skipParagraphWhitespace(raw, second.nextStart);
  const bodyText = raw.slice(bodyStart).trimEnd();
  const bodyEntities = entities
    .filter((entity) => entity.offset >= bodyStart && SENDABLE.has(entity.type))
    .map((entity) => ({ ...entity, offset: entity.offset - bodyStart }));

  return {
    title: stripInlineMarkdown(first.value),
    keyTakeaways: second.value.replace(/\s+/g, ' ').trim().slice(0, 1000),
    bodyText,
    bodyEntities,
  };
}

export function parseCaseSubmission(message: TelegramMessage) {
  const source = parseSubmission(message);
  const lines = source.bodyText.replace(/\r\n/g, '\n').split('\n');
  const meta = { client: '', url: '', result: '', description: '' };
  let cursor = 0;
  let foundMeta = false;

  while (cursor < lines.length) {
    const line = lines[cursor].trim();
    if (!line) {
      cursor += 1;
      continue;
    }

    const match = line.match(/^(client|клієнт|url|link|посилання|result|результат|description|опис)\s*:\s*(.+)$/i);
    if (!match) break;

    foundMeta = true;
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (key === 'client' || key === 'клієнт') meta.client = value;
    else if (key === 'url' || key === 'link' || key === 'посилання') meta.url = value;
    else if (key === 'result' || key === 'результат') meta.result = value;
    else if (key === 'description' || key === 'опис') meta.description = value;
    cursor += 1;
  }

  if (meta.url && !/^https?:\/\//i.test(meta.url)) {
    throw new Error('Посилання кейсу має починатися з http:// або https://');
  }

  const bodyText = lines.slice(cursor).join('\n').trim();
  const description = meta.description || plainText(bodyText || source.bodyText).slice(0, 220).trim() || source.title;

  return {
    ...source,
    bodyText,
    bodyEntities: foundMeta ? [] : source.bodyEntities,
    client: meta.client,
    url: meta.url,
    result: meta.result,
    description,
  };
}

export function buildArticlePreview(title: string, keyTakeaways: string, bodyText: string, bodyEntities: Entity[]) {
  const safeKt = keyTakeaways || 'Ключові висновки буде згенеровано Claude.';
  const maxBody = 1800;
  const truncated = bodyText.length > maxBody;
  const previewBody = truncated ? `${bodyText.slice(0, maxBody)}…` : bodyText;
  const previewEntities = bodyEntities.filter((entity) => entity.offset + entity.length <= previewBody.length);
  const titleOffset = 0;
  const ktOffset = title.length + 2;
  const bodyOffset = ktOffset + safeKt.length + 2;
  const text = `${title}\n\n${safeKt}\n\n${previewBody}`;
  const entities: Entity[] = [
    { type: 'bold', offset: titleOffset, length: title.length },
    { type: 'blockquote', offset: ktOffset, length: safeKt.length },
    ...previewEntities.map((entity) => ({ ...entity, offset: entity.offset + bodyOffset })),
  ];
  return { text, entities };
}

export function parseArticlePreview(message: TelegramMessage) {
  const text = message.text || '';
  const entities = message.entities || [];
  const titleEntity = entities.find((entity) => entity.offset === 0 && entity.type === 'bold');
  const ktEntity = entities.find((entity) => entity.type === 'blockquote');
  const title = titleEntity ? text.slice(0, titleEntity.length) : text.split('\n')[0];
  const keyTakeaways = ktEntity ? text.slice(ktEntity.offset, ktEntity.offset + ktEntity.length) : '';
  const bodyStart = ktEntity ? ktEntity.offset + ktEntity.length + 2 : title.length + 2;
  const bodyText = text.slice(bodyStart);
  const bodyEntities = entities
    .filter((entity) => entity.offset >= bodyStart && SENDABLE.has(entity.type))
    .map((entity) => ({ ...entity, offset: entity.offset - bodyStart }));
  return { title, keyTakeaways, bodyText, bodyEntities };
}

export function toArticleMarkdown(
  title: string,
  keyTakeaways: string,
  bodyText: string,
  bodyEntities: Entity[],
  options: ArticleMarkdownOptions = {},
) {
  const publishedAt = options.publishedAt || new Date().toISOString();
  const date = publishedAt.slice(0, 10);
  const slug = options.slug || slugify(title);
  const rawMarkdownBody = bodyEntities.length ? applyEntities(bodyText, bodyEntities) : bodyText;
  const markdownBody = normalizeHeadingSyntax(rawMarkdownBody);
  const content = [
    '---',
    `title: "${yamlEscape(title)}"`,
    `slug: "${slug}"`,
    `date: "${publishedAt}"`,
    `keyTakeaways: "${yamlEscape(keyTakeaways)}"`,
    `author: "${yamlEscape(DEFAULT_AUTHOR)}"`,
    options.image ? `image: "${yamlEscape(options.image)}"` : '',
    options.sourceChannelId != null ? `sourceChannelId: "${options.sourceChannelId}"` : '',
    options.sourceMessageId != null ? `sourceMessageId: "${options.sourceMessageId}"` : '',
    '---',
    '',
    markdownBody.trim(),
    '',
  ].filter(Boolean).join('\n');
  return { date, slug, content };
}

export function toCaseMarkdown(
  title: string,
  bodyText: string,
  bodyEntities: Entity[],
  meta: { client?: string; url?: string; result?: string; description?: string } = {},
) {
  const date = today();
  const slug = slugify(title);
  const markdownBody = bodyEntities.length ? applyEntities(bodyText, bodyEntities) : bodyText;
  const description = meta.description || plainText(markdownBody).slice(0, 220).trim() || title;
  const content = [
    '---',
    `title: "${yamlEscape(title)}"`,
    `slug: "${slug}"`,
    `date: "${date}"`,
    meta.client ? `client: "${yamlEscape(meta.client)}"` : '',
    `description: "${yamlEscape(description)}"`,
    meta.result ? `result: "${yamlEscape(meta.result)}"` : '',
    meta.url ? `url: "${yamlEscape(meta.url)}"` : '',
    '---',
    '',
    markdownBody.trim(),
    '',
  ].filter((line, index, array) => line !== '' || index >= array.indexOf('---', 1)).join('\n');
  return { date, slug, content };
}

function splitFirstParagraph(text: string, start: number) {
  const contentStart = skipParagraphWhitespace(text, start);
  if (contentStart >= text.length) return { value: '', nextStart: text.length };
  const remainder = text.slice(contentStart);
  const separator = remainder.match(/\n[ \t]*\n/);
  if (!separator || separator.index == null) {
    return { value: remainder.trim(), nextStart: text.length };
  }
  const end = contentStart + separator.index;
  return {
    value: text.slice(contentStart, end).trim(),
    nextStart: end + separator[0].length,
  };
}

function skipParagraphWhitespace(text: string, start: number) {
  let cursor = start;
  while (cursor < text.length && /[\s]/.test(text[cursor])) cursor += 1;
  return cursor;
}

function normalizeHeadingSyntax(markdown: string) {
  // Telegram users commonly type `##Heading` without the Markdown-required space.
  // Normalize ATX headings so Astro renders the intended H1-H6 hierarchy.
  return markdown.replace(/^(#{1,6})(?=\S)/gm, '$1 ');
}

function applyEntities(text: string, entities: Entity[]): string {
  const markers: Array<{ pos: number; order: number; value: string }> = [];
  const simple: Record<string, [string, string]> = {
    bold: ['**', '**'], italic: ['_', '_'], underline: ['<u>', '</u>'],
    strikethrough: ['~~', '~~'], spoiler: ['||', '||'], code: ['`', '`'],
    blockquote: ['> ', ''],
  };

  for (const entity of entities) {
    const start = entity.offset;
    const end = entity.offset + entity.length;
    if (entity.type === 'text_link' && entity.url) {
      markers.push({ pos: start, order: 0, value: '[' }, { pos: end, order: 1, value: `](${entity.url})` });
    } else if (entity.type === 'pre') {
      markers.push(
        { pos: start, order: 0, value: `\`\`\`${entity.language || ''}\n` },
        { pos: end, order: 1, value: '\n```' },
      );
    } else if (simple[entity.type]) {
      const [open, close] = simple[entity.type];
      markers.push({ pos: start, order: 0, value: open }, { pos: end, order: 1, value: close });
    }
  }

  markers.sort((a, b) => a.pos - b.pos || a.order - b.order);
  let output = '';
  let cursor = 0;
  for (const marker of markers) {
    output += text.slice(cursor, marker.pos) + marker.value;
    cursor = marker.pos;
  }
  return output + text.slice(cursor);
}

function stripInlineMarkdown(value: string) {
  return value.replace(/[*_~`]/g, '').replace(/\[([^\]]+)]\([^)]+\)/g, '$1').trim();
}

function plainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function yamlEscape(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
}

export function slugify(value: string) {
  const transliteration: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z',
    и: 'y', і: 'i', ї: 'yi', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
    р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
    ь: '', ю: 'yu', я: 'ya', ы: 'y', э: 'e', ъ: '', ё: 'yo',
  };
  return value.toLowerCase().split('').map((char) => transliteration[char] ?? char).join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || `post-${Date.now()}`;
}
