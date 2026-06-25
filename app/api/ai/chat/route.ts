import { streamText, convertToModelMessages, stepCountIs } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { allTools, sourceTools } from '@/lib/ai/tools';

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const MODEL = 'anthropic/claude-sonnet-4';

// All tools including source tools — source tools are always available,
// they just return "no sources" when none are attached.
const tools = { ...allTools, ...sourceTools };

// Generated from the registry so the prompt's tool list never drifts as tools
// are added/removed (name: what it does).
const TOOL_MANIFEST = Object.entries(tools)
  .map(([name, t]) => `- \`${name}\`: ${(t as { description?: string }).description ?? ''}`)
  .join('\n');

export async function POST(req: Request) {
  const { messages, system } = await req.json();

  // Convert UIMessages (with parts) to ModelMessages (with content) for streamText
  const modelMessages = await convertToModelMessages(messages);

  const result = streamText({
    model: openrouter(MODEL),
    system: `${system ?? ''}\n\n## Available Tools\nThese are the tools you can call (name: what it does):\n${TOOL_MANIFEST}`,
    messages: modelMessages,
    tools,
    // Let the server keep going after a server-executed read tool (list_articles,
    // get_article_markdown) so the model uses the result. Client tools without an
    // execute still stop the step loop and get forwarded to the browser as before.
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
