import { streamText, convertToModelMessages } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { allTools, sourceTools } from '@/lib/ai/tools';
import { createServiceClient } from '@/lib/supabase/server';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const MODEL = 'anthropic/claude-sonnet-4';

// All tools including source tools — source tools are always available,
// they just return "no sources" when none are attached.
const tools = { ...allTools, ...sourceTools };

// Tool names referenced in a message's parts/content, for quick scanning in admin.
function toolNames(parts: unknown): string[] {
  if (!Array.isArray(parts)) return [];
  const names = parts
    .filter((p): p is Record<string, unknown> => !!p && typeof p === 'object')
    .filter((p) => typeof p.type === 'string' && (p.type as string).startsWith('tool'))
    .map((p) => (p.toolName as string) ?? (p.type as string).replace(/^tool-?/, ''))
    .filter(Boolean);
  return [...new Set(names)];
}

export async function POST(req: Request) {
  const { messages, system, postId, conversationId } = await req.json();

  // Convert UIMessages (with parts) to ModelMessages (with content) for streamText
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: openrouter(MODEL),
    system,
    messages: modelMessages,
    tools,
    // Best-effort log of the turn — never blocks or fails the chat response.
    onFinish: async ({ response }) => {
      if (!conversationId) return;
      try {
        const supabase = createServiceClient();
        await supabase.from('ai_conversations').upsert(
          { id: conversationId, post_id: postId ?? null, model: MODEL, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        );

        const lastUser = [...(messages ?? [])].reverse().find((m: { role: string }) => m.role === 'user');
        const rows = [];
        if (lastUser) {
          rows.push({
            conversation_id: conversationId,
            role: 'user',
            parts: lastUser.parts ?? null,
            tools: toolNames(lastUser.parts),
          });
        }
        for (const m of response.messages) {
          rows.push({
            conversation_id: conversationId,
            role: m.role,
            parts: m.content,
            tools: toolNames(m.content),
          });
        }
        if (rows.length) await supabase.from('ai_messages').insert(rows);
      } catch (err) {
        console.error('AI log write failed:', err);
      }
    },
  });

  return result.toUIMessageStreamResponse();
}
