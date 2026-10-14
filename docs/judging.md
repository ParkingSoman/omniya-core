# Judging how the app feels

Tests say whether the app works. They do not say whether it **feels** like a
note-taking app or like Word. For that, ask people (or agents) who know nothing
about this app to look at it and say what they see.

## Why blind

A reviewer who has read the code or the docs will explain away every odd
thing: "that button is for braille", "you press `r` to replace". A real person
opening the app cannot. So the judges get **only what a stranger would get**:
screenshots and the page's accessibility tree. They are told nothing about how
the app is meant to be used, and they may not read anything else.

## How to run a round

```bash
npm run judge:capture -- /tmp/judge/r1
```

This launches the app on a few realistic notes and saves, for each state:

| File | What it holds |
|---|---|
| `01-note-open.png` ... `09-narrow.png` | Screenshots: a note, an empty note, the equation panel, after insert, an equation selected, the shortcuts dialog, dark mode, a narrow window |
| `*.a11y.txt` | The accessibility tree as text: roles, names, structure, in reading order |
| `02-tab-order.txt` | What a keyboard user reaches by pressing Tab, in order |

Then start **fresh** judges (new agents each round, so they cannot remember the
last one), each pointed only at that folder. Three roles work well:

| Judge | Sees | Question |
|---|---|---|
| Visual | Screenshots | Does this feel like a regular note-taking app (Apple Notes, Bear, Notion, Word)? |
| Screen reader | Accessibility text and tab order. No images. | Does this sound and behave like a regular, simple note-taking app? |
| Word parity | Screenshots and text | How close is this to Microsoft Word in the things a Word user relies on daily? |

Each judge scores 1 to 5 on a few named questions, lists what confuses them,
and ranks the five changes they would make. Ask for under 450 words, plain
writing, no flattery. Tell each judge that reading any other file voids the review.

## What to do with the answers

- Fix what is **really** wrong. Check the claim against the capture first: one
  judge blamed the app for a shortcut name that came from the capture script.
- Separate **interface changes** (do them) from **missing capabilities** such
  as bold, find or export (these are the owner's decision, not a polish item).
- Recapture and judge again with new judges. Stop when scores stop moving.

## Rounds so far

Scores out of 5. The first column is the question, the others are rounds.

| Question | Round 1 | Round 2 | Round 3 |
|---|---|---|---|
| Visual: feels like a note-taker | 4 | 4 | 4 |
| Visual: calm and uncluttered | 3 | 4 | 4 |
| Visual: actions discoverable without help | 2 | 3 | 3 |
| Visual: equation natural in the writing | 4 | 3 | 4 |
| Visual: polish | 3.5 | 4 | 4 |
| Screen reader: reading order and landmarks | 4 | 4 | 4 |
| Screen reader: control names | 3 | 4 | 4 |
| Screen reader: found by Tab alone | 3 | 3 | 3 |
| Screen reader: no noise or repeats | 2 | 3 | 3 |
| Screen reader: equation inside a sentence | 3 | 4 | 4 |
| Word parity: basics | 2 | 2 | 2 |
| Word parity: common actions found | 2 | 3 | 2 |
| Word parity: equation workflow | 3 | 3 | 3 |

Round 1 was the first redesign. It already replaced the dark rail, the red bar
and the floating help button. The later rounds fixed: a crowded toolbar (rename
and delete moved beside the title, the braille grade moved to the status bar),
a note title spoken three times, a wall of prose in the shortcuts dialog, a
hint that never showed in an empty note, and a centring rule that caught
sentences. Round 3 judges named a set of capabilities, not polish: bold, italic, headings
and lists; find and replace; export and print; an equation preview or symbol
picker; searching the list of notes. The owner chose three of them: **find in the
note, export and print, and an equation preview**. They are built. Still not
built, and still the owner's call: bold and italic (UEB marks emphasis with
typeform indicators, so a braille decision comes first), headings and lists,
replace, a symbol picker, and searching the list of notes. The Word-parity scores
should move once a new round judges the screens with find, export and preview.

## What this cannot tell you

A judge reads pictures and text. It cannot say how the app **sounds** through a
real screen reader, or whether a blind person finds the flow good. CI runs
NVDA and VoiceOver (see `docs/word-editor.md`), and the human checklist in
`docs/HUMAN-TESTING.md` stays the gate.
