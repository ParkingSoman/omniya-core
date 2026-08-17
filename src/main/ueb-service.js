import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const TABLE = {
  g1: 'unicode.dis,en-ueb-g1.ctb',
  g2: 'unicode.dis,en-ueb-g2.ctb'
};

const DEFAULT_HOMEBREW = [
  '/opt/homebrew/bin/lou_translate',
  '/usr/local/bin/lou_translate'
];

function bundledBin(resourcesPath, platform) {
  if (!resourcesPath) return null;
  const name = platform === 'win32' ? 'lou_translate.exe' : 'lou_translate';
  return path.join(resourcesPath, 'liblouis', 'bin', name);
}

export function resolveLouTranslate(options = {}) {
  const env = options.env ?? process.env;
  const exists = options.exists ?? ((p) => Boolean(p) && fs.existsSync(p));
  const platform = options.platform ?? process.platform;
  const resourcesPath = options.resourcesPath ?? process.resourcesPath;
  const homebrewCandidates = options.homebrewCandidates ?? DEFAULT_HOMEBREW;

  const fromEnv = env.OMNIYA_LOU_TRANSLATE;
  if (fromEnv && exists(fromEnv)) return fromEnv;

  const bundled = bundledBin(resourcesPath, platform);
  if (bundled && exists(bundled)) return bundled;

  for (const candidate of homebrewCandidates) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

export function louSpawnEnv(binPath, options = {}) {
  const env = { ...(options.env ?? process.env) };
  const resourcesPath = options.resourcesPath ?? process.resourcesPath;
  const platform = options.platform ?? process.platform;
  const bundled = bundledBin(resourcesPath, platform);
  if (binPath && bundled && path.resolve(binPath) === path.resolve(bundled) && resourcesPath) {
    env.LOUIS_TABLEPATH = path.join(resourcesPath, 'liblouis', 'tables');
  }
  return env;
}

function runLou(args, input) {
  const bin = resolveLouTranslate();
  if (!bin) return Promise.reject(new Error('lou_translate not found'));
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'], env: louSpawnEnv(bin) });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(err.trim() || `lou_translate exited ${code}`));
      else resolve(out.replace(/\n$/, ''));
    });
    child.stdin.end(input);
  });
}

export async function translateUeb(text, grade = 'g2') {
  const table = TABLE[grade] ?? TABLE.g2;
  return runLou(['-f', table], String(text ?? ''));
}

export async function backTranslateUeb(braille, grade = 'g2') {
  const table = TABLE[grade] ?? TABLE.g2;
  return runLou(['-b', table], String(braille ?? ''));
}
