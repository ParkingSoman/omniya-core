import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npm, ['run', 'test:e2e'], {
  cwd: projectRoot,
  stdio: 'inherit'
});

child.on('exit', (code, signal) => {
  if (code !== 0) process.exitCode = code ?? 1;
  if (signal) process.exitCode = 1;
  if (code === 0 && !signal) {
    const directory = path.join(projectRoot, 'test', 'artifacts', 'latest');
    console.log(`\nLatest Electron test snapshot: ${directory}`);
    console.log(`  Screenshot: ${path.join(directory, 'electron.png')}`);
    console.log(`  ARIA tree:  ${path.join(directory, 'aria.txt')}`);
    console.log(`  DOM:        ${path.join(directory, 'main.html')}`);
    console.log(`  Metadata:   ${path.join(directory, 'metadata.json')}`);
  }
});
