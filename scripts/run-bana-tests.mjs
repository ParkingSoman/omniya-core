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
const child = spawn(command, [...commandArgs, ...filtered], { stdio: 'inherit', shell: true, env: { ...process.env, ...(rule ? { BANA_RULE: rule } : {}) } });
child.on('exit', (code, signal) => process.exitCode = signal ? 1 : (code ?? 1));
