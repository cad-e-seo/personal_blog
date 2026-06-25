'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase/client';
import type { PostWithAsset, Footnote } from '@/lib/supabase/types';
import PostMetadataForm from './PostMetadataForm';
import FootnoteEditor from './FootnoteEditor';
import LexicalEditor from './lexical/LexicalEditor';
import { Save, Eye, Settings, ChevronDown, ChevronUp, Superscript, Sparkles } from 'lucide-react';
import NewsletterSendPanel from './NewsletterSendPanel';
import AIChatPanel, { type AIChatPanelHandle } from './ai/AIChatPanel';
import PostHistory from './PostHistory';
import { EditingLanguageProvider } from '@/lib/EditingLanguageContext';
import type { LexicalEditor as LexicalEditorType } from 'lexical';
import { $getNodeByKey, $isElementNode, $getRoot, $setSelection, type LexicalNode } from 'lexical';
import { INSERT_FOOTNOTE_REF_COMMAND } from '@/lib/lexical/commands';
import { $createSuggestionBlockNode } from '@/lib/lexical/nodes/SuggestionBlockNode';

interface PostEditorProps {
  post: PostWithAsset;
  previewToken?: string;
}

export default function PostEditor({ post, previewToken }: PostEditorProps) {
  return (
    <EditingLanguageProvider defaultLanguage={post.language ?? 'en'}>
      <PostEditorInner post={post} previewToken={previewToken} />
    </EditingLanguageProvider>
  );
}

function PostEditorInner({ post, previewToken }: PostEditorProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showFootnotes, setShowFootnotes] = useState(false);
  const [footnotes, setFootnotes] = useState<Footnote[]>(post.footnotes ?? []);
  const editorStateRef = useRef<Record<string, unknown> | null>(post.editor_state ?? null);
  const lexicalEditorRef = useRef<LexicalEditorType | null>(null);
  const aiChatRef = useRef<AIChatPanelHandle>(null);
  const footnotesRef = useRef(footnotes);
  footnotesRef.current = footnotes;

  const handleSave = useCallback(
    async (editorState: Record<string, unknown>) => {
      editorStateRef.current = editorState;
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('posts')
        .update({
          editor_state: editorState,
          footnotes: footnotesRef.current,
        })
        .eq('id', post.id);

      if (error) {
        console.error('Error saving editor state:', error);
        throw error;
      }
    },
    [post.id]
  );

  const handleManualSave = async () => {
    setSaving(true);
    try {
      const supabase = getSupabaseClient();
      const updatePayload: Record<string, unknown> = { footnotes };

      if (editorStateRef.current) {
        updatePayload.editor_state = editorStateRef.current;
      }

      const { error } = await supabase
        .from('posts')
        .update(updatePayload)
        .eq('id', post.id);

      if (error) {
        console.error('Error saving:', error);
      }
    } catch (err) {
      console.error('Error saving:', err);
    } finally {
      setSaving(false);
    }
  };

  const publishPost = async () => {
    const supabase = getSupabaseClient();
    const publishedAt = post.published_at || new Date().toISOString();
    const { error } = await supabase
      .from('posts')
      .update({ status: 'published', published_at: publishedAt })
      .eq('id', post.id);

    if (error) {
      console.error('Error publishing post:', error);
      return;
    }
    router.refresh();
  };

  const unpublishPost = async () => {
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('posts')
      .update({ status: 'draft' })
      .eq('id', post.id);

    if (error) {
      console.error('Error unpublishing post:', error);
      return;
    }
    router.refresh();
  };

  const deletePost = async () => {
    if (!confirm('Are you sure you want to delete this post? This cannot be undone.')) {
      return;
    }
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    if (error) {
      console.error('Error deleting post:', error);
      return;
    }
    router.push('/admin/posts');
  };

  // Called by slash command: creates a footnote entry and returns its id/label
  const handleInsertFootnote = useCallback((): { id: string; label: string } | null => {
    const newId = `fn-${Date.now()}`;
    const newLabel = `${footnotesRef.current.length + 1}`;
    const newFootnote: Footnote = { id: newId, label: newLabel, content: '' };
    const updated = [...footnotesRef.current, newFootnote];
    setFootnotes(updated);
    setShowFootnotes(true);
    return { id: newId, label: newLabel };
  }, []);

  // Add footnote from the top bar button: creates footnote + inserts ref at cursor
  const handleAddFootnoteFromBar = useCallback(() => {
    const editor = lexicalEditorRef.current;
    if (!editor) return;

    const newId = `fn-${Date.now()}`;
    const newLabel = `${footnotesRef.current.length + 1}`;
    const newFootnote: Footnote = { id: newId, label: newLabel, content: '' };
    const updated = [...footnotesRef.current, newFootnote];
    setFootnotes(updated);
    setShowFootnotes(true);

    editor.dispatchCommand(INSERT_FOOTNOTE_REF_COMMAND, { footnoteId: newId, label: newLabel });
  }, []);

  // AI block action: call /api/ai/action and create a suggestion from the result
  const handleAIBlockAction = useCallback(async (action: string, nodeKey: string, nodeText: string) => {
    const editor = lexicalEditorRef.current;
    if (!editor) return;

    const res = await fetch('/api/ai/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        text: nodeText,
        context: `Article: "${post.title}"`,
        language: post.language ?? 'en',
      }),
    });

    if (!res.ok) return;
    const { result } = await res.json();
    if (!result) return;

    // Create a suggestion instead of applying directly
    editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (!node || !$isElementNode(node)) return;

      // Recursively serialize node + children (exportJSON alone doesn't include children)
      const serializeNode = (n: LexicalNode): Record<string, unknown> => {
        const json = n.exportJSON() as Record<string, unknown>;
        if ($isElementNode(n)) {
          json.children = n.getChildren().map((c) => serializeNode(c));
        }
        return json;
      };
      const originalJSON = JSON.stringify(serializeNode(node));
      const suggestionNode = $createSuggestionBlockNode({
        suggestionId: `sg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        suggestionType: 'block-replacement',
        originalBlockJSON: originalJSON,
        suggestedMarkdown: result,
        author: 'ai',
      });

      node.replace(suggestionNode);

      // Move selection to root to avoid "selection lost" warning
      const root = $getRoot();
      const firstChild = root.getFirstChild();
      if (firstChild) {
        firstChild.selectStart();
      } else {
        $setSelection(null);
      }
    });
  }, [post.title, post.language]);

  const handleOpenAIChat = useCallback((prompt: string) => {
    aiChatRef.current?.openAndSend(prompt);
  }, []);

  return (
    <div className="min-h-screen">
      {/* Sticky Top Bar */}
      <div className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto flex items-center justify-between h-14">
          <div className="flex items-center gap-3 min-w-0">
            <StatusBadge status={post.status} publishedAt={post.published_at} />
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {post.title}
            </h1>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleAddFootnoteFromBar}
              title="Insert footnote at cursor"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-md transition-colors"
            >
              <Superscript className="w-4 h-4" />
              Footnote
            </button>

            <PostHistory postId={post.id} />

            <button
              onClick={() => setShowMetadata(!showMetadata)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-md transition-colors"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>

            <Link
              href={`/blog/${post.slug}${previewToken ? `?preview=${previewToken}` : ''}`}
              target="_blank"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-md transition-colors"
            >
              <Eye className="w-4 h-4" />
              Preview
            </Link>

            <button
              onClick={handleManualSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-md transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save'}
            </button>

            {post.status === 'draft' ? (
              <button
                onClick={publishPost}
                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white font-medium rounded-md transition-colors"
              >
                Publish
              </button>
            ) : (
              <button
                onClick={unpublishPost}
                className="px-3 py-1.5 text-sm bg-yellow-600 hover:bg-yellow-700 text-white font-medium rounded-md transition-colors"
              >
                Unpublish
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Collapsible Settings Panel */}
      {showMetadata && (
        <div className="max-w-4xl mx-auto mt-4 px-4 sm:px-6 lg:px-8">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <PostMetadataForm post={post} onDelete={deletePost} />
          </div>
        </div>
      )}

      {/* Main Editor Area */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LexicalEditor
          postId={post.id}
          initialEditorState={post.editor_state}
          onSave={handleSave}
          editorRef={lexicalEditorRef}
          onInsertFootnote={handleInsertFootnote}
          postLanguage={post.language ?? 'en'}
          onAIBlockAction={handleAIBlockAction}
          onOpenAIChat={handleOpenAIChat}
        />
      </div>

      {/* Newsletter Send Panel */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <NewsletterSendPanel postId={post.id} postStatus={post.status} postLanguage={post.language ?? 'en'} />
      </div>

      {/* Collapsible Footnotes Panel */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <button
          onClick={() => setShowFootnotes(!showFootnotes)}
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
        >
          {showFootnotes ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          Footnotes ({footnotes.length})
        </button>
        {showFootnotes && (
          <div className="mt-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <FootnoteEditor footnotes={footnotes} onChange={setFootnotes} />
          </div>
        )}
      </div>

      {/* AI Chat Panel */}
      <AIChatPanel ref={aiChatRef} editorRef={lexicalEditorRef} post={post} />
    </div>
  );
}

function StatusBadge({ status, publishedAt }: { status: string; publishedAt: string | null }) {
  const isScheduled = publishedAt && new Date(publishedAt) > new Date();
  const displayStatus = isScheduled ? 'scheduled' : status;

  const styles: Record<string, string> = {
    published: 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400',
    scheduled: 'bg-purple-100 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
    draft: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
    archived: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${styles[displayStatus] ?? styles.draft}`}>
      {displayStatus}
    </span>
  );
}

