'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, MessageSquare } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';

interface ConvRow {
  id: string;
  post_id: string | null;
  title: string | null;
  updated_at: string;
  posts: { title: string; slug: string } | null;
}

function timeAgo(iso: string): string {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'just now';
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

// Lists past conversations (current article first, then others by recency).
// Selecting one loads its full message list back into the panel for resume —
// without navigating away. Each off-article row links to its post.
export default function ConversationHistory({
  currentPostId,
  activeId,
  onSelect,
}: {
  currentPostId: string;
  activeId: string;
  onSelect: (id: string, messages: unknown[]) => void;
}) {
  const [rows, setRows] = useState<ConvRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('ai_conversations')
        .select('id, post_id, title, updated_at, posts(title, slug)')
        .order('updated_at', { ascending: false })
        .limit(100);
      setRows((data ?? []) as unknown as ConvRow[]);
      setLoading(false);
    })();
  }, []);

  const open = async (id: string) => {
    const supabase = getSupabaseClient();
    const { data } = await supabase.from('ai_conversations').select('messages').eq('id', id).single();
    onSelect(id, ((data?.messages as unknown[]) ?? []));
  };

  const current = rows.filter((r) => r.post_id === currentPostId);
  const others = rows.filter((r) => r.post_id !== currentPostId);

  const Row = ({ r, showArticle }: { r: ConvRow; showArticle?: boolean }) => (
    <button
      onClick={() => open(r.id)}
      className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
        r.id === activeId
          ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
          : 'border-transparent hover:bg-gray-100 dark:hover:bg-gray-700/50'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-gray-800 dark:text-gray-200 truncate">{r.title || 'Untitled chat'}</span>
        <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(r.updated_at)}</span>
      </div>
      {showArticle && r.posts && (
        <Link
          href={`/admin/posts/${r.posts.slug}`}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          {r.posts.title}
        </Link>
      )}
    </button>
  );

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
      {loading && <p className="text-sm text-gray-400 text-center mt-6">Loading…</p>}
      {!loading && rows.length === 0 && (
        <div className="text-center text-gray-400 text-sm mt-8">
          <MessageSquare className="w-7 h-7 mx-auto mb-2 opacity-50" />
          No past conversations yet.
        </div>
      )}

      {current.length > 0 && (
        <div>
          <p className="px-1 mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">This article</p>
          <div className="space-y-0.5">{current.map((r) => <Row key={r.id} r={r} />)}</div>
        </div>
      )}

      {others.length > 0 && (
        <div>
          <p className="px-1 mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Other articles</p>
          <div className="space-y-0.5">{others.map((r) => <Row key={r.id} r={r} showArticle />)}</div>
        </div>
      )}
    </div>
  );
}
