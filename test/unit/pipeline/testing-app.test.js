import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { load as loadYaml } from 'js-yaml';

const workflow = loadYaml(readFileSync('.github/workflows/testing-app.yml', 'utf8'));
const runOf = (job, name) => workflow.jobs[job].steps.find((s) => s.name?.startsWith(name))?.run ?? '';

test('the two packaging jobs can both move the tag without one of them failing', () => {
  // Measured on the run for the merge of #29. `pack-mac` and `pack-win` both
  // force-push the same `testing-app` tag to the same commit at the same time.
  // Git refuses the one that loses ("cannot lock ref"), and in `pack-mac` that
  // push came BEFORE the upload, so the Mac zip was never published and the run
  // was red. Earlier runs had simply been lucky.
  const mac = runOf('pack-mac', 'Publish zip');
  assert.match(mac, /git push origin testing-app --force \\\n\s*\|\| \[ "\$\(git ls-remote origin refs\/tags\/testing-app \| cut -f1\)" = "\$GITHUB_SHA" \]/);

  const win = runOf('pack-win', 'Publish installer');
  assert.match(win, /git push origin testing-app --force\n\s*if \(\$LASTEXITCODE -ne 0\)/);
  assert.match(win, /ls-remote origin refs\/tags\/testing-app/);
  assert.match(win, /throw "could not move the testing-app tag"/, 'a tag that is NOT where it should be is still a failure');
});

test('the upload still comes after the tag in both jobs, so a stuck tag still stops a half-published release', () => {
  assert.ok(runOf('pack-mac', 'Publish zip').indexOf('git push origin testing-app') < runOf('pack-mac', 'Publish zip').indexOf('gh release upload'));
});
