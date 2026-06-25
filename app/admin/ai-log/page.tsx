import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Pull readable text out of a message's parts/content (UI parts array, model
// content array, or plain string).
function extractText(parts: unknown): string {
  if (typeof parts === 'string') return parts;
  if (!Array.isArray(parts)) return '';
  return parts
    .map((p) => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : ''))
    .filter(Boolean)
    .join(' ');
}

interface Message {
  id: string;
  role: string;
  parts: unknown;
  tools: string[] | null;
  created_at: string;
}

interface Conversation {
  id: string;
  model: string | null;
  updated_at: string;
  posts: { title: string; slug: string } | null;
  ai_messages: Message[];
}

const UNATTACHED = '__none__';

export default async function AiLogPage({
  searchParams,
}: {
  searchParams: Promise<{ post?: string }>;
}) {
  const { post: postFilter } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/admin/login');

  const { data } = await supabase
    .from('ai_conversations')
    .select('id, model, updated_at, posts(title, slug), ai_messages(id, role, parts, tools, created_at)')
    .order('updated_at', { ascending: false })
    .limit(200);

  const conversations = (data ?? []) as unknown as Conversation[];

  // Group conversations by article. All articles stay on one page — the filter
  // narrows the view but you can always jump back to "All articles".
  const groups = new Map<string, { title: string; slug: string | null; convos: Conversation[] }>();
  for (const c of conversations) {
    const key = c.posts?.slug ?? UNATTACHED;
    if (!groups.has(key)) {
      groups.set(key, { title: c.posts?.title ?? 'Unattached', slug: c.posts?.slug ?? null, convos: [] });
    }
    groups.get(key)!.convos.push(c);
  }
  const allGroups = [...groups.values()];
  const visibleGroups = postFilter ? allGroups.filter((g) => (g.slug ?? UNATTACHED) === postFilter) : allGroups;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-4">
          <Link href="/admin" className="text-xl font-bold text-gray-900 dark:text-white">Blog CMS</Link>
          <span className="text-gray-400">/</span>
          <h1 className="text-gray-700 dark:text-gray-200">AI activity log</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* Article filter — chips. "All" is always available so nothing is siloed. */}
        {allGroups.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <Link
              href="/admin/ai-log"
              className={`px-2.5 py-1 text-sm rounded-full border ${!postFilter ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
            >
              All articles
            </Link>
            {allGroups.map((g) => {
              const key = g.slug ?? UNATTACHED;
              const active = postFilter === key;
              return (
                <Link
                  key={key}
                  href={`/admin/ai-log?post=${key}`}
                  className={`px-2.5 py-1 text-sm rounded-full border ${active ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
                >
                  {g.title} <span className="opacity-60">({g.convos.length})</span>
                </Link>
              );
            })}
          </div>
        )}

        {visibleGroups.length === 0 && <p className="text-gray-500">No AI conversations logged yet.</p>}

        <div className="space-y-10">
          {visibleGroups.map((g) => (
            <section key={g.slug ?? UNATTACHED}>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                {g.slug ? (
                  <Link href={`/admin/posts/${g.slug}`} className="hover:underline">{g.title}</Link>
                ) : (
                  <span className="text-gray-400">{g.title}</span>
                )}
              </h2>
              <div className="space-y-4">
                {g.convos.map((c) => {
                  const messages = [...(c.ai_messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at));
                  return (
                    <div key={c.id} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/40 border-b border-gray-200 dark:border-gray-700 text-xs text-gray-400">
                        {c.model} · {new Date(c.updated_at).toLocaleString()} · {messages.length} messages
                      </div>
                      <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {messages.map((m) => {
                          const text = extractText(m.parts);
                          const tools = m.tools ?? [];
                          return (
                            <div key={m.id} className="px-4 py-2.5 text-sm">
                              <span className={`inline-block w-20 font-medium align-top ${m.role === 'user' ? 'text-gray-500' : 'text-purple-600 dark:text-purple-400'}`}>
                                {m.role}
                              </span>
                              {text && <span className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{text}</span>}
                              {tools.length > 0 && (
                                <div className="mt-1 ml-20 flex flex-wrap gap-1">
                                  {tools.map((t, i) => (
                                    <span key={i} className="px-1.5 py-0.5 text-xs rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">{t}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
