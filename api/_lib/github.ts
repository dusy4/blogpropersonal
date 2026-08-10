import { GITHUB_BRANCH, GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN } from './config';

export type ContentEntry = {
  name: string;
  path: string;
  sha: string;
  title: string;
  slug: string;
  date: string;
  image: string;
  sourceChannelId: string;
  sourceMessageId: string;
};

export type CommitChange = {
  path: string;
  content?: string;
  bytes?: Uint8Array;
  delete?: boolean;
};

const apiBase = () => `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

function assertConfigured() {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error('GitHub publishing variables are not fully configured.');
  }
}

function headers() {
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'propersonal-telegram-publisher',
  };
}

function contentsUrl(path: string) {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  return `${apiBase()}/contents/${encodedPath}`;
}

async function githubJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${await response.text()}`);
  return response.json();
}

export async function commitFile(path: string, content: string, message: string) {
  assertConfigured();

  const url = contentsUrl(path);
  const requestHeaders = headers();
  const existingResponse = await fetch(`${url}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers: requestHeaders });
  let sha: string | undefined;
  if (existingResponse.ok) {
    const existing = (await existingResponse.json()) as { sha: string };
    sha = existing.sha;
  } else if (existingResponse.status !== 404) {
    throw new Error(`GitHub read ${existingResponse.status}: ${await existingResponse.text()}`);
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: { ...requestHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: utf8ToBase64(content),
      branch: GITHUB_BRANCH,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!response.ok) throw new Error(`GitHub write ${response.status}: ${await response.text()}`);
  return response.json();
}

export async function commitFiles(changes: CommitChange[], message: string) {
  assertConfigured();
  if (!changes.length) throw new Error('No GitHub changes supplied.');

  const branch = await githubJson(`${apiBase()}/branches/${encodeURIComponent(GITHUB_BRANCH)}`) as {
    commit: { sha: string };
  };
  const parentSha = branch.commit.sha;
  const parentCommit = await githubJson(`${apiBase()}/git/commits/${parentSha}`) as {
    tree: { sha: string };
  };

  const tree: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];
  for (const change of changes) {
    if (change.delete) {
      tree.push({ path: change.path, mode: '100644', type: 'blob', sha: null });
      continue;
    }

    const encoded = change.bytes
      ? bytesToBase64(change.bytes)
      : utf8ToBase64(change.content || '');
    const blob = await githubJson(`${apiBase()}/git/blobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: encoded, encoding: 'base64' }),
    }) as { sha: string };
    tree.push({ path: change.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  const nextTree = await githubJson(`${apiBase()}/git/trees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree }),
  }) as { sha: string };

  const commit = await githubJson(`${apiBase()}/git/commits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tree: nextTree.sha, parents: [parentSha] }),
  }) as { sha: string };

  await githubJson(`${apiBase()}/git/refs/heads/${GITHUB_BRANCH.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return commit;
}

export async function listMarkdownEntries(directory: string): Promise<ContentEntry[]> {
  assertConfigured();
  const requestHeaders = headers();
  const response = await fetch(`${contentsUrl(directory)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, {
    headers: requestHeaders,
  });

  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`GitHub list ${response.status}: ${await response.text()}`);

  const items = (await response.json()) as Array<{ name: string; path: string; sha: string; type: string }>;
  const markdownFiles = items.filter((item) => item.type === 'file' && item.name.endsWith('.md'));

  const entries = await Promise.all(markdownFiles.map(async (item) => {
    const fileResponse = await fetch(`${contentsUrl(item.path)}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, {
      headers: requestHeaders,
    });
    if (!fileResponse.ok) throw new Error(`GitHub read ${fileResponse.status}: ${await fileResponse.text()}`);

    const file = (await fileResponse.json()) as { content?: string; encoding?: string };
    const source = file.encoding === 'base64' && file.content
      ? base64ToUtf8(file.content.replace(/\s/g, ''))
      : '';
    const title = readFrontmatterValue(source, 'title') || filenameSlug(item.name);
    const slug = readFrontmatterValue(source, 'slug') || filenameSlug(item.name);
    const date = readFrontmatterValue(source, 'date') || '';
    const image = readFrontmatterValue(source, 'image') || '';
    const sourceChannelId = readFrontmatterValue(source, 'sourceChannelId') || '';
    const sourceMessageId = readFrontmatterValue(source, 'sourceMessageId') || '';

    return { ...item, title, slug, date, image, sourceChannelId, sourceMessageId };
  }));

  return entries.sort((a, b) => {
    const byDate = Date.parse(b.date || '') - Date.parse(a.date || '');
    return Number.isFinite(byDate) && byDate !== 0 ? byDate : b.name.localeCompare(a.name);
  });
}

export async function findArticleByTelegramSource(directory: string, channelId: number, messageId: number) {
  const entries = await listMarkdownEntries(directory);
  return entries.find((entry) =>
    entry.sourceChannelId === String(channelId) && entry.sourceMessageId === String(messageId)
  ) || null;
}

export async function deleteFile(path: string, sha: string, message: string) {
  assertConfigured();
  const response = await fetch(contentsUrl(path), {
    method: 'DELETE',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: GITHUB_BRANCH }),
  });

  if (!response.ok) throw new Error(`GitHub delete ${response.status}: ${await response.text()}`);
  return response.json();
}

function readFrontmatterValue(source: string, key: string) {
  const match = source.match(new RegExp(`^${key}:\\s*(.+?)\\s*$`, 'm'));
  if (!match) return '';
  const raw = match[1].trim();
  const quoted = (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"));
  const value = quoted ? raw.slice(1, -1) : raw;
  return value.replace(/\\"/g, '"').replace(/\\\\/g, '\\').trim();
}

function filenameSlug(name: string) {
  return name.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/i, '');
}

function utf8ToBase64(value: string): string {
  return bytesToBase64(new TextEncoder().encode(value));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToUtf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
