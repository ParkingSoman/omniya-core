# The contributor fix pipeline

This page has two halves. The first is for a contributor reporting a bug. The
second is for the maintainer.

It is written in plain sentences, without nested lists, because it is read
aloud.

## If you found a bug

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

An agent reads the report, reproduces the bug, writes a test that fails for your
reason, fixes it, and runs four checks: the unit tests, both Nemeth gates, and
the end-to-end tests. If all four pass it opens a pull request.

Then a build is made for you, and a comment appears on that pull request with a
direct download link for macOS and one for Windows. Install it and try the thing
that was broken. You are the only person who can answer whether the bug is
actually gone, which is why this step exists rather than someone deciding on
your behalf.

Now there are two things you can do, and they are different.

If it is still wrong, say so in a comment on the pull request, and write
`@claude` somewhere in that comment. The agent reads your comment, reads the
whole thread, and revises the same branch. A new build replaces the old one
behind the same links. Download again from the links already in the thread. They
do not change, and no new comment with new links appears.

The word `@claude` is what starts that work. A comment without it is read by
people, not by the agent. That is on purpose: each run costs the maintainer part
of a paid quota, so "thanks, I will test tonight" should not spend one.

You can go round this as many times as it takes.

If it is right, close the issue. Closing the issue is what merges the fix. Do
that only after you have installed the build and checked, because after it
merges it goes out to every alpha tester, and on Windows it installs itself in
the background.

If closing the issue does not merge it, you get a comment saying so and why.
Nothing is broken when that happens, and the maintainer can finish it by hand.

One thing to watch for. Some behaviour in this app was removed on purpose, and
the reasons are written down in `CLAUDE.md` and in
`docs/nemeth-v2/HANDOFF.md`. A fix for your bug might put one of those things
back. When that happens the pull request has to say so, under a heading that
reads "Reverses a standing note", and say why your report outweighs the older
reason. If you see that heading, read it. A fix can be right for you and still
be wrong for somebody else, and that paragraph is the only place the trade is
visible.

## If you maintain this repository

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

The issue form and the three agent workflows must be on `main`. GitHub only
starts an `on: issues` or `on: issue_comment` workflow, and only offers an issue
form, from the default branch's copy. App code stays on `testing`; those files
are merged to `main` once and left there.

A file on the wrong branch does not warn you. It just never runs. If a
contributor writes `@claude` and nothing happens, check that
`contributor-followup.yml` is on `main` before you check anything else.

The gates and the build are the other way round. They trigger on
`pull_request`, and GitHub runs the pull request's own copy of those files, so
they live on `testing` with everything else and never go near `main`.

One label has to exist: `needs-design`. The fix workflow puts it on a report
that turns out to be a feature request. Adding a label that does not exist
fails, and the contributor gets silence instead of an answer.

### Adding a contributor

Two steps, and both are needed.

Add their GitHub handle to `.github/contributors.yml`. That file is the one
place that says who may spend your subscription quota.

Then invite them to the repository as a collaborator with write access.

The two are deliberately separate. Taking somebody off the allowlist stops them
driving the pipeline without removing their repository access, and the reverse
is also true.

### What protects the branches

`main` refuses a direct push. `testing` takes a change only through a pull
request whose checks passed. Both are GitHub rulesets, and they are what makes
handing out write access safe: a contributor with write access could otherwise
push straight to `testing`, and a push to `testing` ships to every alpha tester
with Windows installing it in the background.

### Letting a closed issue merge its own fix

`contributor-signoff.yml` runs when a contributor closes their issue. It finds
the pull request carrying a `Fixes #<number>` line for that issue and asks GitHub
to merge it into `testing`.

It runs as `github-actions[bot]`. The `testing-guard` ruleset lists exactly one
bypass actor, you, so that merge is refused until you add
`github-actions[bot]` to the ruleset's bypass actors.

Until you do, closing an issue posts a comment on the pull request with the exact
refusal, and a comment on the issue pointing at it. Nothing merges and nothing
breaks. That is the pipeline as it was before this workflow existed, with the
addition that the contributor is told rather than left waiting.

There is deliberately no `--admin` anywhere in that workflow. A close asks GitHub
to merge; GitHub still applies every rule on the ruleset, so a pull request whose
checks are red is refused exactly as it would be under your own finger.

Turn it on once you have watched enough fixes to trust the agent's judgement on
this codebase. The check the contributor performs, installing the build and
confirming the bug is gone, is real but it has one hole: asked "is the bug gone",
they will approve a fix that re-adds something removed on purpose, because for
them it works. The "Reverses a standing note" section in the pull request body is
what makes that visible, and it is worth reading a few of those before you stop
being the person who presses merge.

### Giving a contributor merge access

The same ruleset, and the same one change. To let somebody merge by hand, add
them to `testing-guard`'s bypass actors.

### The files

The `Lives on` column is not a detail. A file on the wrong branch does not warn
you; it just never runs.

| File | Lives on | What it does |
|---|---|---|
| `.github/ISSUE_TEMPLATE/bug-report.yml` | `main` | The form. Three required fields. |
| `.github/ISSUE_TEMPLATE/config.yml` | `main` | Keeps blank issues on, so a feature request has somewhere to go. |
| `.github/contributors.yml` | `main` | Who may drive the pipeline. |
| `scripts/ci/allowlist.mjs` | `main` | Reads that file and decides. Fails closed. |
| `.github/workflows/contributor-fix.yml` | `main` | Issue to pull request. |
| `.github/workflows/contributor-followup.yml` | `main` | An `@claude` comment on the pull request to a revision of the same branch. |
| `.github/workflows/contributor-signoff.yml` | `main` | A closed issue to a merge into `testing`. |
| `.github/workflows/pr-checks.yml` | `testing` | The four gates. |
| `scripts/ci/nemeth-gate.mjs` | `testing` | Makes the two Nemeth reports able to fail. |
| `.github/workflows/pr-build.yml` | `testing` | Publishes a per-pull-request build to install. |
| `.github/workflows/testing-app.yml` | `testing` | Fires on every push to `testing` and publishes the alpha build. This is what a merge reaches. |
