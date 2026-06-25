-- AI action log + post-save version history.
-- Run after 006_translation_link.sql

-- ============================================
-- POST VERSIONS (post-save rollback)
-- ============================================
-- One snapshot of the PREVIOUS editor_state every time a post's body changes.
-- A DB trigger captures it, so every save path (browser client, AI action
-- route, CMS content API) is covered without touching app code.
-- ponytail: unbounded history. Fine for a single-author blog (KB-sized JSONB
-- rows). If it ever bloats, prune to the last N per post in a cron — not now.

CREATE TABLE IF NOT EXISTS post_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  editor_state JSONB,
  footnotes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_post_versions_post ON post_versions (post_id, created_at DESC);

-- SECURITY DEFINER so the snapshot insert succeeds whoever saved the post.
CREATE OR REPLACE FUNCTION snapshot_post_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.editor_state IS DISTINCT FROM OLD.editor_state
     OR NEW.footnotes IS DISTINCT FROM OLD.footnotes THEN
    INSERT INTO post_versions (post_id, editor_state, footnotes)
    VALUES (OLD.id, OLD.editor_state, OLD.footnotes);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_post_version ON posts;
CREATE TRIGGER trg_snapshot_post_version
  AFTER UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION snapshot_post_version();

-- ============================================
-- AI CONVERSATION LOG
-- ============================================

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                 -- 'user' | 'assistant'
  parts JSONB,                        -- message content parts (text + tool calls)
  tools TEXT[] DEFAULT '{}',          -- tool names invoked this turn, for quick scanning
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_post ON ai_conversations (post_id, updated_at DESC);

-- ============================================
-- RLS — authenticated (admin) full access; writes also happen via the
-- service role in the chat route, which bypasses RLS.
-- ============================================
ALTER TABLE post_versions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated manage post_versions"
  ON post_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated manage ai_conversations"
  ON ai_conversations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated manage ai_messages"
  ON ai_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
