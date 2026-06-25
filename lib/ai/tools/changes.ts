import { tool } from 'ai';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { lexicalToMarkdown } from '@/lib/export/lexical-to-markdown';
import type { Footnote } from '@/lib/supabase/types';
import { diffMarkdown, summarizeChange } from './change-diff';

const toMd = (editorState: unknown, footnotes: unknown): string =>
  editorState
    ? lexicalToMarkdown(editorState as Record<string, unknown>, { footnotes: (footnotes as Footnote[]) ?? [] })
    : '';

// Server-executed: lets the model answer "what were the last few edits?".
// post_versions holds a snapshot of the PREVIOUS body before each save, so the
// change chain is [current content] -> [most recent version] -> [older] ...
const listRecentChangesTool = tool({
  description:
    'List the most recent edits made to an article (newest first), with a short summary of what changed in each. Use this to answer questions like "what were the last few edits?". Pass the current article slug.',
  inputSchema: z.object({
    slug: z.string().describe('The article slug'),
    limit: z.number().optional().describe('How many recent changes to summarise (default 5)'),
  }),
  execute: async ({ slug, limit }) => {
    const n = limit ?? 5;
    const supabase = createServiceClient();

    const { data: post, error: postErr } = await supabase
      .from('posts')
      .select('id, editor_state, footnotes')
      .eq('slug', slug)
      .single();
    if (postErr || !post) return { error: postErr?.message ?? 'Article not found' };

    const { data: versions, error: vErr } = await supabase
      .from('post_versions')
      .select('created_at, editor_state, footnotes')
      .eq('post_id', post.id)
      .order('created_at', { ascending: false })
      .limit(n);
    if (vErr) return { error: vErr.message };
    if (!versions || versions.length === 0) return { changes: [], note: 'No saved edit history yet.' };

    // Chain newest -> oldest: current content, then each prior snapshot.
    const chain = [
      { at: 'now', md: toMd(post.editor_state, post.footnotes) },
      ...versions.map((v) => ({ at: v.created_at as string, md: toMd(v.editor_state, v.footnotes) })),
    ];

    const changes = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const summary = summarizeChange(diffMarkdown(chain[i + 1].md, chain[i].md));
      changes.push({ savedAt: chain[i + 1].at, summary });
    }
    return { changes };
  },
});

export const changeTools = {
  list_recent_changes: listRecentChangesTool,
};
