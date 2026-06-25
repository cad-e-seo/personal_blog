import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Cheap model for naming chats. Override via env if you want a different one.
const TITLE_MODEL = process.env.OPENROUTER_TITLE_MODEL || 'openai/gpt-4o-mini';

// Returns a short title for a conversation. Best-effort: on any failure the
// client falls back to the first few words of the conversation.
export async function POST(req: Request) {
  const { text } = await req.json();
  if (!text || typeof text !== 'string') return Response.json({ title: null });

  try {
    const { text: title } = await generateText({
      model: openrouter(TITLE_MODEL),
      prompt:
        `Write a short, specific title (max 6 words, no quotes, no trailing punctuation) ` +
        `for a chat that begins with this message:\n\n"${text.slice(0, 500)}"\n\nTitle:`,
    });
    const clean = title.trim().replace(/^["']|["']$/g, '').replace(/[.]+$/, '').slice(0, 80);
    return Response.json({ title: clean || null });
  } catch (err) {
    console.error('Title generation failed:', err);
    return Response.json({ title: null });
  }
}
