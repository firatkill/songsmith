import console from 'node:console';
import process from 'node:process';

const [script, task] = process.argv.slice(2);
console.error(`${script}: not implemented until ${task}`);
process.exitCode = 1;
