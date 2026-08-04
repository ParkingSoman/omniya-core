import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const napkinFile = path.join(projectRoot, 'test', 'artifacts', 'latest', 'test.napkin.json');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npm, ['run', 'test:e2e'], {
  cwd: projectRoot,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (code !== 0) process.exitCode = code ?? 1;
  if (signal) process.exitCode = 1;
  if (code === 0 && !signal) {
    console.log(`\nOpening the generated napkin in the normal Electron app:`);
    console.log(`  ${napkinFile}`);
    const opener = spawn(npm, ['run', 'open:napkin', '--', napkinFile], {
      cwd: projectRoot,
      stdio: 'inherit'
    });
    opener.on('exit', (openerCode, openerSignal) => {
      if (openerCode !== 0 && openerCode !== null) process.exitCode = openerCode;
      if (openerSignal) process.exitCode = 1;
    });
  }
});
