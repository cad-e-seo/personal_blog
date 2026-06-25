import { tool } from 'ai';
import { z } from 'zod';

// Client-executed tools: schema-only declarations. They have no `execute`, so
// the AI SDK forwards the call to the browser, where tool-executor.ts applies
// it to the live Lexical editor. Grouped by phase.

// ─── Phase 1: Read-only ──────────────────────────────────────────────────────

const getArticleContentTool = tool({
  description:
    'Get the full article content as markdown. Use this to read what the user has written so far.',
  inputSchema: z.object({}),
});

const getArticleMetadataTool = tool({
  description:
    'Get article metadata: title, slug, tags, language, status, description.',
  inputSchema: z.object({}),
});

const getBlockContentTool = tool({
  description: 'Get the content of a specific block by its Lexical node key.',
  inputSchema: z.object({
    nodeKey: z.string().describe('The Lexical node key of the block to read'),
  }),
});

const listBlocksTool = tool({
  description:
    'List all top-level blocks in the article with their type and a short preview of their content.',
  inputSchema: z.object({}),
});

// ─── Phase 2: Edit ───────────────────────────────────────────────────────────

const replaceBlockTextTool = tool({
  description:
    'Replace the text content of a paragraph, heading, or quote block. The new text can include basic markdown formatting (bold, italic, links).',
  inputSchema: z.object({
    nodeKey: z.string().describe('The Lexical node key of the block to edit'),
    newText: z.string().describe('The new text content (supports inline markdown: **bold**, *italic*, [link](url))'),
  }),
});

const replaceBlockMarkdownTool = tool({
  description:
    'Replace a block with parsed markdown content. Use this for rich replacements that include formatted text, lists, etc.',
  inputSchema: z.object({
    nodeKey: z.string().describe('The Lexical node key of the block to replace'),
    markdown: z.string().describe('Markdown content to replace the block with'),
  }),
});

const insertBlockAfterTool = tool({
  description:
    'Insert a new block after a specified node. The content is provided as markdown and will be parsed into the appropriate Lexical node(s).',
  inputSchema: z.object({
    nodeKey: z.string().describe('The Lexical node key to insert after'),
    markdown: z.string().describe('Markdown content for the new block(s)'),
  }),
});

const deleteBlockTool = tool({
  description: 'Remove a block from the article.',
  inputSchema: z.object({
    nodeKey: z.string().describe('The Lexical node key of the block to delete'),
  }),
});

// ─── Phase 3: Suggestions ────────────────────────────────────────────────────

const suggestTextReplacementTool = tool({
  description:
    'Suggest replacing text in a block. Shows the suggestion inline with accept/reject UI rather than immediately changing it.',
  inputSchema: z.object({
    nodeKey: z.string().describe('The Lexical node key containing the text'),
    originalText: z.string().describe('The exact text to be replaced'),
    suggestedText: z.string().describe('The suggested replacement text'),
  }),
});

const suggestBlockReplacementTool = tool({
  description:
    'Suggest replacing an entire block. Shows the suggestion with accept/reject UI.',
  inputSchema: z.object({
    nodeKey: z.string().describe('The Lexical node key of the block to suggest replacing'),
    suggestedMarkdown: z.string().describe('The suggested replacement content as markdown'),
  }),
});

const suggestDeletionTool = tool({
  description: 'Suggest deleting a block. Shows the suggestion with accept/reject UI.',
  inputSchema: z.object({
    nodeKey: z.string().describe('The Lexical node key of the block to suggest deleting'),
    reason: z.string().optional().describe('Reason for suggesting deletion'),
  }),
});

// ─── Phase 4: Content creation ───────────────────────────────────────────────

const createHeadingTool = tool({
  description: 'Create a heading block. Supports inline markdown formatting.',
  inputSchema: z.object({
    level: z.number().min(1).max(6).describe('Heading level (1-6)'),
    text: z.string().describe('Heading text (supports **bold**, *italic*, [link](url), `code`)'),
    afterNodeKey: z.string().optional().describe('Insert after this node key. If omitted, appends to end.'),
  }),
});

const createParagraphTool = tool({
  description: 'Create a paragraph block. Supports inline markdown formatting.',
  inputSchema: z.object({
    text: z.string().describe('Paragraph text (supports **bold**, *italic*, [link](url), `code`)'),
    afterNodeKey: z.string().optional().describe('Insert after this node key. If omitted, appends to end.'),
  }),
});

const createCodeBlockTool = tool({
  description: 'Create a code block.',
  inputSchema: z.object({
    code: z.string().describe('The code content'),
    language: z.string().optional().describe('Programming language (e.g., "typescript", "python")'),
    filename: z.string().optional().describe('Optional filename to display'),
    afterNodeKey: z.string().optional().describe('Insert after this node key. If omitted, appends to end.'),
  }),
});

const createCalloutTool = tool({
  description: 'Create a callout/admonition block.',
  inputSchema: z.object({
    variant: z.enum(['info', 'warning', 'success', 'error', 'note']).describe('Callout type'),
    content: z.string().describe('Callout text content'),
    afterNodeKey: z.string().optional().describe('Insert after this node key. If omitted, appends to end.'),
  }),
});

const createListTool = tool({
  description: 'Create a list block. Each item supports inline markdown formatting.',
  inputSchema: z.object({
    listType: z.enum(['bullet', 'number']).describe('List type'),
    items: z.array(z.string()).describe('List items (each supports **bold**, *italic*, [link](url), `code`)'),
    afterNodeKey: z.string().optional().describe('Insert after this node key. If omitted, appends to end.'),
  }),
});

const createBilingualBlockTool = tool({
  description: 'Create a bilingual (English/Irish) content block.',
  inputSchema: z.object({
    en: z.string().describe('English content'),
    ga: z.string().describe('Irish (Gaeilge) content'),
    afterNodeKey: z.string().optional().describe('Insert after this node key. If omitted, appends to end.'),
  }),
});

const createTableTool = tool({
  description: 'Create a table block.',
  inputSchema: z.object({
    headers: z.array(z.string()).describe('Column headers'),
    rows: z.array(z.array(z.string())).describe('Table rows (array of arrays)'),
    afterNodeKey: z.string().optional().describe('Insert after this node key. If omitted, appends to end.'),
  }),
});

const createToggleTool = tool({
  description: 'Create a collapsible toggle/details block.',
  inputSchema: z.object({
    title: z.string().describe('Toggle summary/title text'),
    content: z.string().describe('Toggle content (supports markdown)'),
    afterNodeKey: z.string().optional().describe('Insert after this node key. If omitted, appends to end.'),
  }),
});

const generateSectionTool = tool({
  description:
    'Generate a section of content from markdown. The markdown will be parsed into multiple Lexical nodes (paragraphs, headings, lists, code blocks, etc.) and inserted as a group.',
  inputSchema: z.object({
    markdown: z.string().describe('Markdown content to convert into editor blocks'),
    afterNodeKey: z.string().optional().describe('Insert after this node key. If omitted, appends to end.'),
  }),
});

export const editorTools = {
  // Phase 1: Read
  get_article_content: getArticleContentTool,
  get_article_metadata: getArticleMetadataTool,
  get_block_content: getBlockContentTool,
  list_blocks: listBlocksTool,
  // Phase 2: Edit
  replace_block_text: replaceBlockTextTool,
  replace_block_markdown: replaceBlockMarkdownTool,
  insert_block_after: insertBlockAfterTool,
  delete_block: deleteBlockTool,
  // Phase 3: Suggestions
  suggest_text_replacement: suggestTextReplacementTool,
  suggest_block_replacement: suggestBlockReplacementTool,
  suggest_deletion: suggestDeletionTool,
  // Phase 4: Content creation
  create_heading: createHeadingTool,
  create_paragraph: createParagraphTool,
  create_code_block: createCodeBlockTool,
  create_callout: createCalloutTool,
  create_list: createListTool,
  create_bilingual_block: createBilingualBlockTool,
  create_table: createTableTool,
  create_toggle: createToggleTool,
  generate_section: generateSectionTool,
};
