import { tool } from 'ai';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { lexicalToMarkdown } from '@/lib/export/lexical-to-markdown';
import type { Footnote } from '@/lib/supabase/types';
import { toArticleSummary } from './article-format';

// Server-executed read tools: the model calls them and the AI SDK runs the
// `execute` on the server, so the article body is converted to Markdown here and
// only the concise text crosses the wire (never the raw Lexical JSON).

const listArticlesTool = tool({
  description:
    'List previous articles on the blog (title, slug, tags, status). Use this to find an article, then read it with get_article_markdown.',
  inputSchema: z.object({
    status: z.enum(['published', 'draft', 'archived']).optional().describe('Filter by status; omit for all'),
    limit: z.number().optional().describe('Max number to return (default 50)'),
  }),
  execute: async ({ status, limit }) => {
    const supabase = createServiceClient();
    let q = supabase
      .from('posts')
      .select('title, slug, status, major_tag, tags, published_at')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(limit ?? 50);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return { articles: (data ?? []).map(toArticleSummary) };
  },
});

const getArticleMarkdownTool = tool({
  description:
    "Get a previous article's full content as Markdown (concise — not the raw editor JSON). Pass the slug from list_articles.",
  inputSchema: z.object({
    slug: z.string().describe('The article slug'),
  }),
  execute: async ({ slug }) => {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('posts')
      .select('title, editor_state, footnotes')
      .eq('slug', slug)
      .single();
    if (error || !data) return { error: error?.message ?? 'Article not found' };
    if (!data.editor_state) return { title: data.title, markdown: '' };
    const markdown = lexicalToMarkdown(data.editor_state as Record<string, unknown>, {
      footnotes: (data.footnotes as Footnote[]) ?? [],
    });
    return { title: data.title, markdown };
  },
});

export const articleTools = {
  list_articles: listArticlesTool,
  get_article_markdown: getArticleMarkdownTool,
};
