import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { assertValidState, createInitialState } from '../domain/model.js';

export function createStorage(directory, { idFactory } = {}) {
  const dataFile = path.join(directory, 'napkins.json');
  const temporaryFile = `${dataFile}.tmp`;

  async function load() {
    try {
      const state = JSON.parse(await readFile(dataFile, 'utf8'));
      assertValidState(state);
      return { state, warning: null };
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return { state: createInitialState({ idFactory }), warning: null };
      }

      const recoveryFile = path.join(directory, `napkins.corrupt-${Date.now()}.json`);
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
    await mkdir(directory, { recursive: true });
    await writeFile(temporaryFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    await rename(temporaryFile, dataFile);
    return { savedAt: new Date().toISOString() };
  }

  return { load, save };
}
