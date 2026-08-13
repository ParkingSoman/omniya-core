import { spawn } from 'node:child_process';

const kind = process.argv[2] ?? 'unit';
const args = process.argv.slice(3);
let rule = null;
const filtered = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--rule') rule = args[++index] ?? null;
  else filtered.push(args[index]);
}
const commands = {
  unit: ['node', ['--test', 'test/unit/*.test.js']],
  accuracy: ['node', ['--test', 'test/unit/nemeth-braille-accuracy.test.js']],
  electron: ['node', ['--test', '--test-concurrency=1', 'test/e2e/*.test.js']]
};
if (!commands[kind]) throw new Error(`Unknown BANA test shard: ${kind}`);
const [command, commandArgs] = commands[kind];
// The current test files are data-driven and use the shard variable to skip
// unrelated rule cases. Keep the filtering contract explicit even before all
// per-rule Electron corpus files are split out.
const environment = {
  ...process.env,
  ...(rule ? { BANA_RULE: rule } : {}),
  ...(kind === 'electron' ? { BANA_ELECTRON_OFFICIAL: process.env.BANA_ELECTRON_OFFICIAL ?? '1' } : {})
};
const child = spawn(command, [...commandArgs, ...filtered], { stdio: 'inherit', shell: true, env: environment });
child.on('exit', (code, signal) => process.exitCode = signal ? 1 : (code ?? 1));
