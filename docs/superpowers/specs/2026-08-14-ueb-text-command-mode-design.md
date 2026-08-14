# UEB text blocks, notes UI hide, and command-mode UX

## Goal

Make a braille-native napkin workflow where:

- **Text** items are literary **UEB** (print storage; braille via liblouis).
- **Equation** items stay **Nemeth** (existing guided cell authoring; LaTeX remains an alternate method).
- Item type chooses the code; blocks stick to that code once they have content.
- Chrome does not grow more radios. A small **Insert / Command** modal layer (vim-like) drives type, method, and grade with context-sensitive umbrella keys.
- **Notes** remain in the domain model but are hidden from Electron UI behind a feature flag.
- Work happens on an isolated branch off `codex/persistent-math-tree-nemeth` and is **not** merged to `main` in this effort.

## Non-goals

- Deleting `item.note` / `normalizeNote` / storage fields.
- Replacing Nemeth with UEB Technical/Math.
- Full Perkins hardware drivers (six-key simulation + `aria-braillelabel` remain the path).
- Touching other active worktrees’ WIP.
- Merging this branch to `main`.

## Terminology

| Term | Meaning here |
|------|----------------|
| UEB | Unified English Braille — literary English default for Text items. Grade 2 is default; Grade 1 spans use UEB’s own indicators. |
| Nemeth | BANA Nemeth Code — mathematics for Equation items (existing stack). |
| Insert mode | Keys/cells write content only. |
| Command mode | Keys run app actions; they never insert content. |
| Item type | `text` vs `equation` — chooses the braille code family. |

US STEM practice is UEB prose + Nemeth math with code switches, not “UEB instead of Nemeth for everything.” This design mirrors that via item type.

## Architecture

```text
Napkin items
  ├─ text      → print Unicode storage
  │              braille IO via Electron main liblouis (en-ueb-g1 / g2)
  │              G1 ↔ G2: whole-item table if empty-started G1;
  │              mid-block via UEB grade-1 passage indicators
  └─ equation  → canonical MathML + guided Nemeth (unchanged core)
                 LaTeX method selectable only while empty

App interaction (orthogonal to braille code)
  ├─ read / add / edit     (existing)
  └─ insert / command      (new)

NOTES_UI_ENABLED = false → hide note surfaces; keep model
```

### Branch / worktree

- Base: `codex/persistent-math-tree-nemeth`
- Feature branch: `codex/ueb-text-command-mode`
- Worktree: `.worktrees/ueb-text-command-mode`
- Do not merge to `main` until explicitly requested later.

## Notes UI (feature flag)

- Add a single renderer constant: `NOTES_UI_ENABLED = false`.
- When false:
  - Hide `#note-toggle`, `#note-row`, `.item-note` (and equivalent transcript note rendering).
  - Skip note focus / handlers so Tab order and help text do not mention notes.
- Keep `item.note` in `model.js`, normalize, add/update APIs, and persisted JSON.
- Re-enabling notes later is flipping the flag and restoring surfaces — no archaeology.

## Command-mode UX

### Modes

- **Insert** (default while composing/editing content): print keys and braille cells write content for the active item code.
- **Command**: entered with `Escape` (QWERTY) or braille **Space + full cell** (dots 1–6). Status announces “Command mode.” Letters are commands only. `i` or `Enter` returns to Insert (“Insert mode”).
- Read navigation (Up/Down, equation explorer) unchanged when not composing.

### Status

A polite live region always summarizes, e.g.:

- `Command · Text · UEB G2`
- `Insert · Equation · Nemeth · empty`
- `Insert · Text · UEB G1`

Keyboard help (`?` in Command) lists what each key would do **in the current state**.

### Global Command keys

| Key | Behavior |
|-----|----------|
| `?` | Open Keyboard help (existing dialog, expanded; contextual “next action” lines). |
| `q` | Cancel composer / return to read. |
| `n` | Commit current item if valid; otherwise announce what’s missing. |
| `i` / `Enter` | Return to Insert mode. |

### Umbrella `t` — Text / UEB family

| Circumstance | Behavior |
|--------------|----------|
| Not yet Text (new chooser, or empty Equation) | Become **Text / UEB**, default grade **G2**. |
| Already Text (empty **or** filled) | **Toggle grade** G2 ↔ G1. Same action either way so a block can start in G1 before typing, or flip mid-block. |
| Equation with content | Refuse and announce: cannot switch to Text after equation content exists. |

Grade mixing inside one Text block uses UEB Grade 1 indicators (`⠰` / `⠰⠰` / `⠰⠰⠰` … `⠰⠄`). The `t` toggle is the QWERTY convenience for passage-level G1 on/off; braille users may also type indicators as cells.

### Umbrella `e` — Equation / math family

| Circumstance | Behavior |
|--------------|----------|
| New empty item / not yet Equation | Become **Equation**, method **Nemeth**. |
| Equation, empty, Nemeth | Cycle method → **LaTeX**. |
| Equation, empty, LaTeX | Cycle method → **Nemeth**. |
| Equation with content | Do not change method; announce current Equation · method · editing. Further structure comes from Insert (cells / LaTeX), as today. |
| Text with content | Refuse: cannot switch to Equation after text content exists. |
| Text empty | Switch empty item to Equation / Nemeth. |

### Chrome cleanup

- Remove or visually hide persistent Text/Equation and Nemeth/LaTeX radio fieldsets.
- Rely on status + Command umbrellas + help.
- Do not add Grade 1/2 radios.

## Text / UEB data flow

### Storage

Text items remain **print Unicode** strings (same persisted shape as today).

### Native liblouis (main process)

- Electron **main** owns a small `ueb-service` using **native** liblouis (Homebrew/`lou_translate` verified at 3.38.x during design research; ship or locate dylib/CLI for app packaging — prefer native over stale npm WASM).
- Renderer calls forward/back translate over IPC.
- Tables: `unicode.dis,en-ueb-g1.ctb` and `unicode.dis,en-ueb-g2.ctb`.

**Research note:** Official npm `liblouis` wrapper last published 2018; WASM G2 *back*-translate aborted in smoke tests. Native CLI round-trips G1/G2 successfully. Mid-word single-cell back-translate can greedily expand contractions (`⠞` → “that”); therefore cell authoring **buffers to word boundary** (space / explicit commit) before `backTranslate`.

### Input paths (both in scope)

1. **QWERTY Insert:** type print → store print → forward-translate for `aria-braillelabel` / display projection.
2. **Cell Insert:** accumulate Unicode braille cells → on space/word commit → `backTranslate` (G2 table honors in-stream G1 indicators) → append print → clear buffer. Status may show pending cells mid-word.

### Grade mode

Composer holds `uebGrade: 'g2' | 'g1'` for the current Text item. Toggled by `t` whenever the item is already Text. Stored text stays print.

Explicit policy (no ambiguity):

- **Empty Text, user toggles to G1 before typing:** treat the whole item’s braille projection with `en-ueb-g1.ctb` until toggled back to G2 (`en-ueb-g2.ctb`). Optional: persist `uebGrade` on the item when committed so re-open matches.
- **Text that already has content, user toggles G1:** do **not** re-contract/re-expand the existing print with a different table. Instead enter a **pending Grade 1 passage** for *subsequent* input (emit/honor UEB grade-1 passage indicators for the following stretch; `t` again ends the passage and returns to G2). Status distinguishes `UEB G1 (whole item)` vs `UEB G2 · G1 passage on`.
- Cell back-translate always uses the G2 table when the stream may contain grade-1 indicators (liblouis honors them); when the whole item is G1-only and empty-started, cell back-translate may use the G1 table.

## Equation path

Unchanged guided Nemeth + LaTeX method gate (method change only before content). Radios hidden; `e` drives method while empty. Replacement session, explorer, and Nemeth projection stay.

## Error handling

- liblouis IPC failure → polite status error; do not corrupt item text.
- Illegal type/method switch → announce refusal (no thrown UI error).
- Cancel with partial cell buffer → discard buffer and announce.

## Testing / verification

### Unit

- Command state machine transitions for `t` / `e` / globals.
- Notes flag hides note DOM / skips handlers.
- liblouis IPC forward/back round-trips for sample G1/G2 strings; word-boundary cell buffer behavior.

### Electron (manual / e2e)

- Notes UI absent with flag false; `item.note` still loadable from fixture JSON if present.
- Add Text via Command `t`; QWERTY and cell input; toggle G1 with `t`; confirm braille label.
- Add Equation via `e`; cycle LaTeX while empty; author Nemeth; confirm method lock after content.
- Status announcements for Insert/Command and umbrella outcomes.
- Help dialog contextual lines match current state.

## Implementation sketch (for the plan)

1. Worktree already created; keep commits on `codex/ueb-text-command-mode` only.
2. Feature-flag notes UI off.
3. Add main-process UEB service + IPC + renderer client.
4. Text authoring: braille label projection + cell word buffer.
5. Command/Insert state machine; hide radios; expand help.
6. Wire `t` / `e` behaviors per tables above.
7. Unit tests + Electron verification; push branch; do not merge to `main`.

## Decisions log

| Decision | Choice |
|----------|--------|
| Code switching model | Item-type driven (Text=UEB, Equation=Nemeth) |
| Text input | Both QWERTY and braille cells |
| Grade | Full G1/G2 via liblouis; mix inside block via UEB indicators; `t` toggles grade whenever already Text |
| UI for modes | Modal Insert/Command; umbrella `t`/`e` (not radio sprawl) |
| Notes | Feature-flag hide UI; keep model |
| Base branch | `codex/persistent-math-tree-nemeth` |
| Merge to main | Not in this effort |
