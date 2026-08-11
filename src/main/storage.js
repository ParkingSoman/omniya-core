import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assertValidState, createInitialState } from '../domain/model.js';
import { migrateState } from '../domain/migration.js';

export function createStorage(directory, { idFactory, fileName = 'napkins.json' } = {}) {
  const dataFile = path.join(directory, fileName);
  const temporaryFile = `${dataFile}.tmp`;
  const extension = path.extname(dataFile) || '.json';
  const baseName = path.basename(dataFile, extension);
  let writeQueue = Promise.resolve();

  async function load() {
    try {
      const raw = JSON.parse(await readFile(dataFile, 'utf8'));
      const migrated = migrateState(raw);
      assertValidState(migrated);
      const warning = migrated.warnings?.length ? migrated.warnings.map(({ message }) => message).join(' ') : null;
      const { warnings: _warnings, ...state } = migrated;
      return { state, warning };
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return { state: createInitialState({ idFactory }), warning: null };
      }

      const recoveryFile = path.join(directory, `${baseName}.corrupt-${Date.now()}${extension}`);
      try {
        await rename(dataFile, recoveryFile);
      } catch {
        // Recovery is best-effort; the user still needs a usable document.
      }
      return {
        state: createInitialState({ idFactory }),
        warning: 'Saved napkins could not be read. A recovery copy was preserved.'
      };
    }
  }

  async function save(state) {
    assertValidState(state);
    const write = writeQueue
      .catch(() => {})
      .then(async () => {
        await mkdir(directory, { recursive: true });
        await writeFile(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
        await rename(temporaryFile, dataFile);
        return { savedAt: new Date().toISOString() };
      });
    writeQueue = write.catch(() => {});
    return write;
  }

  return { load, save };
}
