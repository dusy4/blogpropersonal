import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL } from './config';

type ClaudeResponse = {
  content?: Array<{ type: string; text?: string }>;
};

async function callClaude(system: string, text: string, maxTokens = 700): Promise<string> {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not configured in Vercel.');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      thinking: { type: 'disabled' },
      system,
      messages: [{ role: 'user', content: text }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as ClaudeResponse;
  return (data.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text || '')
    .join('')
    .trim();
}

export async function generateKeyTakeaways(markdownBody: string): Promise<string> {
  return callClaude(
    'You write Answer-First summaries for AI-readable business articles. Return only the summary text: exactly 3-4 concise factual sentences, in the same language as the article. No heading, bullets, markdown fences, or commentary.',
    markdownBody,
    500,
  );
}
