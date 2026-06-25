-- Conversation management: store the full message list + a title per
-- conversation so the chat panel can list, open, and resume past conversations.
-- Run after 007_ai_log_and_versions.sql

ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS messages JSONB NOT NULL DEFAULT '[]';
ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS title TEXT;

-- ponytail: ai_messages (from 007) is now superseded by ai_conversations.messages,
-- which holds the full UIMessage list (powers both resume and the admin log).
-- Left in place rather than dropped — harmless, and avoids losing logged rows.
-- Drop later if you want: DROP TABLE ai_messages;
