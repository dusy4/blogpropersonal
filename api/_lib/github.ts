import { GITHUB_BRANCH, GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN } from './config';

const apiBase = () => `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

export async function commitFile(path: string, content: string, message: string) {
  if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error('GitHub publishing variables are not fully configured.');
  }

  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const url = `${apiBase()}/contents/${encodedPath}`;
  const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'propersonal-telegram-publisher',
  };

  const existingResponse = await fetch(`${url}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  let sha: string | undefined;
  if (existingResponse.ok) {
    const existing = (await existingResponse.json()) as { sha: string };
    sha = existing.sha;
  } else if (existingResponse.status !== 404) {
    throw new Error(`GitHub read ${existingResponse.status}: ${await existingResponse.text()}`);
  }

  const response = await fetch(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
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

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
