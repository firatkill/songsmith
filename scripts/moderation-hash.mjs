import { createHash } from 'node:crypto';
import process from 'node:process';
import { normalise } from '../packages/moderation-rules/src/normalise.ts';

let input = '';
for await (const chunk of process.stdin) input += chunk;
const hashes = input
  .split(/\r?\n/u)
  .map((line) => normalise(line).skeleton.replaceAll(' ', ''))
  .filter(Boolean)
  .map((term) =>
    createHash('sha256')
      .update('songsmith-mr-v1:' + term)
      .digest('hex'),
  );
process.stdout.write(
  [...new Set(hashes)].sort().join('\n') + (hashes.length ? '\n' : ''),
);
