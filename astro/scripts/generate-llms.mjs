import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
const ARTICLE_DIR = path.join(ROOT, 'src/content/articles');
const CASE_DIR = path.join(ROOT, 'src/content/cases');

const API_KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const SITE_URL = (process.env.SITE_URL || 'https://example.com').replace(/\/$/, '');
const SKIP = process.env.SKIP_LLM_GENERATION === '1';

if (!SKIP && !API_KEY) {
  throw new Error('ANTHROPIC_API_KEY is required for the production build. Set it in Vercel Environment Variables.');
}
if (!SKIP && SITE_URL === 'https://example.com') {
  throw new Error('SITE_URL is required for the production build. Set the final production domain in Vercel.');
}

await fs.mkdir(PUBLIC, { recursive: true });

const articles = await loadDocs(ARTICLE_DIR, 'articles');
const cases = await loadDocs(CASE_DIR, 'cases');

for (const doc of articles) {
  if (!doc.meta.keyTakeaways) {
    const keyTakeaways = SKIP
      ? fallbackSummary(doc.body)
      : await claude(
          'Return only 3-4 concise factual Key Takeaways sentences in the same language as the supplied article. No heading, bullets, code fences, or commentary.',
          doc.raw,
          500,
        );
    await injectFrontmatterField(doc.file, 'keyTakeaways', keyTakeaways);
    doc.meta.keyTakeaways = keyTakeaways;
    doc.raw = await fs.readFile(doc.file, 'utf8');
  }
}

const articleEntries = [];
for (const doc of articles) articleEntries.push(await makeLlmsEntry(doc));
const caseEntries = [];
for (const doc of cases) caseEntries.push(await makeLlmsEntry(doc));

const llms = [
  '# ProPersonal',
  '',
  '> Практична база знань про AI-інтеграції, автоматизацію бізнес-процесів, статті та кейси.',
  '',
  '## Articles',
  '',
  ...(articleEntries.length ? articleEntries : ['- No articles published yet.']),
  '',
  '## Cases',
  '',
  ...(caseEntries.length ? caseEntries : ['- No cases published yet.']),
  '',
  '## Full content',
  '',
  `- [llms-full.txt](${SITE_URL}/llms-full.txt): Full Markdown-derived text of all published articles and cases.`,
  '',
].join('\n');

const full = [
  '# ProPersonal — full content',
  '',
  `Source site: ${SITE_URL}`,
  '',
  ...articles.flatMap((doc) => fullBlock(doc)),
  ...cases.flatMap((doc) => fullBlock(doc)),
].join('\n');

await fs.writeFile(path.join(PUBLIC, 'llms.txt'), llms, 'utf8');
await fs.writeFile(path.join(PUBLIC, 'llms-full.txt'), full, 'utf8');
await fs.writeFile(
  path.join(PUBLIC, 'robots.txt'),
  `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`,
  'utf8',
);

console.log(`Generated llms.txt (${articles.length} articles, ${cases.length} cases) with ${SKIP ? 'local fallback' : MODEL}.`);

async function loadDocs(dir, type) {
  const names = (await fs.readdir(dir)).filter((name) => name.endsWith('.md')).sort();
  const docs = [];
  for (const name of names) {
    const file = path.join(dir, name);
    const raw = await fs.readFile(file, 'utf8');
    const { meta, body } = parseMarkdown(raw);
    const slug = meta.slug || name.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
    docs.push({ file, raw, meta, body, slug, type, url: `${SITE_URL}/${type}/${slug}` });
  }
  return docs;
}

function parseMarkdown(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split('\n')) {
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
    meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}

async function makeLlmsEntry(doc) {
  const title = doc.meta.title || doc.slug;
  if (SKIP) {
    const description = doc.meta.keyTakeaways || doc.meta.description || fallbackSummary(doc.body);
    return `- [${title}](${doc.url}): ${oneLine(description)}`;
  }

  const output = await claude(
    `Convert the supplied Markdown document into exactly ONE llms.txt resource bullet. Return only the bullet and nothing else. Use this exact format:\n- [TITLE](${doc.url}): 1-3 concise factual sentences describing the document for an AI agent.\nPreserve the document language. Use the supplied canonical URL exactly. Do not add code fences, headings, preambles, or extra lines.`,
    doc.raw,
    700,
  );
  return normalizeEntry(output, title, doc.url, doc.meta.keyTakeaways || doc.meta.description || fallbackSummary(doc.body));
}

async function claude(system, content, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'disabled' },
      system,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic build call ${response.status}: ${await response.text()}`);
  const data = await response.json();
  return (data.content || []).filter((block) => block.type === 'text').map((block) => block.text || '').join('').trim();
}

function normalizeEntry(output, title, url, fallback) {
  const cleaned = output.replace(/^```(?:markdown)?\s*/i, '').replace(/```$/i, '').trim();
  const line = cleaned.split('\n').find((value) => value.trim().startsWith('- ['));
  if (line) return line.trim();
  return `- [${title}](${url}): ${oneLine(cleaned || fallback)}`;
}

function fullBlock(doc) {
  const title = doc.meta.title || doc.slug;
  return [
    `## ${title}`,
    '',
    `Canonical URL: ${doc.url}`,
    '',
    doc.raw.trim(),
    '',
    '---',
    '',
  ];
}

async function injectFrontmatterField(file, key, value) {
  const raw = await fs.readFile(file, 'utf8');
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, ' ');
  if (/^---\n/.test(raw)) {
    const end = raw.indexOf('\n---', 4);
    if (end !== -1) {
      const next = `${raw.slice(0, end)}\n${key}: "${escaped}"${raw.slice(end)}`;
      await fs.writeFile(file, next, 'utf8');
      return;
    }
  }
  throw new Error(`Cannot inject ${key}: invalid frontmatter in ${file}`);
}

function fallbackSummary(markdown) {
  return oneLine(markdown.replace(/```[\s\S]*?```/g, ' ').replace(/\[([^\]]+)]\([^)]*\)/g, '$1').replace(/[#>*_`~|\-]/g, ' ')).slice(0, 360);
}

function oneLine(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}
