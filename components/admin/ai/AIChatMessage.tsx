'use client';

import type { UIMessage } from 'ai';
import { markdownToSafeHtmlSync } from '@/lib/utils';

interface AIChatMessageProps {
  message: UIMessage;
}

export default function AIChatMessage({ message }: AIChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
        }`}
      >
        {message.parts?.map((part, i) => {
          if (part.type === 'text') {
            // User text is their own literal input — keep it plain. Assistant text
            // is rendered as (sanitized) Markdown.
            if (isUser) {
              return (
                <div key={i} className="whitespace-pre-wrap break-words">
                  {part.text}
                </div>
              );
            }
            return (
              <div
                key={i}
                className="break-words prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-pre:my-2 prose-headings:my-2"
                dangerouslySetInnerHTML={{ __html: markdownToSafeHtmlSync(part.text) }}
              />
            );
          }

          // Tool invocation parts have type `tool-${name}`
          if (part.type.startsWith('tool-')) {
            const toolPart = part as { type: string; toolCallId: string; state: string };
            const toolName = part.type.replace(/^tool-/, '').replace(/_/g, ' ');
            const isComplete = toolPart.state === 'output-available';
            return (
              <div
                key={i}
                className={`my-1 flex items-center gap-1.5 text-xs rounded px-2 py-1 ${
                  isComplete
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                }`}
              >
                {isComplete ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                <span className="capitalize">{toolName}</span>
              </div>
            );
          }

          return null;
        })}
        {/* Fallback for messages without parts */}
        {(!message.parts || message.parts.length === 0) && (
          <div className="whitespace-pre-wrap break-words text-gray-400">(empty)</div>
        )}
      </div>
    </div>
  );
}
