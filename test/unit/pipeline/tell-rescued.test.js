import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { AUTHOR, renderReply } from '../../../scripts/ci/reply.mjs';
import { decide, tellRescued } from '../../../scripts/ci/tell-rescued.mjs';

const bot = { login: AUTHOR };
const waiting = { user: bot, body: renderReply('maintainer').trim() };
const gaveBuild = { user: bot, body: renderReply('ready', { repo: 'a/b', pr: 7 }) };
const green = { 'pr-checks': 'success', 'pr-build': 'success' };
const stuck = { labels: ['needs-owner'], body: 'x\n\nFixes #73\n' };

test('says "ready" when a person fixed a red fix the contributor never got a build for', () => {
  const out = decide({ pr: stuck, comments: [waiting], runs: green });
  assert.equal(out.say, 'ready');
});

test('says "revised" when the contributor already had a build', () => {
  const out = decide({ pr: stuck, comments: [gaveBuild, waiting], runs: green });
  assert.equal(out.say, 'revised');
});

test('says nothing while a check or the build is not green', () => {
  assert.equal(decide({ pr: stuck, comments: [waiting], runs: { ...green, 'pr-build': '' } }).say, null);
  assert.equal(decide({ pr: stuck, comments: [waiting], runs: { ...green, 'pr-checks': 'failure' } }).say, null);
});

test('says nothing when the pull request is not waiting on a person', () => {
  assert.equal(decide({ pr: { ...stuck, labels: [] }, comments: [waiting], runs: green }).say, null);
});

test('says nothing when a newer pipeline comment already moved the contributor on', () => {
  // The ordinary green path, or a second run of this script: the newest comment
  // from the pipeline is a build, not the maintainer reply. Saying it again would
  // break "each thing once".
  const newer = { user: bot, body: renderReply('revised', { repo: 'a/b', pr: 7 }) };
  assert.equal(decide({ pr: stuck, comments: [waiting, newer], runs: green }).say, null);
  assert.equal(decide({ pr: stuck, comments: [], runs: green }).say, null);
});

test('a comment from a person does not count as a pipeline comment', () => {
  const person = { user: { login: 'someone' }, body: '@claude please look again' };
  assert.equal(decide({ pr: stuck, comments: [waiting, person], runs: green }).say, 'ready');
});

function fakeGh({ labels = ['needs-owner'], comments = [waiting], runs = ['success', 'success'], head = 'abc' } = {}) {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    const [a, b] = args;
    if (a === 'pr' && b === 'list') {
      return JSON.stringify([
        {
          number: 84,
          body: 'Text\n\nFixes #73\n',
          headRefName: 'claude/fix-73-enth-speech',
          headRefOid: head,
          isCrossRepository: false,
          labels: labels.map((name) => ({ name }))
        }
      ]);
    }
    if (a === 'api' && args[1].endsWith('/comments') && !args.includes('-f')) return JSON.stringify([comments]);
    if (a === 'run') {
      const workflow = args[args.indexOf('--workflow') + 1];
      const conclusion = runs[workflow === 'pr-checks' ? 0 : 1];
      return JSON.stringify([{ headSha: head, status: conclusion ? 'completed' : 'in_progress', conclusion }]);
    }
    return '';
  };
  return { run, calls };
}

test('posts one comment on the issue and takes the label off', () => {
  const { run, calls } = fakeGh();
  const out = tellRescued({ branch: 'claude/fix-73-enth-speech', repo: 'a/b' }, run);
  assert.equal(out.said, 'ready');
  const posts = calls.filter((c) => c[0] === 'api' && c.includes('-f'));
  assert.equal(posts.length, 1);
  assert.match(posts[0][1], /issues\/73\/comments/);
  assert.match(posts[0].join(' '), /releases\/download\/pr-84\/Omniya-Core-Setup-x64\.exe/);
  assert.ok(calls.some((c) => c[0] === 'issue' && c[1] === 'edit' && c.includes('--remove-label') && c.includes('needs-owner')));
});

test('does nothing while the build is still running', () => {
  const { run, calls } = fakeGh({ runs: ['success', ''] });
  const out = tellRescued({ branch: 'claude/fix-73-enth-speech', repo: 'a/b' }, run);
  assert.equal(out.said, null);
  assert.equal(calls.filter((c) => c.includes('-f')).length, 0);
});

test('refuses a branch that is not a fix branch', () => {
  assert.throws(() => tellRescued({ branch: 'testing', repo: 'a/b' }, () => '[]'), /not a claude\/fix-/);
});

test('the workflow runs one at a time per branch and never checks out the branch it reacts to', () => {
  const yml = readFileSync('.github/workflows/pipeline-rescued.yml', 'utf8');
  assert.match(yml, /workflow_run:/);
  assert.match(yml, /concurrency:[\s\S]*cancel-in-progress: false/);
  assert.match(yml, /ref: testing/);
  const refs = [...yml.matchAll(/^\s*ref:\s*(.+)$/gm)].map((m) => m[1].trim());
  assert.deepEqual(refs, ['testing'], 'the only checkout is `testing`, never the branch it reacts to');
  assert.doesNotMatch(yml, /CLAUDE_CODE_OAUTH_TOKEN/, 'no agent, no secret');
});

test('a person copying the pipeline marker cannot start or block a post', () => {
  const stranger = { login: 'someone' };
  // A copy of the maintainer reply from a person is not the contributor's wait.
  assert.equal(decide({ pr: stuck, comments: [{ user: stranger, body: waiting.body }], runs: green }).say, null);
  // A fake marker comment after the real wait does not hide it.
  const fake = { user: stranger, body: renderReply('revised', { repo: 'a/b', pr: 7 }) };
  assert.equal(decide({ pr: stuck, comments: [waiting, fake], runs: green }).say, 'ready');
  // A fake "you got a build" comment does not turn ready into revised.
  assert.equal(decide({ pr: stuck, comments: [{ ...gaveBuild, user: stranger }, waiting], runs: green }).say, 'ready');
});

test('tells a contributor whose last word was the maintainer reply from before the state line existed', () => {
  const legacyWaiting = {
    user: bot,
    body: '<!-- omniya-pipeline-reply -->\nThe maintainer needs to look at a technical problem with this fix.\nYou do not need to do anything.\nThe maintainer will write here when there is news.'
  };
  const out = decide({ pr: stuck, comments: [legacyWaiting], runs: green });
  assert.equal(out.say, 'ready');
  const saw = decide({ pr: stuck, comments: [gaveBuild, legacyWaiting], runs: green });
  assert.equal(saw.say, 'revised');
  // A person who copies the words is not the pipeline.
  const copied = { user: { login: 'someone' }, body: legacyWaiting.body };
  assert.equal(decide({ pr: stuck, comments: [copied], runs: green }).say, null);
  // Not green yet, or an edited comment: still silent.
  assert.equal(decide({ pr: stuck, comments: [legacyWaiting], runs: { ...green, 'pr-build': '' } }).say, null);
  assert.equal(decide({ pr: stuck, comments: [{ ...legacyWaiting, body: legacyWaiting.body + '\nExtra.' }], runs: green }).say, null);
});

// The hand-off's reply to Avery on issue 73, as GitHub stores it (copied from the real issue). It predates the
// hidden state line, and it is the `sent-automation` wording: the fix waits on a person.
const AVERY_SENT_AUTOMATION = "<!-- omniya-pipeline-reply -->\nThank you for testing.\nIt changes the automation itself, so the maintainer has to look at it first.\nThis issue closes when the maintainer merges the fix.\nYou do not need to do anything.";

test('tells a contributor whose last word was a hand-off refusal, once the fix is green again', () => {
  const sentAutomation = { user: bot, body: AVERY_SENT_AUTOMATION };
  const lifted = { runs: green, stillProtected: false };
  assert.equal(decide({ pr: stuck, comments: [sentAutomation], ...lifted }).say, 'ready');
  assert.equal(decide({ pr: stuck, comments: [gaveBuild, sentAutomation], ...lifted }).say, 'revised');
  for (const state of ['sent-automation', 'sent-owner', 'maintainer']) {
    const today = { user: bot, body: renderReply(state).trim() };
    assert.equal(decide({ pr: stuck, comments: [gaveBuild, today], ...lifted }).say, 'revised', state);
  }
  // The old wording of a hand-off wait stays a wait while the hand-off still protects the fix.
  assert.equal(decide({ pr: stuck, comments: [gaveBuild, sentAutomation], runs: green }).say, null);
  assert.equal(decide({ pr: stuck, comments: [gaveBuild, sentAutomation], runs: green, stillProtected: true }).say, null);
  // The maintainer reply is a wait on a person whatever the files are.
  assert.equal(decide({ pr: stuck, comments: [gaveBuild, { user: bot, body: renderReply('maintainer').trim() }], runs: green }).say, 'revised');
  // A fix that is set to merge by itself, or told to wait for a newer build, is not waiting on a person.
  for (const state of ['sent', 'behind', 'started', 'asked']) {
    const other = { user: bot, body: renderReply(state, { message: 'x' }).trim() };
    assert.equal(decide({ pr: stuck, comments: [gaveBuild, other], runs: green }).say, null, state);
  }
  // Not green yet, no label, a copy by another account, or an edited copy: silent.
  assert.equal(decide({ pr: stuck, comments: [sentAutomation], runs: { ...green, 'pr-build': '' } }).say, null);
  assert.equal(decide({ pr: { ...stuck, labels: [] }, comments: [sentAutomation], runs: green }).say, null);
  assert.equal(decide({ pr: stuck, comments: [{ user: { login: 'someone' }, body: AVERY_SENT_AUTOMATION }], runs: green }).say, null);
  assert.equal(decide({ pr: stuck, comments: [{ ...sentAutomation, body: AVERY_SENT_AUTOMATION + '\nExtra.' }], runs: green }).say, null);
});

// A fix the hand-off sent to the owner only because of where its files were. The rules changed (or a person
// moved the files), so the same hand-off would now let it through. The contributor still waits on the sentence.
const sentAutomation = { user: bot, body: renderReply('sent-automation').trim() };
const sentOwner = { user: bot, body: renderReply('sent-owner').trim() };

test('a hand-off wait is lifted only when the hand-off would no longer protect the fix', () => {
  assert.equal(decide({ pr: stuck, comments: [gaveBuild, sentAutomation], runs: green, stillProtected: false }).say, 'revised');
  assert.equal(decide({ pr: stuck, comments: [sentOwner], runs: green, stillProtected: false }).say, 'ready');
  assert.equal(decide({ pr: stuck, comments: [gaveBuild, sentAutomation], runs: green, stillProtected: true }).say, null);
  // Not told: the old call shape, where nothing says the rules changed, keeps the wait.
  assert.equal(decide({ pr: stuck, comments: [gaveBuild, sentAutomation], runs: green }).say, null);
  // `stillProtected: false` does not make any other reply a wait.
  assert.equal(decide({ pr: stuck, comments: [gaveBuild], runs: green, stillProtected: false }).say, null);
  assert.equal(decide({ pr: stuck, comments: [gaveBuild, sentAutomation], runs: { ...green, 'pr-build': '' }, stillProtected: false }).say, null);
});

function fakeHandOffGh({ files, comments = [gaveBuild, sentAutomation], changedFiles = files.length, mergeable = 'MERGEABLE' }) {
  const { run: base, calls } = fakeGh({ comments });
  const run = (args) => {
    calls.push(args);
    if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify({ mergeable, body: 'x\n\nFixes #73\n', changedFiles });
    if (args[0] === 'api' && args[1].endsWith('/files')) return files.map((f) => JSON.stringify({ status: 'modified', additions: 5, deletions: 0, ...f })).join('\n');
    return base(args);
  };
  return { run, calls };
}

test('tells the contributor, and takes the label off, when only automatic files remain', () => {
  const { run, calls } = fakeHandOffGh({ files: [{ filename: 'src/domain/nemeth/parser.js' }, { filename: 'scripts/build/build-sre-mathmaps.mjs' }, { filename: '.gitignore' }, { filename: 'test/unit/a.test.js' }] });
  const out = tellRescued({ branch: 'claude/fix-73-enth-speech', repo: 'a/b' }, run);
  assert.equal(out.said, 'revised');
  assert.ok(calls.some((c) => c[0] === 'issue' && c.includes('--remove-label') && c.includes('needs-owner')));
});

test('stays silent when a file is still outside the automatic places, or the list is not the whole change', () => {
  const still = fakeHandOffGh({ files: [{ filename: 'src/a.js' }, { filename: 'scripts/build-sre-mathmaps.mjs' }] });
  assert.equal(tellRescued({ branch: 'claude/fix-73-enth-speech', repo: 'a/b' }, still.run).said, null);
  const part = fakeHandOffGh({ files: [{ filename: 'src/a.js' }], changedFiles: 9 });
  assert.equal(tellRescued({ branch: 'claude/fix-73-enth-speech', repo: 'a/b' }, part.run).said, null);
  const workflow = fakeHandOffGh({ files: [{ filename: '.github/workflows/x.yml' }] });
  assert.equal(tellRescued({ branch: 'claude/fix-73-enth-speech', repo: 'a/b' }, workflow.run).said, null);
  assert.equal(still.calls.filter((c) => c.includes('-f')).length, 0, 'nothing is posted');
});

// A person's OWN fix branch: opened by the owner or the owner's session account, for an issue whose
// contributor has no build yet. Nothing else ever posts the build there, because the fixer never ran.
const routed = { user: bot, body: renderReply('routed') };
const mine = { labels: [], body: 'x\n\nFixes #77\n' };
const own = (over = {}) => decide({ pr: mine, comments: [], runs: green, byPerson: true, issueOpen: true, ...over });

test('own branch: says "ready" once the checks and the build pass, when the pipeline never gave a build', () => {
  assert.equal(own().say, 'ready');
  assert.equal(own({ comments: [routed] }).say, 'ready', 'the "a person answers" reply does not count as a build or a hold');
});

test('own branch: says nothing unless a person opened it, the issue is open, and both checks passed', () => {
  assert.equal(own({ byPerson: false }).say, null, 'the fixer\'s own pull request is never announced here');
  assert.equal(own({ issueOpen: false }).say, null);
  assert.match(own({ runs: { ...green, 'pr-build': '' } }).why, /not green yet: pr-build/);
  assert.equal(own({ runs: { ...green, 'pr-checks': 'failure' } }).say, null);
});

test('own branch: says nothing when the pipeline already spoke about a build, a question, a hold or a failure', () => {
  for (const state of ['ready', 'revised', 'asked', 'answered', 'maintainer', 'failed', 'stuck', 'sent', 'started']) {
    const comment = { user: bot, body: renderReply(state, { repo: 'a/b', pr: 7, message: 'Some words.' }) };
    assert.equal(own({ comments: [routed, comment] }).say, null, state);
  }
  assert.equal(own({ comments: [{ user: bot, body: '<!-- omniya-pipeline-reply -->\nThank you. I sent this fix to the maintainer.' }] }).say, null, 'old wording with no state line is not "routed"');
});

test('own branch: a comment from a person does not count as a pipeline reply, and cannot block or start a post', () => {
  const person = { user: { login: 'someone' }, body: renderReply('ready', { repo: 'a/b', pr: 7 }) };
  assert.equal(own({ comments: [person] }).say, 'ready');
});

function fakePerson({ author = 'ParkingSoman', comments = [routed], issueState = 'open', runs = ['success', 'success'] } = {}) {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    const [a, b] = args;
    if (a === 'pr' && b === 'list') {
      return JSON.stringify([{ number: 131, body: 'Text\n\nFixes #77\n', headRefName: 'claude/fix-77-equation', headRefOid: 'abc', isCrossRepository: false, labels: [], author: { login: author } }]);
    }
    if (a === 'api' && args.includes('--jq') && args[1].endsWith('/issues/77')) return `${issueState}\n`;
    if (a === 'api' && args[1].endsWith('/comments') && !args.includes('-f')) return JSON.stringify([comments]);
    if (a === 'run') {
      const workflow = args[args.indexOf('--workflow') + 1];
      const conclusion = runs[workflow === 'pr-checks' ? 0 : 1];
      return JSON.stringify([{ headSha: 'abc', status: conclusion ? 'completed' : 'in_progress', conclusion }]);
    }
    return '';
  };
  return { run, calls };
}

function withOwner(owner, fn) {
  const before = process.env.GITHUB_REPOSITORY_OWNER;
  if (owner === undefined) delete process.env.GITHUB_REPOSITORY_OWNER;
  else process.env.GITHUB_REPOSITORY_OWNER = owner;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env.GITHUB_REPOSITORY_OWNER;
    else process.env.GITHUB_REPOSITORY_OWNER = before;
  }
}

test('own branch, whole path: the owner\'s pull request gets one "ready" reply with the links, and its labels are untouched', () => {
  withOwner('ParkingSoman', () => {
    const { run, calls } = fakePerson();
    const out = tellRescued({ branch: 'claude/fix-77-equation', repo: 'a/b' }, run);
    assert.equal(out.said, 'ready');
    const posts = calls.filter((c) => c[0] === 'api' && c.includes('-f'));
    assert.equal(posts.length, 1);
    assert.match(posts[0][1], /issues\/77\/comments/);
    assert.match(posts[0].join(' '), /releases\/download\/pr-131\/Omniya-Core-Setup-x64\.exe/);
    // The ordinary reply may clear a stale needs-owner from the ISSUE. Nothing is added, and the pull request is untouched.
    const edits = calls.filter((c) => c[0] === 'issue' && c[1] === 'edit');
    assert.ok(edits.every((c) => c.includes('77') && c.includes('--remove-label') && !c.includes('--add-label')));
    assert.equal(edits.filter((c) => c.includes('131')).length, 0);
  });
});

test('own branch, whole path: the session account counts, a stranger and the fixer\'s App do not', () => {
  withOwner('ParkingSoman', () => {
    assert.equal(tellRescued({ branch: 'claude/fix-77-equation', repo: 'a/b' }, fakePerson({ author: 'omniya-bot' }).run).said, 'ready');
    for (const author of ['someone-else', 'app/omniya-pipeline', 'app/github-actions', 'avery8ingram-oss']) {
      const { run, calls } = fakePerson({ author });
      assert.equal(tellRescued({ branch: 'claude/fix-77-equation', repo: 'a/b' }, run).said, null, author);
      assert.equal(calls.filter((c) => c.includes('-f')).length, 0, author);
    }
  });
});

test('own branch, whole path: it says nothing on a closed issue, a running build, or a second run', () => {
  withOwner('ParkingSoman', () => {
    assert.equal(tellRescued({ branch: 'claude/fix-77-equation', repo: 'a/b' }, fakePerson({ issueState: 'closed' }).run).said, null);
    assert.equal(tellRescued({ branch: 'claude/fix-77-equation', repo: 'a/b' }, fakePerson({ runs: ['success', ''] }).run).said, null);
    const told = { user: bot, body: renderReply('ready', { repo: 'a/b', pr: 131 }) };
    assert.equal(tellRescued({ branch: 'claude/fix-77-equation', repo: 'a/b' }, fakePerson({ comments: [routed, told] }).run).said, null, 'each thing once');
  });
});

test('own branch, whole path: with no owner known, only the session account counts', () => {
  withOwner(undefined, () => {
    assert.equal(tellRescued({ branch: 'claude/fix-77-equation', repo: 'a/b' }, fakePerson({ author: 'ParkingSoman' }).run).said, null);
    assert.equal(tellRescued({ branch: 'claude/fix-77-equation', repo: 'a/b' }, fakePerson({ author: 'omniya-bot' }).run).said, 'ready');
  });
});
