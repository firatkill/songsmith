import { describe, expect, test } from 'vitest';
import { messages } from '@songsmith/i18n';
import { curatedGenres, moodSchema } from '@songsmith/schemas';
import {
  apiSections,
  initialState,
  reducer,
  restore,
  sectionProblem,
  serialise,
  type Action,
  type CreateState,
} from './state';

const run = (actions: Action[], state: CreateState = initialState('en')) =>
  actions.reduce(reducer, state);
const lyricSections = [
  { tag: '[Verse]' as const, lines: ['One', 'Two'] },
  { tag: '[Chorus]' as const, lines: ['Sing'] },
];
const lyrics: Action = {
  type: 'lyrics',
  title: 'Summer Road',
  suggestedStyle: 'pop, bright',
  sections: lyricSections,
};

describe('create reducer', () => {
  test('switching modes keeps both inputs (FR-01)', () => {
    const state = run([
      { type: 'field', field: 'description', value: 'a song' },
      { type: 'mode', mode: 'lyrics' },
      { type: 'field', field: 'pasted', value: '[Verse]\nmine' },
      { type: 'mode', mode: 'describe' },
    ]);
    expect(state.draft).toMatchObject({
      mode: 'describe',
      description: 'a song',
      pasted: '[Verse]\nmine',
    });
  });
  test('lyricist output fills sections, title and style only when empty', () => {
    const state = run([lyrics]);
    expect(apiSections(state.draft)).toEqual(lyricSections);
    expect(state.draft.title).toBe('Summer Road');
    expect(state.draft.style.free).toBe('pop, bright');
    const kept = run([
      { type: 'field', field: 'title', value: 'Mine' },
      { type: 'style', patch: { free: 'jazz' } },
      lyrics,
    ]);
    expect(kept.draft.title).toBe('Mine');
    expect(kept.draft.style.free).toBe('jazz');
  });
  test('add, remove, move and replace sections, then undo each', () => {
    const base = run([lyrics]);
    const added = reducer(base, { type: 'add', after: 0 });
    expect(added.draft.sections.map((s) => s.tag)).toEqual([
      '[Verse]',
      '[Verse]',
      '[Chorus]',
    ]);
    const moved = reducer(added, { type: 'move', index: 2, by: -1 });
    expect(moved.draft.sections.map((s) => s.tag)).toEqual([
      '[Verse]',
      '[Chorus]',
      '[Verse]',
    ]);
    const removed = reducer(moved, { type: 'remove', index: 2 });
    expect(removed.draft.sections).toHaveLength(2);
    const replaced = reducer(removed, {
      type: 'replace',
      index: 1,
      section: { tag: '[Bridge]', lines: ['New'] },
    });
    expect(apiSections(replaced.draft)[1]).toEqual({
      tag: '[Bridge]',
      lines: ['New'],
    });
    const undone = run(
      [{ type: 'undo' }, { type: 'undo' }, { type: 'undo' }, { type: 'undo' }],
      replaced,
    );
    expect(apiSections(undone.draft)).toEqual(apiSections(base.draft));
    expect(reducer(base, { type: 'move', index: 0, by: -1 })).toBe(base);
  });
  test('new lyrics clear the undo history', () => {
    const state = run([
      lyrics,
      { type: 'editText', index: 0, text: 'x' },
      lyrics,
    ]);
    expect(state.history).toEqual([]);
  });
  test('typing in one section is a single undo step', () => {
    const base = run([lyrics]);
    const typed = run(
      [
        { type: 'editText', index: 0, text: 'One!' },
        { type: 'editText', index: 0, text: 'One!!' },
        { type: 'editText', index: 1, text: 'Sing!' },
      ],
      base,
    );
    expect(typed.history).toHaveLength(base.history.length + 2);
    const once = reducer(typed, { type: 'undo' });
    expect(apiSections(once.draft)[1]?.lines).toEqual(['Sing']);
    expect(apiSections(once.draft)[0]?.lines).toEqual(['One!!']);
    expect(
      apiSections(reducer(once, { type: 'undo' }).draft)[0]?.lines,
    ).toEqual(['One', 'Two']);
  });
  test('instrumental forces Describe and clears the vocal type', () => {
    const state = run([
      { type: 'mode', mode: 'lyrics' },
      { type: 'style', patch: { vocalType: 'female' } },
      { type: 'instrumental', value: true },
    ]);
    expect(state.draft.mode).toBe('describe');
    expect(state.draft.style.vocalType).toBe('');
  });
  test('section problems', () => {
    expect(sectionProblem({ text: ' \n ' })).toBe('empty');
    expect(sectionProblem({ text: 'x'.repeat(201) })).toBe('lineTooLong');
    expect(sectionProblem({ text: Array(61).fill('a').join('\n') })).toBe(
      'tooManyLines',
    );
    expect(sectionProblem({ text: 'fine\n\nline' })).toBeNull();
  });
  test('persistence round-trips and rejects junk', () => {
    const state = run([
      lyrics,
      { type: 'editText', index: 0, text: 'Changed' },
    ]);
    const restored = restore(serialise(state));
    expect(restored?.draft).toEqual(state.draft);
    expect(restored?.history).toEqual(state.history);
    expect(restore('{')).toBeNull();
    expect(restore(JSON.stringify({ v: 2 }))).toBeNull();
    expect(restore(null)).toBeNull();
  });
});
describe('curated lists', () => {
  test('every genre and mood has TR and EN labels', () => {
    for (const locale of ['en', 'tr'] as const) {
      const keys = Object.keys(messages[locale]);
      for (const genre of curatedGenres)
        expect(keys).toContain(`create.genre.${genre}`);
      for (const mood of moodSchema.options)
        expect(keys).toContain(`create.mood.${mood}`);
    }
  });
});
