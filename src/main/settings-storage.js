import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * User-level app settings, separate from document content (see `storage.js`).
 *
 * Currently persists NOTHING, and that is the point rather than an oversight.
 * It held one key: which computer-braille input table the Nemeth composer
 * should decode through. That setting is gone because the question was both
 * unanswerable and unnecessary -- a contributor whose braille display was
 * configured correctly was refused on every keystroke and had no way to
 * discover a picker existed, while the app can tell cells from computer-braille
 * text by measurement (`resolveBrailleInputTable`), since the two occupy
 * disjoint code point ranges. Six-key chording, the one genuinely unmeasurable
 * question in this path, was removed rather than made a setting.
 *
 * The plumbing stays because the atomic write and corrupt-file recovery below
 * are the valuable part and there is a known next occupant: `uebGrade` is
 * session-only today (see docs/HUMAN-TESTING.md, "Honest limits").
 *
 * Unknown keys in a saved file are dropped, not treated as corruption, so a
 * settings.json written by an older build loads cleanly.
 */
export function createDefaultSettings() {
  return {};
}

function sanitize() {
  return createDefaultSettings();
}

/**
 * Same atomic-write, corrupt-file-recovery shape as `createStorage` in
 * `storage.js`, deliberately not shared with it: that module's `load`/`save`
 * are hardcoded to the napkin document schema (`assertValidState`,
 * `migrateState`), which settings have nothing to do with.
 */
export function createSettingsStorage(directory, { fileName = 'settings.json' } = {}) {
  const dataFile = path.join(directory, fileName);
  const temporaryFile = `${dataFile}.tmp`;
  const extension = path.extname(dataFile) || '.json';
  const baseName = path.basename(dataFile, extension);
  let writeQueue = Promise.resolve();

  async function load() {
    try {
      const raw = JSON.parse(await readFile(dataFile, 'utf8'));
      return { settings: sanitize(raw), warning: null };
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return { settings: createDefaultSettings(), warning: null };
      }

      const recoveryFile = path.join(directory, `${baseName}.corrupt-${Date.now()}${extension}`);
      try {
        await rename(dataFile, recoveryFile);
      } catch {
        // Recovery is best-effort; the user still needs usable settings.
      }
      return {
        settings: createDefaultSettings(),
        warning: 'Saved settings could not be read. A recovery copy was preserved.'
      };
    }
  }

  async function save(settings) {
    const sanitized = sanitize(settings);
    const write = writeQueue
      .catch(() => {})
      .then(async () => {
        await mkdir(directory, { recursive: true });
        await writeFile(temporaryFile, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
        await rename(temporaryFile, dataFile);
        return { savedAt: new Date().toISOString() };
      });
    writeQueue = write.catch(() => {});
    return write;
  }

  return { load, save };
}
