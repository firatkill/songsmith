import {
  sectionTagSchema,
  type LyricSection,
  type SectionTag,
} from '@songsmith/schemas';

// Section parsing and serialisation shared by the lyricist and the editors
// (TRD §11). Pure functions; they never change the user's words.

export interface LyricBlock {
  tag: SectionTag | null;
  lines: string[];
}

const TAG_LINE = /^\s*\[\s*([^\]\d]*?)\s*(\d+)?\s*\]\s*$/u;
const NAMES: Record<string, SectionTag> = {
  intro: '[Intro]',
  verse: '[Verse]',
  prechorus: '[Pre-Chorus]',
  chorus: '[Chorus]',
  bridge: '[Bridge]',
  outro: '[Outro]',
};

/**
 * `[verse 2]`, `[ Pre chorus ]` and `[PRE-CHORUS]` map to the canonical tag.
 * Other bracketed lines (`[laughs]`, `[Hook]`) are lyrics, never dropped.
 */
export function normaliseTag(line: string): SectionTag | null {
  const match = TAG_LINE.exec(line);
  if (!match) return null;
  const key = (match[1] ?? '').toLowerCase().replace(/[\s_-]+/gu, '');
  return NAMES[key] ?? null;
}

export function parseLyrics(text: string): LyricBlock[] {
  const blocks: LyricBlock[] = [];
  let current: LyricBlock | undefined;
  for (const raw of text.replace(/\r\n?/gu, '\n').split('\n')) {
    const line = raw.trim();
    const tag = normaliseTag(line);
    if (tag) {
      current = { tag, lines: [] };
      blocks.push(current);
      continue;
    }
    if (!line) {
      // Blank lines separate stanzas only outside a known section.
      if (current && current.tag === null && current.lines.length)
        current = undefined;
      continue;
    }
    if (!current) {
      current = { tag: null, lines: [] };
      blocks.push(current);
    }
    current.lines.push(line);
  }
  return blocks.filter((b) => b.lines.length || b.tag);
}

/** Sections when every block has a known tag and at least one line. */
export function toSections(blocks: LyricBlock[]): LyricSection[] | null {
  if (!blocks.length) return null;
  const sections: LyricSection[] = [];
  for (const block of blocks) {
    if (!block.tag || !block.lines.length) return null;
    sections.push({ tag: block.tag, lines: [...block.lines] });
  }
  return sections;
}

export function serialiseLyrics(sections: readonly LyricSection[]): string {
  return sections
    .map((s) => [s.tag, ...s.lines].join('\n'))
    .join('\n\n')
    .concat(sections.length ? '\n' : '');
}

export type SectionIssue =
  | { index: number; problem: 'unknown_tag'; tag: string }
  | { index: number; problem: 'empty' };

export function validateSections(
  sections: ReadonlyArray<{ tag: string; lines: readonly string[] }>,
): SectionIssue[] {
  const issues: SectionIssue[] = [];
  sections.forEach((section, index) => {
    if (!sectionTagSchema.safeParse(section.tag).success)
      issues.push({ index, problem: 'unknown_tag', tag: section.tag });
    if (!section.lines.some((l) => l.trim()))
      issues.push({ index, problem: 'empty' });
  });
  return issues;
}

export interface TagProposal {
  sections: LyricSection[];
  changes: Array<{
    index: number;
    tag: SectionTag;
  }>;
}

/**
 * FR-04: proposes tags for untagged blocks (stanzas separated by blank lines). A block that
 * appears more than once becomes `[Chorus]`, every other one `[Verse]`. The
 * words and their order stay exactly as written; the client shows the diff.
 */
export function addMissingTags(text: string): TagProposal {
  const blocks = parseLyrics(text).filter((b) => b.lines.length);
  const key = (b: LyricBlock) =>
    b.lines.map((l) => l.toLocaleLowerCase()).join('\n');
  const counts = new Map<string, number>();
  for (const b of blocks) counts.set(key(b), (counts.get(key(b)) ?? 0) + 1);
  const changes: TagProposal['changes'] = [];
  const sections = blocks.map((block, index): LyricSection => {
    if (block.tag) return { tag: block.tag, lines: [...block.lines] };
    const tag: SectionTag =
      (counts.get(key(block)) ?? 0) > 1 ? '[Chorus]' : '[Verse]';
    changes.push({ index, tag });
    return { tag, lines: [...block.lines] };
  });
  return { sections, changes };
}

/** The words of a lyric text, ignoring tag lines and whitespace. */
export function lyricWords(text: string): string[] {
  return text
    .split('\n')
    .filter((line) => !normaliseTag(line.trim()))
    .join(' ')
    .split(/\s+/u)
    .filter(Boolean);
}
