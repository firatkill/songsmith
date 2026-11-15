const lookalikes: Readonly<Record<string, string>> = {
  а: 'a',
  е: 'e',
  о: 'o',
  р: 'p',
  с: 'c',
  х: 'x',
  у: 'y',
  і: 'i',
  ј: 'j',
  к: 'k',
  м: 'm',
  т: 't',
  в: 'b',
  н: 'h',
  ѕ: 's',
  α: 'a',
  ο: 'o',
  ρ: 'p',
  ν: 'v',
  τ: 't',
  κ: 'k',
  ι: 'i',
  ε: 'e',
  χ: 'x',
  ı: 'i',
  ş: 's',
  ğ: 'g',
  ç: 'c',
  ö: 'o',
  ü: 'u',
};
const leet: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
  '!': 'i',
};

/** Digit-preserving matching form used by age rules. */
export function matchingText(folded: string): string {
  return folded.replace(/./gu, (char) => lookalikes[char] ?? char);
}

export function normalise(text: string): {
  folded: string;
  skeleton: string;
  tokens: string[];
} {
  const folded = text
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .toLowerCase()
    .replace(/[^şğçöü]/gu, (char) =>
      char.normalize('NFKD').replace(/\p{M}/gu, ''),
    )
    .replace(/\s+/gu, ' ')
    .trim();
  const parts = matchingText(folded)
    .replace(/./gu, (char) => leet[char] ?? char)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  const joined: string[] = [];
  let singles = '';
  for (const part of parts) {
    if (part.length === 1) {
      singles += part;
      continue;
    }
    if (singles) {
      joined.push(singles);
      singles = '';
    }
    joined.push(part);
  }
  if (singles) joined.push(singles);
  const skeleton = joined.join(' ').replace(/(\p{L})\1{2,}/gu, '$1$1');
  return { folded, skeleton, tokens: skeleton ? skeleton.split(' ') : [] };
}
