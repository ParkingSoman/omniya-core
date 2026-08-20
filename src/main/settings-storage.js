import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * User-level app settings, separate from document content (see
 * `storage.js`). Currently holds one thing: which computer-braille input
 * table (if any) the Nemeth composer should decode keyboard input through --
 * see `src/domain/nemeth-input.js`'s `brailleInputTable` option for why this
 * exists. `'none'` is the default and matches this app's pre-existing
 * cells-only behavior exactly.
 *
 * Adding another table later means adding its key here, not a schema
 * migration: an unrecognized value in a saved settings file is treated the
 * same as absent, not as corruption.
 */
const KNOWN_BRAILLE_INPUT_TABLES = new Set(['none', 'en-us-comp8']);

export function createDefaultSettings() {
  return { nemethBrailleInputTable: 'none' };
}

function sanitize(raw) {
  const table = raw && typeof raw === 'object' ? raw.nemethBrailleInputTable : undefined;
  return {
    nemethBrailleInputTable: KNOWN_BRAILLE_INPUT_TABLES.has(table) ? table : 'none'
  };
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
