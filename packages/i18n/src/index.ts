import { IntlMessageFormat } from 'intl-messageformat';
import en from './en.json';
import tr from './tr.json';

export type Locale = 'tr' | 'en';
export type MessageKey = keyof typeof en;
export const messages = { en, tr } satisfies Record<
  Locale,
  Record<MessageKey, string>
>;
export type MessageValues = Record<string, string | number | boolean | Date>;

export function formatMessage(
  locale: Locale,
  key: MessageKey,
  values?: MessageValues,
): string {
  return String(
    new IntlMessageFormat(messages[locale][key], locale).format(values),
  );
}

/** Regional tags are reduced to their supported primary language; q=0 is excluded. */
export function resolveLocale(
  preferences: string | readonly string[] | undefined,
): Locale {
  const header =
    typeof preferences === 'string'
      ? preferences
      : (preferences?.join(',') ?? '');
  const candidates = header
    .split(',')
    .map((part) => {
      const [tag = '', ...parameters] = part.trim().split(';');
      const quality = parameters.find((parameter) =>
        parameter.trim().startsWith('q='),
      );
      const q = quality === undefined ? 1 : Number(quality.trim().slice(2));
      return { language: tag.trim().toLowerCase().split('-')[0], q };
    })
    .filter(({ q }) => Number.isFinite(q) && q > 0 && q <= 1)
    .sort((a, b) => b.q - a.q);
  for (const { language } of candidates) {
    if (language === 'tr' || language === 'en') return language;
  }
  return 'en';
}

export function toUpper(text: string, locale: Locale): string {
  return text.toLocaleUpperCase(locale);
}
export function toLower(text: string, locale: Locale): string {
  return text.toLocaleLowerCase(locale);
}
export function capitalize(text: string, locale: Locale): string {
  const [first = ''] = Array.from(text);
  return toUpper(first, locale) + toLower(text.slice(first.length), locale);
}
/** Search deliberately merges dotted/dotless i; display casing keeps them distinct. */
export function foldForSearch(text: string, locale: Locale): string {
  const folded = toLower(text.normalize('NFC'), locale);
  return locale === 'tr' ? folded.replaceAll('ı', 'i') : folded;
}
