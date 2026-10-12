/**
 * What the agent did, in a form that is safe to show in a public job summary.
 *
 * `claude-code-action` hides the agent's output on purpose: it holds tool
 * results, which can hold anything the runner can read, including secrets. That
 * makes a silent failure impossible to diagnose. This keeps the useful part and
 * drops the dangerous part.
 *
 * KEPT:    the agent's own words (its text blocks), cleaned by the same rules the
 *          contributor-facing message goes through, and then scrubbed of anything
 *          shaped like a credential. The NAME of each tool it called, in order.
 *          For Read, Write and Edit, the file path. Turn count and cost.
 * DROPPED: every tool result. Every Bash command and every tool argument other
 *          than a file path, because a command can name or print a secret.
 *
 * Fails toward saying less. A file that cannot be read or parsed gives a line
 * saying so, never an error that stops the run: this is a diagnostic.
 *
 * Usage: node agent-digest.mjs <execution-file> [result-file] [message-file]
 * Writes Markdown to $GITHUB_STEP_SUMMARY, or stdout when that is not set.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { cleanMessage } from './reply.mjs';

export const MAX_DIGEST = 12000;
const MAX_BLOCK = 1500;
const PATH_TOOLS = new Set(['Read', 'Write', 'Edit', 'NotebookEdit']);

/** Replace anything shaped like a credential. Applied after cleaning. */
export function scrub(text) {
  return String(text)
    .replace(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{10,}/g, '[token removed]')
    .replace(/\bsk-[A-Za-z0-9_-]{10,}/g, '[token removed]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g, '[token removed]')
    .replace(/\b(Bearer|Basic|token)\s+[A-Za-z0-9._~+/=-]{12,}/gi, (_m, scheme) => `${scheme} [token removed]`)
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[key removed]')
    // Any long unbroken run of key-like characters.
    .replace(/\b[A-Za-z0-9+/_=-]{32,}\b/g, '[long value removed]');
}

function safePath(p) {
  return scrub(String(p ?? '').replace(/[^\w ./@+-]/g, '')).slice(0, 200);
}

/** @param {unknown} data the parsed execution file @returns {string} Markdown */
export function digest(data, { word, hadMessage } = {}) {
  const events = Array.isArray(data) ? data : [];
  const lines = ['### What the agent did', ''];
  lines.push(`Result word: \`${scrub(word ?? 'none written')}\`. message.md: ${hadMessage ? 'written' : 'not written'}.`, '');
  const steps = [];
  let final = null;
  for (const e of events) {
    if (e?.type === 'assistant' && Array.isArray(e.message?.content)) {
      for (const block of e.message.content) {
        if (block?.type === 'text' && typeof block.text === 'string') {
          const t = scrub(cleanMessage(block.text)).slice(0, MAX_BLOCK);
          if (t) steps.push(`- said: ${t.replace(/\n+/g, ' ')}`);
        } else if (block?.type === 'tool_use' && typeof block.name === 'string') {
          const name = safePath(block.name);
          const path = PATH_TOOLS.has(block.name) ? safePath(block.input?.file_path ?? block.input?.path ?? block.input?.notebook_path) : '';
          steps.push(`- tool: ${name}${path ? ` \`${path}\`` : ''}`);
        }
      }
    } else if (e?.type === 'result') {
      final = e;
    }
  }
  if (steps.length === 0) lines.push('The execution file held no agent steps.');
  else lines.push(...steps);
  if (final) {
    lines.push('', `Turns: ${Number(final.num_turns) || 0}. Ended: ${scrub(String(final.subtype ?? 'unknown'))}.`);
    if (typeof final.result === 'string') lines.push('', `Final words: ${scrub(cleanMessage(final.result)).replace(/\n+/g, ' ')}`);
  }
  const out = lines.join('\n');
  return out.length <= MAX_DIGEST ? out : `${out.slice(0, MAX_DIGEST)}\n...cut`;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [execFile, resultFile, messageFile] = process.argv.slice(2);
  let text;
  try {
    const word = resultFile && existsSync(resultFile) ? readFileSync(resultFile, 'utf8').split('\n')[0].trim() : undefined;
    const hadMessage = Boolean(messageFile && existsSync(messageFile) && readFileSync(messageFile, 'utf8').trim());
    text = digest(JSON.parse(readFileSync(execFile, 'utf8')), { word, hadMessage });
  } catch {
    text = '### What the agent did\n\nThe execution file could not be read.';
  }
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
  else process.stdout.write(`${text}\n`);
}
