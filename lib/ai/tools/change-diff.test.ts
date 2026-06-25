import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffMarkdown, summarizeChange } from './change-diff';

test('diffMarkdown detects added and removed lines', () => {
  const oldMd = '# Title\n\nKept line.\nRemoved line.';
  const newMd = '# Title\n\nKept line.\nAdded line.';
  const c = diffMarkdown(oldMd, newMd);
  assert.deepEqual(c.addedLines, ['Added line.']);
  assert.deepEqual(c.removedLines, ['Removed line.']);
});

test('diffMarkdown reports word delta', () => {
  const c = diffMarkdown('one two', 'one two three four');
  assert.equal(c.wordDelta, 2);
});

test('summarizeChange is concise and shows samples', () => {
  const s = summarizeChange(diffMarkdown('a\nb', 'a\nb\nc'));
  assert.match(s, /1 line\(s\) added, 0 removed/);
  assert.match(s, /\+ c/);
});

test('no change yields empty summary counts', () => {
  const c = diffMarkdown('same', 'same');
  assert.equal(c.addedLines.length, 0);
  assert.equal(c.removedLines.length, 0);
  assert.equal(c.wordDelta, 0);
});
