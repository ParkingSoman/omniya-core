---
name: pipeline-change
description: Use for any change to the GitHub automation. That means anything in `.github/**`, `scripts/ci/**`, `docs/contributor-pipeline.md`, or the agent's prompt in `.github/prompts/agent.md`. Also use it when the owner talks about the automation in plain words, or asks to ship a pipeline change.
---

# Changing the pipeline

The owner talks in plain words. The owner never opens GitHub. You plan,
build, rehearse for real, then wait for "ship it".

## Rules

- The agent never posts on an issue. Only `scripts/ci/reply.mjs` posts.
- One new comment per event. Every comment says something new.
- Design decisions stay with the owner. Do not weaken the `needs-design` gate.
  Do not weaken the rules in the agent's prompt.
- Do not edit `track_progress` in `pipeline-agent.yml`.
- No Claude attribution, no "Generated with", no session links in commits or PRs.
- Run `gh auth status` first. Say which account `gh` uses. It must be the owner's.
- Never use `--admin`. Never bypass a ruleset.
- Some steps need the owner's hands. Examples: making a GitHub App, or changing
  a repository setting only the owner can. Say exactly what to click. Then wait.
- Keep long text out of `${{ }}`. GitHub rejects an expression over 21,000 characters.

## The routine

1. **Plan once.** Run `gh issue list --label pipeline-idea`. Read the owner's
   request. Make ONE plan that covers both. The owner's approval of that plan is
   the approval. Do not ask a second time.
2. **Check for other work.** Run `gh pr list --search 'head:pipeline/'`. Also
   look for open PRs that touch `.github/**` or `scripts/ci/**`. If one is open,
   finish it or rebase onto it first. Or stop and tell the owner.
3. **Make a worktree** from the newest `origin/testing`. Name the branch
   `pipeline/<short-name>`.
4. **Make the change.** Run `npm test` and `actionlint`. Keep the unit suite
   green as you go.
5. **Rehearse for real.** Push the branch. Then start the workflow by hand.
   - Fix: `gh workflow run pipeline-fix.yml --ref <branch> -f issue_number=<rehearsal issue>`
   - Follow-up: first post the comment on the rehearsal issue yourself with
     `gh issue comment`. The agent reads the thread from GitHub. Then run
     `gh workflow run pipeline-followup.yml --ref <branch> -f issue_number=<N> -f comment_body='@claude ...'`
     with the same words.
   - Watch with `gh run watch`. Read failures with `gh run view --log-failed`.
   - Change, push and run again. Stop when the run does what the plan says.
   - The rehearsal issue is the pinned issue with the label `rehearsal`. The owner
     owns it. If none exists, make it once with `gh issue create --label rehearsal`.
     Use a bug-style title and body, because the bug form sets the usual labels.
   - A hand-started follow-up run works only on an issue with the label `rehearsal`
     that the owner or `omniya-bot` opened. It never reaches the hand-off, so a
     rehearsal cannot turn on a merge. To test the hand-off, rely on the unit tests.
   - After a rehearsal, close any draft PR it opened: `gh pr close --delete-branch`.
6. **Update the words.** Edit `docs/contributor-pipeline.md`. Edit repo
   `CLAUDE.md` if the change touches what it says. Update the owner's memory
   files in the same change.
7. **Report in the chat, in plain words.** Say what changed. Say what the
   rehearsal showed. Say what could go wrong. Then wait for "ship it". Never
   merge before that.
8. **After "ship it".** Open the PR. Merge it (squash) with the owner's own
   account. Watch EVERY run the merge starts, with `gh run list` and
   `gh run watch`. Wait until all are green. A red run after the merge is your
   job to fix. It is not the owner's.
9. **Clean up.** Delete your branches. Remove your worktree. Close any rehearsal
   PRs. Close the `pipeline-idea` issues you shipped. Comment once on each, with
   the PR link. Touch only what you made.

## Idea inbox

In ANY session, the owner may say an idea about the automation. Then do only
this. File one issue:

```
gh issue create --label pipeline-idea --title "..." --body "..."
```

Say the issue number. Do nothing else. Do not start the change. The idea waits
until the owner asks for pipeline work.
