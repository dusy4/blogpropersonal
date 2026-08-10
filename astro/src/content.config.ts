import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    date: z.coerce.date(),
    keyTakeaways: z.string(),
    author: z.string().default('Pro Personal Agency'),
    image: z.string().optional(),
  }),
});

const cases = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/cases' }),
  schema: z.object({
    title: z.string(),
    slug: z.string().optional(),
    date: z.coerce.date().optional(),
    client: z.string().optional(),
    description: z.string(),
    result: z.string().optional(),
    image: z.string().optional(),
    url: z.string().url().optional(),
  }),
});

export const collections = { articles, cases };
