import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toArticleSummary } from './article-format';
import { lexicalToMarkdown } from '../../export/lexical-to-markdown';

test('toArticleSummary keeps only the concise fields', () => {
  const summary = toArticleSummary({
    title: 'Hello',
    slug: 'hello',
    status: 'published',
    major_tag: 'Thoughts',
    tags: ['a', 'b'],
    published_at: '2024-01-01',
    editor_state: { huge: 'blob' }, // must be dropped
  });
  assert.deepEqual(summary, {
    title: 'Hello',
    slug: 'hello',
    status: 'published',
    major_tag: 'Thoughts',
    tags: ['a', 'b'],
    published_at: '2024-01-01',
  });
});

test('toArticleSummary tolerates missing fields', () => {
  const summary = toArticleSummary({ title: 'X', slug: 'x', status: 'draft' });
  assert.deepEqual(summary.tags, []);
  assert.equal(summary.major_tag, null);
  assert.equal(summary.published_at, null);
});

test('get_article_markdown path renders Markdown, not JSON', () => {
  const editorState = {
    root: {
      children: [
        { type: 'heading', tag: 'h1', children: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', children: [{ type: 'text', text: 'Body text.' }] },
      ],
    },
  };
  const md = lexicalToMarkdown(editorState);
  assert.match(md, /# Title/);
  assert.match(md, /Body text\./);
  assert.doesNotMatch(md, /"type"|"children"/); // no raw JSON leaked
});
