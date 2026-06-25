'use client';

import { useState, useRef, useEffect, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import type { LexicalEditor } from 'lexical';
import type { PostWithAsset } from '@/lib/supabase/types';
import { executeToolCall } from '@/lib/ai/tool-executor';
import { buildSystemPrompt } from '@/lib/ai/system-prompt';
import { extractFileContent, type Attachment } from '@/lib/ai/attachments';
import AIChatMessage from './AIChatMessage';
import ConversationHistory from './ConversationHistory';
import { getSupabaseClient } from '@/lib/supabase/client';
import { Sparkles, X, Minus, Send, Trash2, Paperclip, FileText, Image as ImageIcon, FileType, Plus, History } from 'lucide-react';

// First user message text, trimmed — used as the conversation's list title.
function deriveTitle(messages: { role: string; parts?: unknown }[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  const parts = firstUser?.parts;
  const text = Array.isArray(parts)
    ? parts.map((p) => (p && typeof p === 'object' && typeof (p as { text?: unknown }).text === 'string' ? (p as { text: string }).text : '')).join(' ').trim()
    : '';
  return text.slice(0, 80) || 'Untitled chat';
}

export interface AIChatPanelHandle {
  openAndSend: (text: string) => void;
}

interface AIChatPanelProps {
  editorRef: React.RefObject<LexicalEditor | null>;
  post: PostWithAsset;
}

const ATTACHMENT_ICON: Record<Attachment['type'], React.ReactNode> = {
  text: <FileText className="w-3 h-3" />,
  image: <ImageIcon className="w-3 h-3" />,
  pdf: <FileType className="w-3 h-3" />,
};

const AIChatPanel = forwardRef<AIChatPanelHandle, AIChatPanelProps>(function AIChatPanel({ editorRef, post }, ref) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachLoading, setAttachLoading] = useState(false);
  const attachmentsRef = useRef<Attachment[]>([]);
  attachmentsRef.current = attachments;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const systemPrompt = useMemo(
    () => buildSystemPrompt(post, attachments.length > 0 ? attachments : undefined),
    [post, attachments]
  );

  // Id for the active chat session; changes when starting/resuming a conversation.
  const [conversationId, setConversationId] = useState(() => crypto.randomUUID());
  const [showHistory, setShowHistory] = useState(false);

  const transport = useMemo(
    () => new DefaultChatTransport({
      api: '/api/ai/chat',
      body: { system: systemPrompt },
    }),
    [systemPrompt]
  );

  const { messages, sendMessage, addToolOutput, status, setMessages } = useChat({
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      const editor = editorRef.current;
      if (!editor) {
        addToolOutput({
          tool: toolCall.toolName as never,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: 'Editor not available',
        });
        return;
      }
      try {
        const result = await executeToolCall(
          toolCall.toolName,
          (toolCall as unknown as { input: Record<string, unknown> }).input ?? {},
          { editor, post, sources: attachmentsRef.current }
        );
        addToolOutput({
          tool: toolCall.toolName as never,
          toolCallId: toolCall.toolCallId,
          output: result as never,
        });
      } catch (err) {
        addToolOutput({
          tool: toolCall.toolName as never,
          toolCallId: toolCall.toolCallId,
          state: 'output-error',
          errorText: err instanceof Error ? err.message : 'Tool execution failed',
        });
      }
    },
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // Persist the full conversation when a stream finishes (powers history + resume).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const wasLoading = useRef(false);
  useEffect(() => {
    if (wasLoading.current && !isLoading) {
      const msgs = messagesRef.current;
      if (msgs.length > 0) {
        getSupabaseClient()
          .from('ai_conversations')
          .upsert(
            {
              id: conversationId,
              post_id: post.id,
              model: 'anthropic/claude-sonnet-4',
              title: deriveTitle(msgs as { role: string; parts?: unknown }[]),
              messages: msgs,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          )
          .then(({ error }) => error && console.error('Save conversation failed:', error));
      }
    }
    wasLoading.current = isLoading;
  }, [isLoading, conversationId, post.id]);

  const startNewConversation = useCallback(() => {
    setMessages([]);
    setConversationId(crypto.randomUUID());
    setShowHistory(false);
  }, [setMessages]);

  const resumeConversation = useCallback((id: string, msgs: unknown[]) => {
    setConversationId(id);
    setMessages((msgs as Parameters<typeof setMessages>[0]) ?? []);
    setShowHistory(false);
  }, [setMessages]);

  // Expose openAndSend method for parent
  useImperativeHandle(ref, () => ({
    openAndSend: (text: string) => {
      setIsOpen(true);
      setIsMinimized(false);
      sendMessage({ text });
    },
  }), [sendMessage]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && !isMinimized) {
      inputRef.current?.focus();
    }
  }, [isOpen, isMinimized]);

  // Keyboard shortcut: Cmd+Shift+A to toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.shiftKey && e.key === 'a') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setIsMinimized(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const addFiles = useCallback(async (files: FileList | File[]) => {
    setAttachLoading(true);
    try {
      const fileArray = Array.from(files);
      const results = await Promise.allSettled(fileArray.map(extractFileContent));
      const newAttachments: Attachment[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') newAttachments.push(r.value);
        else console.error('Failed to process file:', r.reason);
      }
      if (newAttachments.length > 0) {
        setAttachments((prev) => [...prev, ...newAttachments]);
      }
    } finally {
      setAttachLoading(false);
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  }, [addFiles]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = e.clipboardData?.files;
    if (files && files.length > 0) {
      e.preventDefault();
      addFiles(files);
    }
  }, [addFiles]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      addFiles(files);
    }
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    sendMessage({ text });
  }, [input, isLoading, sendMessage]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Collapsed: floating button
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all hover:shadow-xl"
        title="Open AI assistant (Cmd+Shift+A)"
      >
        <Sparkles className="w-4 h-4" />
        <span className="text-sm font-medium">AI</span>
      </button>
    );
  }

  // Minimized: small bar
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-2">
        <Sparkles className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Assistant</span>
        {isLoading && (
          <svg className="w-3.5 h-3.5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        <button onClick={() => setIsMinimized(false)} className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Full panel
  return (
    <div
      className="fixed bottom-6 right-6 z-50 w-[400px] h-[500px] flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">AI Assistant</span>
          {isLoading && (
            <svg className="w-3.5 h-3.5 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={startNewConversation}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            title="New conversation"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`p-1.5 rounded transition-colors ${showHistory ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
            title="Conversation history"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setMessages([])}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsMinimized(true)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Attachments bar */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          {attachments.map((att) => (
            <span
              key={att.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-full text-gray-600 dark:text-gray-300"
            >
              {ATTACHMENT_ICON[att.type]}
              <span className="max-w-[100px] truncate">{att.name}</span>
              <button
                onClick={() => removeAttachment(att.id)}
                className="ml-0.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {attachLoading && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400">
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Processing...
            </span>
          )}
        </div>
      )}

      {/* History view (swaps out the message list) */}
      {showHistory && (
        <ConversationHistory
          currentPostId={post.id}
          activeId={conversationId}
          onSelect={resumeConversation}
        />
      )}

      {/* Messages */}
      {!showHistory && (
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-500 text-sm mt-8">
            <Sparkles className="w-8 h-8 mx-auto mb-3 opacity-50" />
            <p>Ask me about your article,</p>
            <p>or ask me to make changes.</p>
            <p className="mt-2 text-xs text-gray-300 dark:text-gray-600">Cmd+Shift+A to toggle</p>
          </div>
        )}
        {messages.map((message) => (
          <AIChatMessage key={message.id} message={message} />
        ))}
        <div ref={messagesEndRef} />
      </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-3 py-2.5">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInput}
          accept=".txt,.md,.csv,.json,.html,.xml,.yml,.yaml,.toml,.ts,.tsx,.js,.jsx,.css,.scss,.png,.jpg,.jpeg,.gif,.webp,.svg,.pdf"
        />
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={attachLoading}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg transition-colors"
            title="Attach files"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={handlePaste}
            placeholder="Ask about your article..."
            rows={1}
            className="flex-1 resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
            style={{ maxHeight: '100px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 100) + 'px';
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white rounded-lg transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

export default AIChatPanel;
