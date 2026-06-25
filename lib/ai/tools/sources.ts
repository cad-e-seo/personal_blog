import { tool } from 'ai';
import { z } from 'zod';

// Client-executed tools for attached reference files (handled by tool-executor.ts).

const getSourceContentTool = tool({
  description:
    'Get the full content of an attached source file by name. Use this to read reference material the user has attached.',
  inputSchema: z.object({
    sourceName: z.string().describe('The filename of the attached source to read'),
  }),
});

const listSourcesTool = tool({
  description:
    'List all source files the user has attached to this conversation, with their names and types.',
  inputSchema: z.object({}),
});

export const sourceTools = {
  get_source_content: getSourceContentTool,
  list_sources: listSourcesTool,
};
