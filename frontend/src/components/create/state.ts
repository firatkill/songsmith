import { z } from 'zod';
import type { Locale } from '@songsmith/i18n';

// Create flow state (TRD §14): one reducer, persisted to sessionStorage so
// switching modes, steps and reloading keeps the input (FR-01). Pure.
export const SECTION_TAGS = [
  '[Intro]',
  '[Verse]',
  '[Pre-Chorus]',
  '[Chorus]',
  '[Bridge]',
  '[Outro]',
] as const;
export type SectionTag = (typeof SECTION_TAGS)[number];
export const LIMITS = {
  describe: 1000,
  lyrics: 3000,
  sections: 20,
  lines: 60,
  line: 200,
  instruction: 300,
  title: 120,
  style: 200,
  genre: 60,
} as const;
export type Mode = 'describe' | 'lyrics';
export type Step = 'input' | 'tags' | 'editor' | 'style';
export interface EditorSection {
  key: string;
  tag: SectionTag;
  // The textarea value: one line per row, kept as typed.
  text: string;
}
export interface StyleDraft {
  genre: string;
  genreText: string;
  mood: string;
  tempo: string;
  bpm: string;
  vocalType: string;
  durationSec: number;
  free: string;
}
export interface Draft {
  mode: Mode;
  step: Step;
  description: string;
  pasted: string;
  instrumental: boolean;
  language: Locale;
  title: string;
  sections: EditorSection[];
  style: StyleDraft;
  modelId: string | null;
}
export interface CreateState {
  draft: Draft;
  // Undo history of the editor's sections (FR-03); newest last.
  history: EditorSection[][];
  // Consecutive typing in one section is one undo step.
  lastEdit: string | null;
  nextKey: number;
}
const sectionTag = z.enum(SECTION_TAGS);
const draftSchema = z.object({
  mode: z.enum(['describe', 'lyrics']),
  step: z.enum(['input', 'tags', 'editor', 'style']),
  description: z.string().max(LIMITS.describe),
  pasted: z.string().max(LIMITS.lyrics),
  instrumental: z.boolean(),
  language: z.enum(['tr', 'en']),
  title: z.string().max(LIMITS.title),
  sections: z
    .array(z.object({ key: z.string(), tag: sectionTag, text: z.string() }))
    .max(LIMITS.sections),
  style: z.object({
    genre: z.string(),
    genreText: z.string().max(LIMITS.genre),
    mood: z.string(),
    tempo: z.string(),
    bpm: z.string(),
    vocalType: z.string(),
    durationSec: z.number().int(),
    free: z.string().max(LIMITS.style),
  }),
  modelId: z.string().nullable(),
});
const persistedSchema = z.object({
  v: z.literal(1),
  draft: draftSchema,
  history: z.array(draftSchema.shape.sections).max(50),
  nextKey: z.number().int().nonnegative(),
});

export function initialState(language: Locale): CreateState {
  return {
    draft: {
      mode: 'describe',
      step: 'input',
      description: '',
      pasted: '',
      instrumental: false,
      language,
      title: '',
      sections: [],
      style: {
        genre: '',
        genreText: '',
        mood: '',
        tempo: '',
        bpm: '',
        vocalType: '',
        durationSec: 120,
        free: '',
      },
      modelId: null,
    },
    history: [],
    lastEdit: null,
    nextKey: 1,
  };
}

export type Action =
  | { type: 'field'; field: 'description' | 'pasted' | 'title'; value: string }
  | { type: 'mode'; mode: Mode }
  | { type: 'step'; step: Step }
  | { type: 'instrumental'; value: boolean }
  | { type: 'language'; value: Locale }
  | { type: 'style'; patch: Partial<StyleDraft> }
  | { type: 'model'; modelId: string | null }
  | {
      type: 'lyrics';
      sections: Array<{ tag: SectionTag; lines: string[] }>;
      title?: string;
      suggestedStyle?: string;
    }
  | { type: 'editText'; index: number; text: string }
  | { type: 'editTag'; index: number; tag: SectionTag }
  | { type: 'add'; after: number }
  | { type: 'remove'; index: number }
  | { type: 'move'; index: number; by: -1 | 1 }
  | {
      type: 'replace';
      index: number;
      section: { tag: SectionTag; lines: string[] };
    }
  | { type: 'undo' }
  | { type: 'load'; state: CreateState }
  | { type: 'reset'; language: Locale };

const HISTORY = 50;
function withSections(
  state: CreateState,
  sections: EditorSection[],
  edit: string | null = null,
): CreateState {
  const coalesce = edit !== null && edit === state.lastEdit;
  return {
    ...state,
    draft: { ...state.draft, sections },
    history: coalesce
      ? state.history
      : [...state.history, state.draft.sections].slice(-HISTORY),
    lastEdit: edit,
  };
}
function fresh(state: CreateState, tag: SectionTag, lines: string[]) {
  return {
    section: { key: `s${String(state.nextKey)}`, tag, text: lines.join('\n') },
    nextKey: state.nextKey + 1,
  };
}

export function reducer(state: CreateState, action: Action): CreateState {
  const { draft } = state;
  switch (action.type) {
    case 'field':
      return { ...state, draft: { ...draft, [action.field]: action.value } };
    case 'mode':
      // Both inputs are kept; only the visible one changes (FR-01).
      return { ...state, draft: { ...draft, mode: action.mode } };
    case 'step':
      return {
        ...state,
        draft: { ...draft, step: action.step },
        lastEdit: null,
      };
    case 'instrumental':
      return {
        ...state,
        draft: {
          ...draft,
          instrumental: action.value,
          mode: action.value ? 'describe' : draft.mode,
          style: action.value ? { ...draft.style, vocalType: '' } : draft.style,
        },
      };
    case 'language':
      return { ...state, draft: { ...draft, language: action.value } };
    case 'style':
      return {
        ...state,
        draft: { ...draft, style: { ...draft.style, ...action.patch } },
      };
    case 'model':
      return { ...state, draft: { ...draft, modelId: action.modelId } };
    case 'lyrics': {
      let next = state;
      const sections: EditorSection[] = [];
      for (const s of action.sections.slice(0, LIMITS.sections)) {
        const made = fresh(next, s.tag, s.lines);
        sections.push(made.section);
        next = { ...next, nextKey: made.nextKey };
      }
      // New lyrics start a new editing session: nothing to undo yet.
      const replaced = { ...withSections(next, sections), history: [] };
      return {
        ...replaced,
        draft: {
          ...replaced.draft,
          title: draft.title.trim()
            ? draft.title
            : (action.title ?? '').slice(0, LIMITS.title),
          style:
            draft.style.free.trim() || !action.suggestedStyle
              ? draft.style
              : {
                  ...draft.style,
                  free: action.suggestedStyle.slice(0, LIMITS.style),
                },
        },
      };
    }
    case 'editText':
      return withSections(
        state,
        draft.sections.map((s, i) =>
          i === action.index ? { ...s, text: action.text } : s,
        ),
        draft.sections[action.index]?.key ?? null,
      );
    case 'editTag':
      return withSections(
        state,
        draft.sections.map((s, i) =>
          i === action.index ? { ...s, tag: action.tag } : s,
        ),
      );
    case 'add': {
      if (draft.sections.length >= LIMITS.sections) return state;
      const made = fresh(state, '[Verse]', []);
      const sections = [...draft.sections];
      sections.splice(action.after + 1, 0, made.section);
      return withSections({ ...state, nextKey: made.nextKey }, sections);
    }
    case 'remove':
      return withSections(
        state,
        draft.sections.filter((_, i) => i !== action.index),
      );
    case 'move': {
      const to = action.index + action.by;
      const from = draft.sections[action.index];
      const other = draft.sections[to];
      if (!from || !other) return state;
      const sections = [...draft.sections];
      sections[to] = from;
      sections[action.index] = other;
      return withSections(state, sections);
    }
    case 'replace': {
      const current = draft.sections[action.index];
      if (!current) return state;
      return withSections(
        state,
        draft.sections.map((s, i) =>
          i === action.index
            ? {
                ...s,
                tag: action.section.tag,
                text: action.section.lines.join('\n'),
              }
            : s,
        ),
      );
    }
    case 'undo': {
      const previous = state.history.at(-1);
      if (!previous) return state;
      return {
        ...state,
        draft: { ...draft, sections: previous },
        history: state.history.slice(0, -1),
        lastEdit: null,
      };
    }
    case 'load':
      return action.state;
    case 'reset':
      return initialState(action.language);
  }
}

// Lines as the API wants them: trimmed, blank rows dropped.
export function sectionLines(section: Pick<EditorSection, 'text'>) {
  return section.text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
export type SectionProblem = 'empty' | 'lineTooLong' | 'tooManyLines';
export function sectionProblem(
  section: Pick<EditorSection, 'text'>,
): SectionProblem | null {
  const lines = sectionLines(section);
  if (!lines.length) return 'empty';
  if (lines.length > LIMITS.lines) return 'tooManyLines';
  if (lines.some((l) => l.length > LIMITS.line)) return 'lineTooLong';
  return null;
}
export function apiSections(draft: Pick<Draft, 'sections'>) {
  return draft.sections.map((s) => ({ tag: s.tag, lines: sectionLines(s) }));
}

export const STORAGE_KEY = 'songsmith:create:v1';
export function serialise(state: CreateState): string {
  return JSON.stringify({
    v: 1,
    draft: state.draft,
    history: state.history,
    nextKey: state.nextKey,
  });
}
export function restore(raw: string | null): CreateState | null {
  if (!raw) return null;
  try {
    const parsed = persistedSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return { ...parsed.data, lastEdit: null };
  } catch {
    return null;
  }
}
