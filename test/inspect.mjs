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
    console.log(`\nOpening the latest Electron test snapshot in a separate Electron inspector window.`);
    console.log(`Snapshot directory: ${directory}`);
    const inspector = spawn(npm, ['start'], {
      cwd: projectRoot,
      env: { ...process.env, OMNIYA_TEST_INSPECT: '1' },
      stdio: 'inherit'
    });
    inspector.on('exit', (inspectorCode, inspectorSignal) => {
      if (inspectorCode !== 0 && inspectorCode !== null) process.exitCode = inspectorCode;
      if (inspectorSignal) process.exitCode = 1;
    });
  }
});
