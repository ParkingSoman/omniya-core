# The contributor fix pipeline

This page has two halves. The first is for a contributor reporting a bug. The
second is for the maintainer.

It is written in plain sentences, without nested lists, because it is read
aloud.

## If you found a bug

You never need to leave your issue. Everything happens there.

Open a new issue on GitHub. You must pick one of four forms. Pick the one that
fits.

| Form | Use it when | Who works on it |
|---|---|---|
| Bug report | Something the app says it does is missing or does not work. | An agent |
| Nemeth feature | A symbol or rule from the Nemeth Code is missing. | An agent |
| Design | You want something new, or want the app to look, sound or behave differently. | A person |
| Other | It is none of the above. | A person |

A Bug report and a Nemeth feature are worked on automatically. This is on
purpose. A missing symbol is a question of whether the app is complete, and you
know the Code. A new idea about how the app should feel is different. A person
reads a Design report or an Other report, and answers it on the issue. No agent
starts on those.

Each issue gets one comment from the pipeline for each thing that happens. It
does not say the same thing twice. Every comment has something new in it.

### The Bug report form

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

### The Nemeth feature form

The form asks for the symbol in words, the braille cells, and what it means and
how it should be read aloud. It can also take the section of the Nemeth Code, if
you know it. The diagnostics are optional. You do not have to know how it should
be read. If you do not, say so, and the agent will choose a reading the Code
implies and tell you which one.

The agent looks the rule up in the Nemeth Code itself. Your description tells it
what is missing. The Code tells it what to add. If the two differ, the Code wins,
and you will be told.

### What happens after you press submit

Within a minute, one short comment appears on your issue. It says that work has
started. You do not need to do anything.

An agent reads your report, reproduces the problem, writes a test that fails for
your reason, and fixes it. Then it checks its own work. If a check fails, it
repairs the fix and checks again. You do not see any of that, and you hear
nothing from the pipeline until it is done.

About an hour later, one new comment appears. It says what the agent understood
and what it changed. Under that are two download links. One is for Mac and one
is for Windows. It also says that all the automatic checks passed, and what to
write next. Open the links in that comment.

Install the build and try the thing that was broken. You are the only person
who can answer whether the bug is actually gone. That is why this step exists,
rather than someone deciding on your behalf.

Now there are two things you can do. Both are a new comment on the same issue.

If it is still wrong, write a comment that starts with `@claude` and say what
you found. The agent reads your comment and the whole conversation, and changes
the fix. Then you get one new comment. It says what the agent changed, and that
the links are the same links as before. Download again from them. Nothing is
written to you while the new build is made.

If it works, write `@claude it works`. Do not close the issue. The agent sends
the fix to the maintainer, who reviews it and merges it. The issue closes by
itself when the maintainer merges. The fix then goes out to every alpha tester,
and on Windows it installs itself in the background. That is why a person
reviews it first.

If you close the issue yourself, the fix is not sent. You get a comment that
says so and tells you what to write instead. Open the issue again and write it.

If you ask a question, start it with `@claude` too. You get one comment with the
answer. The code does not change.

The word `@claude` is what starts the work. A comment without it is read by
people, not by the agent. That is on purpose: each run costs the maintainer part
of a paid quota, so "thanks, I will test tonight" should not spend one. Each
comment with links in it reminds you of the word.

You can go round this as many times as it takes.

Sometimes the agent needs to ask you something before it starts. That is rare.
It happens when your report can be read two ways, or when the agent cannot see
what went wrong. You get one comment, and it is the question. It has at most
three short questions, and it says how to answer. Answer in a comment that starts
with `@claude`. The agent starts as soon as you answer. If you do not know an
answer, say so. That is a good answer. The agent also asks when it cannot make
the fault happen on its own. It then says what it tried and what would help it
see the fault. There is no fixed number of questions, because each round starts
only when you write.

One more thing can appear. A comment may say that the maintainer needs to look at
a technical problem. That means the checks failed in a way the agent could not
repair. Nothing is wrong with your report and you do not need to do anything. The
maintainer will write on the issue when there is news.

## If you maintain this repository

### What the contributor sees, and what you see

One comment per event. The pipeline writes every comment on the issue, and the
agent writes none. The agent leaves its plain words in a file. The pipeline puts
them inside the one comment the event gets. Nothing is edited, because GitHub
sends no notification for an edit and a blind contributor would never hear it.

| Event | The one comment on the issue | You see |
|---|---|---|
| Bug or Nemeth report filed | "I started on this" | Nothing yet |
| Design or Other report filed | "A person will answer here". No agent runs | The issue, labelled `design` or `other` |
| Agent finishes, checks and build pass | The agent's words, then the links, then what to write next | A draft pull request into `testing`. Green `unit`, `nemeth`, `e2e` |
| Agent says it is design | The agent's words, then that the maintainer will answer | Label `needs-design` |
| Agent is blocked: a check stays red, or the pull request will not open | The agent's words, which name the check and why, then that the maintainer will answer | Label `needs-maintainer` |
| Agent cannot make the fault happen, or is unsure | The agent's words and a question, then how to answer | Label `needs-info` before a fix exists, no label after |
| The agent run ends with no usable words | "Something went wrong on my side", then that the maintainer was told | Label `needs-maintainer`, and the run is red with the reason in its summary |
| Contributor writes `@claude` and a problem | One comment: what changed, the same links | New commits on the same branch |
| Contributor writes `@claude` and a question | One comment: the answer | Nothing |
| Contributor writes `@claude it works` | One comment: sent to the maintainer | Pull request out of draft, label `ready-for-maintainer`, you asked to review |
| You merge | A closing comment, and the issue closes | The merge into `testing` |

The contributor sees one issue. You see a pull request, and the pipeline keeps
the two joined by a `Fixes #<number>` line, which is the last line of the pull
request body.

### Why the agent posts nothing

The contributor used to hear everything twice or three times. The pipeline wrote
an edited status comment and a notice about the edit, and the agent wrote its own
comment as well. Asking the agent to stay quiet did not hold, because two writers
shared one issue. So the agent no longer has a way to post. Its job has
`issues: read`. It writes `message.md`. `pipeline-agent.yml` returns that text as
the `message` output, and `scripts/ci/reply.mjs` posts it once.

The agent's text is untrusted, because the agent reads hostile reports and the
words are posted in public. It reaches the next jobs through `env` and never
inside a `run:` line. `reply.mjs` cuts it to 2000 characters. It drops any line
that carries the pipeline's marker. It removes links, `@` mentions and HTML. The
only links a contributor is sent are the two download links that `reply.mjs`
builds itself.

### The four kinds

The form puts a label on the issue, and `scripts/ci/issue-kind.mjs` reads it.

| Label | Kind | What runs |
|---|---|---|
| `bug` | `bug` | The agent |
| `nemeth` | `nemeth` | The agent, told that a missing symbol is its work, and where the Nemeth Code is |
| `design`, `other` | `routed` | One comment. No agent, no quota |
| none | `bug` | The agent. This is how every report was before there were types |

Both `design` and `nemeth` on one issue is `routed`. When in doubt, a person
decides.

A `nemeth` agent reads `test/corpus/sources/Nemeth_2022.pdf` and the errata
before it writes code, and the pull request must cite the section and page. It
keeps every standing rule: `ERROR` stays 0, the utility core set must not
regress, and no test or corpus row is weakened. Read the cited section at
merge time. A contributor can say that the symbol works for them, and cannot say
that the Code agrees.

To change what a label does, change `issue-kind.mjs` and its test. Do not add
logic to a stub.

### When the agent asks, and when it cannot start

**A question.** In mode `fix` the agent may decide a report is too vague to work
from. It writes the questions to `message.md`, writes the result `asked`, and
stops. It opens no branch and no pull request. The pipeline posts the questions
as the one comment, with `<!-- omniya-pipeline-question -->` as its first line
and how to answer after them. It sets the label `needs-info`. It does not set
`needs-maintainer`, because the contributor is the one who is needed.

The contributor answers with `@claude`. `pipeline-followup.yml` sees an issue with
no open fix and the label `needs-info`, takes the label off, posts the short
"I started on this" comment, and calls the agent in mode `fix` again. This time `listed-thread.mjs` hands it the report and the
question and the answer, together. The number of questions already asked is
counted from the marker comments on the issue, not from anything the contributor
wrote. It is told to the agent so it does not ask the same thing twice. There is
no limit on it. The old limit of two turned a third question into a silent
hand-off to the maintainer, and every round needs the contributor to write anyway.

**A run with no words is a failure.** The agent must write one result word and a
`message.md` (except for `approved` and the repair words). If it writes a word
that is not allowed, no `message.md`, an empty one, `revised` with no new commit,
or `opened` with no single pull request, the `result` step in
`pipeline-agent.yml` fails the job. The job summary says which. The `failed`
comment then tells the contributor that something went wrong on the pipeline's
side. The old word `stopped` hid all of these behind "I could not finish this one
by myself", and issue #58 went quiet. The word is gone. `blocked` replaces it and
means only a red gate or a failed `gh pr create`, and it must say which.

The prompt tells the agent to ask only when it must. Most reports are bugs with
enough detail. If you see it asking about things the diagnostics already show,
tighten the "ASK ONLY IF YOU MUST" step in `pipeline-agent.yml`.

**No write access.** `claude-code-action` refuses any actor who cannot write to
the repository. Being on `.github/contributors.yml` is not enough: the person
also has to be a collaborator, and has to accept the invitation. Issue #33 was a
contributor on the list with read access only. The run now checks this first
(`scripts/ci/can-run-agent.mjs`). If it fails for a bug or a Nemeth report, the contributor gets a plain
comment, the issue gets `needs-maintainer`, and the job `noaccess` fails red so
you get the failure email. A Design or Other report needs no agent, so it skips
this check and gets its one comment as usual. Fix: `node scripts/ci/add-contributor.mjs <handle>`
sends the invitation again, then the contributor accepts it, then run
`contributor-fix` by hand for the issue. A hand-started run is checked as YOU, so
it works as soon as you press the button.

### Who can decide what the app does

Only the maintainer. Contributors on the list have write access, so the pipeline
cannot lean on what they are permitted to do. Three locks hold this, in order:

1. **The prompt, and the form.** The form decides first: Design and Other never
   start an agent. For a bug, `pipeline-agent.yml` classifies the report. Something
   new gets `needs-design`, one plain comment, and no code. This is a request to
   the agent, not a lock. A missing symbol of the Nemeth Code is the one thing
   handed to the agent on purpose, because the Code settles it. Locks 2 and 3
   still hold for it.
2. **The workflow.** A comment resumes a fix only when the issue has the label
   `needs-info` AND the agent really asked (a comment by the bot that starts with
   the question marker) AND the issue does not have `needs-design`. A contributor
   can add a label by hand, so the label alone proves nothing. An issue marked
   `needs-design` restarts only when the maintainer says so: either by running
   `contributor-fix` by hand, or by writing `@claude` themselves in a comment.
   The pipeline reads `author_association` on the comment, which GitHub sets, so
   only the repository owner counts. Their comment is then the design decision.
   The pipeline passes that comment's id to the agent (`owner_comment_id`), and
   the thread file heads exactly that comment "THE MAINTAINER'S APPROVAL" with a
   random token made in that run, and the prompt names the token. It is one
   comment and not "the newest one", so a comment a contributor adds while the
   run waits in the queue is not covered by it. The token is what stops a
   contributor from writing the heading in a comment: removing a phrase can be
   dodged with a zero-width or look-alike letter, and a value nobody has seen
   cannot be written in advance. The gate also records when the owner's comment was
   last changed. Anyone with write access can edit another person's comment, so a
   comment edited after the owner wrote it is not marked as the approval. The
   report itself (the issue body) is not covered by that check: the agent is told
   to do what the report and the approved comment ask, and no more. Issue #73 had no way to do this
   before. The maintainer's comment got "could not find exactly one fix".
3. **The merge.** `.github/CODEOWNERS` names the maintainer, and the rulesets
   `testing-guard` and `main-guard` require a review from a code owner. A
   contributor cannot approve, so a contributor cannot merge into `testing`. The
   maintainer is a bypass actor, so their own pull requests still merge. The
   file has to be on the base branch of the pull request to count, so it is on
   `testing` first and reaches `main` with the next merge of `testing`.

If a design change gets past lock 1 by a wrong guess, lock 3 is what catches it.

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

Three things live on `main`. The stubs, the allowlist, and the issue forms. The
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

The labels `nemeth`, `design` and `other` have to exist, because a form cannot
apply a label that does not exist, and GitHub does not warn. Create them by hand
once. The pipeline creates `needs-design`, `needs-maintainer` and
`ready-for-maintainer` itself when it needs them.

### Changing a stub

The follow-up stub changed when the contributor moved from the pull request to
the issue. The same is true of the issue forms and `config.yml`. A change to any
of them has to reach `main`, and `pipeline-on-main` fails the `testing` pull
request until it does.

The order is this. Open the pull request into `testing`. It shows a red
`pipeline-on-main`, which is expected. Open a second pull request into `main`
that carries only the changed stub and the changed issue forms, copied byte for
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

The agent job now holds `issues: read`, not write. If a run dies at its very
start with a permission error from the Claude action, look there first. The
action might need to write on the issue even in agent mode. If it does, restore
`issues: write` on that one job and keep the prompt rule. The unit tests pin the
`read` value, so they will fail until they are changed with it.

A repair agent adds `needs-maintainer` to the pull request with `gh pr edit`,
under `pull-requests: write` alone. That should work, because GitHub scopes a
pull request's labels to that permission. It was not proved offline. The agent no
longer creates the label, because that needs `issues: write`. The label already
exists, and the `report` job recreates it with `--force`.

When a revision ends red after three repairs, the `report` job posts the fixed
"maintainer needs to look" comment and the agent's words are dropped. The
contributor hears that a person will look, and never hears what the agent
changed. That is a known gap, not a fault.

The agent's words travel as a multi-line job output. If a reply arrives with the
agent's part empty, check that the `result` step wrote `message<<` to
`$GITHUB_OUTPUT`, and that `message.md` existed.

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
| `.github/ISSUE_TEMPLATE/bug-report.yml` | `main` | The Bug report form. Label `bug`. Three required fields. |
| `.github/ISSUE_TEMPLATE/nemeth-feature.yml` | `main` | The Nemeth feature form. Label `nemeth`. The symbol, the cells, the reading. |
| `.github/ISSUE_TEMPLATE/design.yml` | `main` | The Design form. Label `design`. A person answers. |
| `.github/ISSUE_TEMPLATE/other.yml` | `main` | The Other form. Label `other`. A person answers. |
| `.github/ISSUE_TEMPLATE/config.yml` | `main` | Turns blank issues off, so every report has a type. |
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
| `scripts/ci/reply.mjs` | `testing` | Posts the one comment an event gets, with the agent's words inside. Labels the issue. |
| `scripts/ci/agent-digest.mjs` | `testing` | Writes what the agent did into the job summary, so a silent stop can be diagnosed. Keeps the agent's own words and tool names. Drops every tool result and command, and scrubs anything shaped like a credential. |
| `scripts/ci/issue-kind.mjs` | `testing` | Reads the form's label and says `bug`, `nemeth` or `routed`. |
| `scripts/ci/verify-branch.mjs` | `testing` | Starts the checks and the build, waits, and keeps the log of what failed. |
| `scripts/ci/hand-off.mjs` | `testing` | Takes the pull request out of draft when the contributor says it works. |
| `scripts/ci/gh.mjs` | `testing` | Runs `gh` without a shell. Shared by the scripts above. |
| `scripts/ci/listed-thread.mjs` | `testing` | Builds the thread the agent reads, from allowlisted people only, and the agent's own earlier questions. |
| `scripts/ci/can-run-agent.mjs` | `testing` | Says whether the actor can write to the repository, which the agent action requires. |
| `scripts/ci/fix-outcome.mjs` | `testing` | Picks which reply the contributor gets when a round ends without a pull request, and posts it through `reply.mjs`. |
| `scripts/ci/add-contributor.mjs` | `testing` | The one command that adds a person. |
| `.github/workflows/pr-checks.yml` | `testing` | The gates: `unit`, `nemeth`, `e2e`, and `pipeline-on-main`. |
| `scripts/ci/pipeline-drift.mjs` | `testing` | Fails a pull request when a stub differs from its copy on `main`, or the allowlist there cannot be read. |
| `scripts/ci/nemeth-gate.mjs` | `testing` | Makes the two Nemeth reports able to fail. |
| `.github/workflows/pr-build.yml` | `testing` | Publishes a per-pull-request build to install. |
| `.github/workflows/screen-reader.yml` | `testing` | Drives VoiceOver (macOS) and NVDA (Windows) against the editor spike and saves what each says. Runs on pull requests that touch the editor. |
| `.github/workflows/testing-app.yml` | `testing` | Fires on every push to `testing` and publishes the alpha build. This is what a merge reaches. |
