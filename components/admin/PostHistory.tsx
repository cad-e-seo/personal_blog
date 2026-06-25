'use client';

import { useState } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';

interface Version {
  id: string;
  created_at: string;
}

// Post-save rollback UI. Versions are captured automatically by a DB trigger
// (see migration 007), so this only reads them and restores on demand.
export default function PostHistory({ postId }: { postId: string }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = async () => {
    setOpen(true);
    setLoading(true);
    const supabase = getSupabaseClient();
    const { data } = await supabase
      .from('post_versions')
      .select('id, created_at')
      .eq('post_id', postId)
      .order('created_at', { ascending: false })
      .limit(50);
    setVersions(data ?? []);
    setLoading(false);
  };

  const restore = async (versionId: string) => {
    if (!confirm('Restore this version? Your current content is snapshotted first, so this is reversible.')) return;
    setRestoringId(versionId);
    const supabase = getSupabaseClient();
    const { data: version } = await supabase
      .from('post_versions')
      .select('editor_state, footnotes')
      .eq('id', versionId)
      .single();
    if (version) {
      await supabase
        .from('posts')
        .update({ editor_state: version.editor_state, footnotes: version.footnotes })
        .eq('id', postId);
      // Reload so the Lexical editor re-initialises from the restored state.
      window.location.reload();
      return;
    }
    setRestoringId(null);
  };

  return (
    <>
      <button
        onClick={load}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-md transition-colors"
      >
        <History className="w-4 h-4" />
        History
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md max-h-[70vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
              <h3 className="font-medium text-gray-900 dark:text-white">Version history</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto">
              {loading && <p className="px-4 py-6 text-sm text-gray-500">Loading…</p>}
              {!loading && versions.length === 0 && (
                <p className="px-4 py-6 text-sm text-gray-500">No saved versions yet. They appear after your next edit.</p>
              )}
              {!loading &&
                versions.map((v) => (
                  <div
                    key={v.id}
                    className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 dark:border-gray-700/50"
                  >
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      {new Date(v.created_at).toLocaleString()}
                    </span>
                    <button
                      onClick={() => restore(v.id)}
                      disabled={restoringId === v.id}
                      className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {restoringId === v.id ? 'Restoring…' : 'Restore'}
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
