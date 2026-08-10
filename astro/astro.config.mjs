import { defineConfig } from 'astro/config';

const rawSite = process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || 'https://example.com';
const site = /^https?:\/\//i.test(rawSite) ? rawSite : `https://${rawSite}`;

export default defineConfig({
  site: site.replace(/\/$/, ''),
  output: 'static',
});
