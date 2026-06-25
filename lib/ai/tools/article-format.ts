// Pure helpers for the article read-tools — no server/db imports, so they're
// unit-testable in plain node without a Supabase connection.

export interface ArticleSummary {
  title: string;
  slug: string;
  status: string;
  major_tag: string | null;
  tags: string[];
  published_at: string | null;
}

// Trim a post row down to the concise fields the model needs to pick an article.
export function toArticleSummary(p: Record<string, unknown>): ArticleSummary {
  return {
    title: String(p.title ?? ''),
    slug: String(p.slug ?? ''),
    status: String(p.status ?? ''),
    major_tag: (p.major_tag as string) ?? null,
    tags: Array.isArray(p.tags) ? (p.tags as string[]) : [],
    published_at: (p.published_at as string) ?? null,
  };
}
