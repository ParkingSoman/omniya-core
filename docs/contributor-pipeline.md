# The contributor fix pipeline

This page has two halves. The first is for a contributor reporting a bug. The
second is for the maintainer.

It is written in plain sentences, without nested lists, because it is read
aloud.

## If you found a bug

You never need to leave your issue. Everything happens there.

Open a bug report on GitHub. Use the "Bug report" form, not a blank issue.

The form asks three things. What happened. What you expected instead. And a
diagnostics dump.

To get the dump, open the Help menu in the app and choose "Copy braille input
diagnostics". That puts it on your clipboard. Paste it into the third field.

Read the dump before you paste it. It contains what you typed: the mathematics,
any other text in those fields, and your napkin names. The issue is public, so
anyone can read it, and it stays readable after the bug is fixed. Take out
anything you would rather not publish. If the dump is the only way to show the
bug and you would rather not publish it, say so in the form and send it by
email instead.

The second field is the one that decides what happens next. If you describe what
should have happened, the report is treated as a bug and worked on
automatically. If you are asking for something the app does not do yet, that is
a design decision, and a person answers it. You will get a comment saying so
rather than silence.

Here is what happens after you press submit.

Within a minute, a comment appears on your issue that starts with "Where this
fix stands". It says that work has started. You do not need to do anything.

An agent reads your report, reproduces the bug, writes a test that fails for
your reason, and fixes it. Then it checks its own work. If a check fails, it
repairs the fix and checks again. You do not see any of that.

About an hour later, the same comment changes. It now says that a test build is
ready, and that all the automatic checks passed. It has two download links. One
is for Mac and one is for Windows. GitHub does not notify you when a comment is
edited. So the pipeline also writes one short new comment, which links to the
one with the download links. You hear that one. Open the link in it. The
download links are always in the same place, so come back to the same comment
each time.

Install the build and try the thing that was broken. You are the only person
who can answer whether the bug is actually gone. That is why this step exists,
rather than someone deciding on your behalf.

Now there are two things you can do. Both are a new comment on the same issue.

If it is still wrong, write a comment that starts with `@claude` and say what
you found. The agent reads your comment and the whole conversation, and changes
the fix. A new build replaces the old one behind the same links. Download again
from the links already in the "Where this fix stands" comment. They do not
change. The comment says "I am changing the fix" while the new build is made.

If it works, write `@claude it works`. Do not close the issue. The agent sends
the fix to the maintainer, who reviews it and merges it. The issue closes by
itself when the maintainer merges. The fix then goes out to every alpha tester,
and on Windows it installs itself in the background. That is why a person
reviews it first.

If you close the issue yourself, the fix is not sent. You get a comment that
says so and tells you what to write instead. Open the issue again and write it.

The word `@claude` is what starts the work. A comment without it is read by
people, not by the agent. That is on purpose: each run costs the maintainer part
of a paid quota, so "thanks, I will test tonight" should not spend one. The
"Where this fix stands" comment reminds you of the word each time.

You can go round this as many times as it takes.

One more thing can appear. The comment may say that the maintainer needs to look
at a technical problem. That means the checks failed in a way the agent could
not repair. Nothing is wrong with your report and you do not need to do
anything. The maintainer will write on the issue when there is news.

## If you maintain this repository

### What the contributor sees, and what you see

The contributor sees one issue. You see a pull request, and the pipeline keeps
the two joined by a `Fixes #<number>` line, which is the last line of the pull
request body.

| Step | The contributor sees on the issue | You see |
|---|---|---|
| Report filed | "Where this fix stands": working | Nothing yet |
| Agent finishes | One short plain comment from the agent | A draft pull request into `testing` |
| Checks and build pass | The same comment, edited: build ready, with links. Plus one short new comment, because an edit sends no notification | Green `unit`, `nemeth`, `e2e`. Draft still |
| Contributor writes `@claude` and a problem | The same comment, edited: changing the fix | New commits on the same branch |
| Contributor writes `@claude it works` | The same comment, edited, plus a short new comment: sent to the maintainer | Pull request out of draft, label `ready-for-maintainer`, you asked to review |
| You merge | A closing comment, and the issue closes | The merge into `testing` |

### Merging a fix

When the contributor writes `@claude it works`, the pipeline checks that `unit`,
`nemeth` and `e2e` are green on the pull request's head commit. If they are, it
takes the pull request out of draft, adds the label `ready-for-maintainer`,
asks you to review, and writes the commit that was tested in a pull request
comment. If they are not, it adds `needs-maintainer` and tells the contributor
that you have been told.

Nothing merges by itself. Closing the issue merges nothing. You merge, in the
ordinary way.

Your merge closes the issue. GitHub only closes an issue from a `Fixes` line
when the pull request merges into the default branch, and these merge into
`testing`. So `pipeline-close-issue.yml` closes it instead.

Before you merge, read the pull request body for a heading "Reverses a standing
note". The contributor checks one thing only, which is whether the bug is gone
on their own machine. They will approve a fix that re-adds something removed on
purpose, because for them it works. That heading is the only place the trade is
visible, and it is yours to judge.

### When the checks fail

After the agent opens or changes a pull request, `pipeline-verify.yml` starts
`pr-checks` and `pr-build` on the branch and waits for both. If either fails, a
second agent reads the end of the failed log and repairs the cause. Then the
checks run again. There are three repairs at most. After that the pipeline stops.

The repair agent is told never to edit a check, a workflow, a test or a corpus
row to make it pass. It is also told that the check may be what is wrong. Then
it changes nothing, writes the technical case on the pull request, and adds the
label `needs-maintainer`. Read that comment. It is the recommendation to change
a check, and the change is yours to make.

When the pipeline stops, the contributor sees only that you need to look at a
technical problem. The pull request gets `needs-maintainer` and a comment with a
link to the run. The log of each failed round is an artifact on that run, named
`failed-checks-1` and so on.

A failing `pipeline-on-main` check is not a fault in the fix. It means a stub on
`testing` differs from its copy on `main`. See "Changing a stub" below.

### Setting it up

Nothing runs until the repository holds a Claude subscription token. Generate one
and store it.

```
claude setup-token
gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo ParkingSoman/omniya-core
```

Runs draw on your Claude subscription quota, not on API billing. There is no
`anthropic_api_key` input anywhere in these workflows, and a unit test fails if
one is added.

GitHub starts an `on: issues` or `on: issue_comment` workflow only from the
default branch, and the default branch is `main`. That is a GitHub rule, not a
choice made here. So `main` holds three small stubs, and each stub does one
thing: it calls the real workflow on `testing`. The prompts, the tools and the
gates all live on `testing`. Changing what the pipeline does is an ordinary pull
request into `testing`, and nothing is copied to `main`.

Three things live on `main`. The stubs, the allowlist, and the issue form. The
stubs are copied there once from `.github/pipeline-stubs/`, and only again if a
stub itself is edited. The allowlist exists on `main` only, on purpose, so that
the people who can merge to `testing` cannot add themselves to it.

Forgetting to copy a stub is what broke issue #22: an allowlist entry reached
`testing` and never reached `main`, the gate on `main` refused its author, and
nobody was told for 23 days. The `pipeline-on-main` job in `pr-checks.yml` now
fails a pull request into `testing` when a stub on `testing` differs from its
copy on `main`, when a stub is missing there, or when the allowlist on `main`
cannot be read. It names the file. Fix that file on `main`, then run the check
again.

A file on the wrong branch does not warn you. It just never runs. If a
contributor writes `@claude` and nothing happens, check that
`contributor-followup.yml` is on `main` before you check anything else.

The gates and the build are the other way round. They trigger on
`pull_request`, and GitHub runs the pull request's own copy of those files, so
they live on `testing` with everything else and never go near `main`.

The labels `needs-design`, `needs-maintainer` and `ready-for-maintainer` have to
exist, because adding a label that does not exist fails. The pipeline creates
the last two itself when it needs them. `needs-design` is put on a report that
turns out to be a feature request, and it has to be created by hand once.

### Changing a stub

The follow-up stub changed when the contributor moved from the pull request to
the issue. The same is true of the issue form. A change to either has to reach
`main`, and `pipeline-on-main` fails the `testing` pull request until it does.

The order is this. Open the pull request into `testing`. It shows a red
`pipeline-on-main`, which is expected. Open a second pull request into `main`
that carries only the changed stub and the changed issue form, copied byte for
byte. Merge the one into `main` first. Run `pr-checks` again on the `testing`
pull request, and merge it when it is green.

Until both are merged, the old behaviour keeps running. The old follow-up stub
answers a `@claude` comment on a pull request. The new one answers it on the
issue.

### Why the pipeline starts its own checks

GitHub does not run a pull request's checks on its own when the Actions bot
opened it. The run waits for a person to approve it, and a push made with the
bot's token starts no run at all. Without a fix, the required `unit`, `nemeth`
and `e2e` checks would never report, and no test build would be made.

So `pipeline-verify.yml` starts `pr-checks.yml` and `pr-build.yml` itself, on the
pull request's branch, with `workflow_dispatch`. GitHub neither holds nor skips a
run started that way, and the checks report on the branch's latest commit, which
is what the pull request is waiting for.

A branch cut before the `quiet` input was added to `pr-build.yml` cannot be
dispatched with it, and the pipeline's dispatch fails with an error about an
unexpected input. A branch that old is a fix from before this pipeline. Use the
"Update branch" button on it, then re-run the pipeline by hand.

`gh workflow run` does not say which run it started. So `verify-branch.mjs`
notes the head commit and the time, then looks for the run on that branch, from
that event, on that commit, created after that time.

The jobs that hold `actions: write` run no agent. The jobs that run an agent hold
no `actions` permission. That split is the point: an agent that talked its way
past its rules still could not start or cancel a workflow.

`pr-build.yml` skips its own `pull_request` run for a `claude/fix-` branch,
because the pipeline builds those itself. Do not add a condition to `unit`,
`nemeth` or `e2e` to skip them. A skipped job satisfies a required check, and a
red pull request could then merge.

### A report was missed

If a report did not start a run, open the Actions tab, choose
`contributor-fix`, press "Run workflow", and type the issue number. It is gated
like an automatic run: the allowlist checks who wrote the issue, not who pressed
the button.

When the gate refuses an author, the issue gets one comment saying so. It costs
no Claude quota. A report that gets no comment at all means the workflow never
started, so check that the stubs are on `main`.

When a listed contributor writes `@claude` on an issue that has no open fix, or
more than one, the issue gets one comment saying so. The pipeline will not guess.

### Adding a contributor

Run one command from any checkout, logged in to the GitHub CLI as the
maintainer.

```
node scripts/ci/add-contributor.mjs <github-handle>
```

It does two things. It adds the handle to `.github/contributors.yml` on `main`,
which is the one place that says who may spend your subscription quota. Then it
invites them to the repository as a collaborator with write access, so they can
comment on and reopen their own issue.

Add `--dry-run` first to see what it would do, or `--no-invite` to skip the
invitation. The two are deliberately separate things. Removing somebody from the
list stops them driving the pipeline without removing their repository access.
To remove them, delete their line from `.github/contributors.yml` on `main`.

### What protects the branches

`main` refuses a direct push. `testing` takes a change only through a pull
request whose checks passed. Both are GitHub rulesets, and they are what makes
handing out write access safe: a contributor with write access could otherwise
push straight to `testing`, and a push to `testing` ships to every alpha tester
with Windows installing it in the background.

The pipeline merges nothing and uses no `--admin` flag anywhere. `testing-guard`
asks for a pull request and for `unit`, `nemeth` and `e2e` to pass. It asks for
no approval, so you can merge as soon as those are green.

### What has not been watched yet

The new loop is built from tested pieces, but a live run has not been seen. These
are the places to look first.

The agent now runs with `track_progress` off. The action then chooses its "agent"
mode on every event, which makes no branch of its own. The fix prompt creates the
branch itself. If a fix run ends with no pull request, read that first.

The comment path reads the thread from the issue, through `listed-thread.mjs`. The
agent's own earlier comments are by a bot and are left out of it, so the agent
reads the pull request body and the commits to remember what it changed.

The workflows call each other on `testing` by name. A change to them takes effect
only after it merges into `testing`, so the first real test is after the merge.

### The files

The `Lives on` column is not a detail. A file on the wrong branch does not warn
you; it just never runs.

| File | Lives on | What it does |
|---|---|---|
| `.github/ISSUE_TEMPLATE/bug-report.yml` | `main` | The form. Three required fields. Says where to write next. |
| `.github/ISSUE_TEMPLATE/config.yml` | `main` | Keeps blank issues on, so a feature request has somewhere to go. |
| `.github/contributors.yml` | `main` | Who may drive the pipeline. Exists on `main` only. |
| `scripts/ci/allowlist.mjs` | `main` | Reads that file and decides. Fails closed. Also kept on `testing`, and the two must match. |
| `.github/workflows/contributor-fix.yml` | `main` | Stub. Issue opened, or run by hand, calls `pipeline-fix.yml`. |
| `.github/workflows/contributor-followup.yml` | `main` | Stub. An `@claude` comment on an issue calls `pipeline-followup.yml`. |
| `.github/workflows/contributor-signoff.yml` | `main` | Stub. A closed issue calls `pipeline-signoff.yml`. |
| `.github/pipeline-stubs/` | `testing` | The source of the three stubs above, with tests. Not read by GitHub from here. |
| `.github/workflows/pipeline-fix.yml` | `testing` | Issue to draft pull request. Tells the contributor work has started. |
| `.github/workflows/pipeline-followup.yml` | `testing` | A comment on the issue to a revision, an answer, or a hand-off. |
| `.github/workflows/pipeline-agent.yml` | `testing` | The one place an agent runs, in mode `fix`, `comment` or `checks-failed`. |
| `.github/workflows/pipeline-verify.yml` | `testing` | Checks and builds the branch, repairs it up to three times, then reports on the issue. |
| `.github/workflows/pipeline-signoff.yml` | `testing` | A closed issue with a fix still open gets one comment saying closing sends nothing. |
| `.github/workflows/pipeline-close-issue.yml` | `testing` | Your merge of a fix closes its issue. |
| `scripts/ci/find-fix-pr.mjs` | `testing` | The one rule for "which open pull request is the fix for issue N". |
| `scripts/ci/status-comment.mjs` | `testing` | Writes and edits the "Where this fix stands" comment. |
| `scripts/ci/verify-branch.mjs` | `testing` | Starts the checks and the build, waits, and keeps the log of what failed. |
| `scripts/ci/hand-off.mjs` | `testing` | Takes the pull request out of draft when the contributor says it works. |
| `scripts/ci/gh.mjs` | `testing` | Runs `gh` without a shell. Shared by the scripts above. |
| `scripts/ci/listed-thread.mjs` | `testing` | Builds the thread the agent reads, from allowlisted people only. |
| `scripts/ci/add-contributor.mjs` | `testing` | The one command that adds a person. |
| `.github/workflows/pr-checks.yml` | `testing` | The gates: `unit`, `nemeth`, `e2e`, and `pipeline-on-main`. |
| `scripts/ci/pipeline-drift.mjs` | `testing` | Fails a pull request when a stub differs from its copy on `main`, or the allowlist there cannot be read. |
| `scripts/ci/nemeth-gate.mjs` | `testing` | Makes the two Nemeth reports able to fail. |
| `.github/workflows/pr-build.yml` | `testing` | Publishes a per-pull-request build to install. |
| `.github/workflows/testing-app.yml` | `testing` | Fires on every push to `testing` and publishes the alpha build. This is what a merge reaches. |
