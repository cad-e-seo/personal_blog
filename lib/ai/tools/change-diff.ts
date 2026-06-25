// Pure helpers for summarising what changed between two Markdown snapshots of an
// article. Line-set diff (order-insensitive) — cheap and good enough for "what
// were the last few edits?". No db imports, so unit-testable.

export interface ChangeSummary {
  addedLines: string[];
  removedLines: string[];
  wordDelta: number;
}

function lines(md: string): string[] {
  return md.split('\n').map((l) => l.trim()).filter(Boolean);
}

function wordCount(md: string): number {
  return md.split(/\s+/).filter(Boolean).length;
}

// What `newMd` has that `oldMd` doesn't, and vice versa.
export function diffMarkdown(oldMd: string, newMd: string): ChangeSummary {
  const oldSet = new Set(lines(oldMd));
  const newArr = lines(newMd);
  const newSet = new Set(newArr);
  return {
    addedLines: newArr.filter((l) => !oldSet.has(l)),
    removedLines: [...oldSet].filter((l) => !newSet.has(l)),
    wordDelta: wordCount(newMd) - wordCount(oldMd),
  };
}

// One-line human summary, capped so tool output stays small.
export function summarizeChange(c: ChangeSummary, sample = 3): string {
  const parts: string[] = [];
  parts.push(`${c.addedLines.length} line(s) added, ${c.removedLines.length} removed`);
  parts.push(`${c.wordDelta >= 0 ? '+' : ''}${c.wordDelta} words`);
  let s = parts.join(', ');
  if (c.addedLines.length) s += `\n  + ${c.addedLines.slice(0, sample).join('\n  + ')}`;
  if (c.removedLines.length) s += `\n  - ${c.removedLines.slice(0, sample).join('\n  - ')}`;
  return s;
}
