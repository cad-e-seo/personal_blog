# caidéiseach — personal blog

Next.js 15 (App Router, React 19) blog backed by Supabase (Postgres + Storage),
with a block-based admin editor and an AI writing assistant.

## Getting Started

```bash
npm run dev      # dev server at localhost:3000
npm run build    # production build
npm run lint     # eslint
npm test         # node --test via tsx (no extra deps)
```

Requires `.env.local` (see `.env.local.example`):
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`.

## Data model (Supabase / Postgres)

Migrations live in `supabase/migrations/` and are **applied by hand in the
Supabase SQL editor** (the CLI is not linked). Tables:

| Table | Purpose |
|-------|---------|
| `posts` | Blog posts. Live content is the **`editor_state`** JSONB column (Lexical editor state); plus `footnotes`, metadata (`slug`, `title`, `major_tag`, `tags`, `language`, `status`, …). |
| `nodes` | Legacy per-block content (pre-Lexical). Still read for posts whose `editor_state` is null. |
| `assets` | Images/media stored in Supabase Storage, referenced by posts/nodes. |
| `interactive_components` | Embeddable interactive widgets. |
| `post_versions` | Snapshot of a post's previous `editor_state`/`footnotes`, written by a DB **trigger** on every save (any save path). Powers post-save rollback. |
| `ai_conversations` | One row per AI chat session, tied to a `post_id`. Holds the full **`messages`** snapshot (UIMessage array), a `title`, and `model`. Powers history/resume and the admin AI log. |
| `ai_messages` | _Deprecated_ (migration 007). Superseded by `ai_conversations.messages`; left in place, safe to drop. |

> **Egress note:** listing/feed queries select an explicit column list
> (`LIST_COLUMNS` in `lib/posts/queries.ts`) that **omits `editor_state`** — it's
> the whole post body and would otherwise be shipped for every card. Single-post
> fetches still select it.

## Content rendering

Posts are statically generated with ISR (`revalidate = 60`). `editor_state` is
rendered by `components/blocks/LexicalContentRenderer`. Images go through
`next/image` with a long `minimumCacheTTL`; uploads set a 1-year `cacheControl`.

## AI writing assistant

Admin-only, lives in the post editor (`components/admin/ai/AIChatPanel.tsx`).

**Flow:** the panel uses the Vercel AI SDK `useChat` → `POST /api/ai/chat`, which
streams from OpenRouter (`anthropic/claude-sonnet-4`).

**Tools** (`lib/ai/tools/`):
- `editor-tools.ts` — schema-only, **client-executed**: the AI SDK forwards the
  call to the browser, where `lib/ai/tool-executor.ts` applies it to the live
  Lexical editor (read/edit/suggest/create blocks).
- `articles.ts` — **server-executed** (`execute` runs in the route):
  `list_articles` and `get_article_markdown` let the model browse and read prior
  posts. `get_article_markdown` returns **Markdown** (via
  `lib/export/lexical-to-markdown.ts`), never the raw editor JSON.
- `sources.ts` — read attached reference files.
- `index.ts` assembles `allTools` + `sourceTools`. The chat route generates the
  system-prompt tool manifest (name + description) from this registry so the
  prompt never drifts. `stopWhen: stepCountIs(5)` lets the model continue after a
  server tool returns.

**Conversation management:** every conversation is tied to an article. After each
streamed turn the panel upserts the full message list to `ai_conversations`. The
panel's **History** lists the current article's conversations first, then others
by recency; you can open/resume any (including from other posts) in place, or
jump to its article. **+ New** starts a fresh conversation.
`/admin/ai-log` is the cross-article view, grouped by article with filters.

**Version rollback:** the `post_versions` trigger snapshots `editor_state` on
every save. The editor toolbar's **History → Restore** writes a chosen version
back (itself snapshotted first, so it's reversible).

## Key paths

- `lib/posts/queries.ts` / `mutations.ts` — post fetching/writing
- `lib/supabase/{server,client}.ts` — Supabase clients
- `lib/ai/` — system prompt, tools, tool executor, attachments
- `app/api/ai/chat/route.ts` — AI chat endpoint
- `app/admin/` — CMS (posts, assets, subscribers, emails, ai-log)

Deployed on Vercel; **pushing to `main` deploys to production** — apply any new
migration in Supabase first.
