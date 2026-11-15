# Deterministic moderation lists (T-14)

Layer 1 is a pure, synchronous library. `normalise(text)` returns digit-preserving `folded`, a matching `skeleton`, and skeleton `tokens`. `checkDeterministic(text, { lists? })` returns only an action and rule/category hits; it never returns evidence or logs input. Both languages are always checked. A pass still requires the T-15 classifier before generation; this package is not the `moderate()` pipeline.

## Updating hard-block hashes

The owner keeps plaintext terms **outside the repository**. Do not put them in source files, fixtures, comments, command arguments, logs or PR descriptions. The seed files contain two entries per language; they are a small starting point, not a complete policy implementation.

1. Maintain an owner-controlled UTF-8 file outside the repository, one term per line. Use only non-graphic category terms or established moderation codewords.
2. From the repository root, run `pnpm -s moderation:hash < /absolute/private/path/terms.txt`. The script reads stdin, uses the library normalisation, and prints only sorted unique lowercase SHA-256 hashes. Node's TypeScript stripping runs the shared normaliser directly, without requiring a previous build.
3. Update the appropriate `lists/hard-block.en.ts` or `lists/hard-block.tr.ts` array with those hashes. Keep each array sorted and unique. Do not paste plaintext into a shell command or a repository file.
4. Run package tests, the root script tests, build, boundaries and exports checks. Test evasion using an injected harmless sentinel, never actual seed entries.
5. From T-16 onward, run the mock moderation evaluation for every list change; tune the lists and 12-token co-occurrence window against allowed rows (NFR-12: at most 5% false blocks). `eval:moderation` is currently a T-16 stub, so T-14 does not run it. Live evaluation needs an explicit owner request and budget.

Hash format: SHA-256 of UTF-8 `songsmith-mr-v1:` followed by the term's skeleton with spaces removed. Matching hashes each window of one through four skeleton tokens, with spaces removed. The prefix is versioning/domain separation, not a secret salt; hashes are not encryption. Keep phrases within that window. Character-spaced runs are joined by normalisation before matching.

## Plain lists and matching

`lists/context.ts` holds TR/EN minor indicators, non-graphic context words and minor number words. `lists/artists.ts` holds 30 artist names. Minor indicators and context phrases must fit together inside 12 skeleton tokens, including the indicator phrases themselves, in either order. Numeric ages are recognized before leetspeak conversion; whole number phrases prevent adult compound ages from matching a minor suffix. Plain lists use whole-token phrases, not arbitrary substrings. List and window quality is measured in T-16.

Artist blocking requires a listed name plus a supported voice/style request pattern. A bare artist name, genre, unlisted name or profanity alone passes this layer. Explicit labelling belongs to T-15. Hard blocks take priority, with at most one hit per rule.

The optional `Partial<RuleLists>` replaces only supplied arrays, allowing sentinel-only tests without revealing seed terms. Production callers should omit overrides. The TypeScript build emits the list modules under `dist/lists` and implementation under `dist/src`; package exports point to `dist/src/index.js`. There are no runtime dependencies or platform I/O in the package.
