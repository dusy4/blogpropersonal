import { getCollection } from 'astro:content';
import { SITE_URL } from '../config';

export async function GET() {
  const articles = await getCollection('articles');
  const slugFor = (id: string, explicit?: string) => explicit || id.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/\.md$/, '');
  const urls = [
    `${SITE_URL}/`,
    `${SITE_URL}/articles`,
    `${SITE_URL}/cases`,
    ...articles.map((entry) => `${SITE_URL}/articles/${slugFor(entry.id, entry.data.slug)}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char] || char));
}
