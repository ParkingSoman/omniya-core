import { spawn } from 'node:child_process';
import fs from 'node:fs';

const TABLE = {
  g1: 'unicode.dis,en-ueb-g1.ctb',
  g2: 'unicode.dis,en-ueb-g2.ctb'
};

const ABSOLUTE_CANDIDATES = [
  '/opt/homebrew/bin/lou_translate',
  '/usr/local/bin/lou_translate'
];

export function resolveLouTranslate() {
  const fromEnv = process.env.OMNIYA_LOU_TRANSLATE;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  for (const candidate of ABSOLUTE_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function runLou(args, input) {
  const bin = resolveLouTranslate();
  if (!bin) return Promise.reject(new Error('lou_translate not found'));
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
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
