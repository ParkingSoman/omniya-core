# Unified composer: one field, status modes, accessible Command chord

## Goal

Make Omniya authoring feel like **one composer field** everywhere. Text vs Equation and Nemeth vs LaTeX are **status / Command toggles**, not different UIs. Subtree edit (`E`) uses that same composer with equation-only modes.

Also fix Command entry so Escape is free for cancel / leaving the field for Tab:

- **`Ctrl+[`** (QWERTY) and **braille Space + full cell** enter Command
- **Escape** cancels / discards (replaces former `q`)
- Remove Command **`q`**

Work lands on the `testing` branch. Do not merge to `main` in this effort.

## Non-goals

- Perkins hardware drivers beyond existing six-key test flag + braille Space+full-cell
- Subtree edit supporting Text/UEB (equation-only while replacing a math focus)
- Remappable shortcuts UI in v1 (document chord; optional remapping later after human testing)
- Changing read-mode napkin navigation (Up/Down, explore Enter) except how **E** opens the composer
- BANA evidence grind / audit table completion

## Problems this replaces

| Symptom (human testing) | Cause |
| --- | --- |
| Escape blocks “get out and Tab” | Escape entered Command instead of canceling / leaving |
| `x` feels like a different app path | Empty Equation hid the composer field and waited for Enter to open a separate replacement dock |
| Can’t toggle Text options once in Nemeth dock | Replacement chrome was a second writer with no Text/`t` path |
| Writing vs editing feel different | Add used composer; math used “Replace focused mathematics” |

Supersedes Command-entry and cancel rules in [`2026-08-14-command-mode-ux-refine-design.md`](2026-08-14-command-mode-ux-refine-design.md) (`Escape`→Command, `q` cancel). Keep from that refine: `x` umbrella (not `e`), `s` focuses quiet `#mode-panel`, Nemeth non-cell gate, no forced live mode announcements.

## Design principles

1. **One composer surface.** Same field, same chrome, same submit/cancel language for add text, add equation, edit text, and subtree math replace.
2. **Modes are status.** `t` / `x` only change `#mode-panel` (+ internal state). They must not swap layouts or open a second dock.
3. **Accessible Command entry.** Prefer Ctrl chords that avoid VoiceOver’s modifier (Ctrl+Option). Letter keys alone must not enter Command from Insert (typing conflict). Braille gets a chord parallel, not a fake Ctrl.
4. **Escape means cancel** while authoring, matching keyboard and braille Escape habits.
5. **On-demand status.** `#mode-panel` stays non-live; Command `s` focuses it (unchanged).

## Architecture

```text
Read mode
  Add item / Edit text / E on math focus
       │
       ▼
Unified composer (#composer-dock + #composer-source)
  Insert  — content keys write to the one field
  Command — Ctrl+[ or braille Space+full-cell
            t / x / i / s / n / ?   (no q)
  Escape  — cancel composer (discard), return to read

Status (#mode-panel, not live)
  Insert|Command · Text · UEB G1|G2
  Insert|Command · Equation · Nemeth|LaTeX · empty|editing
  … · replacing: <scope speech>     when subtree E
```

### Retire replacement dock as a product surface

- Remove or permanently hide `#replacement-dock` chrome (“Replace focused mathematics”, separate textarea, Replace/Cancel pair as a second path).
- Reuse guided Nemeth / LaTeX / replacement-session **domain** logic against `#composer-source` (and the same preview-in-article behavior if already present).
- Visible actions: existing composer **Add item / Save** semantics via Command **`n`** (and primary submit button). Escape cancels (former Cancel / `q`).

## Keybindings (locked)

| Input | Binding | Behavior |
| --- | --- | --- |
| QWERTY | `Ctrl+[` | From Insert → Command (toggle entry). From Command, ignored or no-op (already Command). |
| Braille | Space + full cell (`⠿`) with empty pending buffer | Enter Command (unchanged intent from UEB design). |
| QWERTY / braille Escape | Escape | **Cancel** authoring: discard draft / abort subtree replace; return to read. Works in Insert and Command. |
| Command | `i` / Enter | Insert mode; focus `#composer-source`. |
| Command | `t` | Text umbrella: become Text or toggle **G2 ↔ G1** (only). Refuse when equation content exists or when subtree-replacing (equation-only). |
| Command | `x` | Equation umbrella: become Equation/Nemeth or toggle **Nemeth ↔ LaTeX** while empty. Refuse Text←→Equation when content exists. |
| Command | `s` | Focus `#mode-panel`. |
| Command | `n` | Submit / commit (text item, new equation, or subtree replace). |
| Command | `?` | Contextual help. |
| Removed | `q` | Gone; Escape replaces it. |
| Removed as Command entry | bare Escape | No longer enters Command. |

### Discoverability

- Keyboard help and `#composer-help` document `Ctrl+[`, Escape cancel, and braille Command chord.
- Add a focusable **Command** button in composer chrome (Tab / VO activatable) that calls the same enter-Command path as `Ctrl+[`. Shortcut remains primary for power users; button removes memorization pressure.

### AT notes (research basis for this lock)

- Blind users routinely use Ctrl-chords; clashes matter when using the **screen reader modifier** (VO = Ctrl+Option, NVDA key, etc.). Plain `Ctrl+[` avoids default VO bracket commands (those are VO+[).
- Escape-as-cancel maps well to braille Escape chords on displays.
- Pass-through exists but must not be required for the primary Command entry.

## Unified behaviors

### Add Text

1. Add item → composer, Insert, default Text · UEB G2.
2. Type print (or UEB cells) in `#composer-source`.
3. Command `t` toggles G1/G2 when already Text.
4. `n` commits text item.

### Add Equation

1. Command `x` → status Equation · Nemeth · empty; **field stays**.
2. Insert: Nemeth cells (gated) or LaTeX source in the **same** field.
3. Command `x` while empty toggles Nemeth ↔ LaTeX.
4. `n` commits the new equation (guided Nemeth session completes into MathML as today, without opening a second dock).

### Edit existing text item

Same composer; Text modes via `t`. Equation switch refused if content exists (unchanged rule).

### Subtree replace (`E` from explorer)

1. Same composer opens; status includes replacing scope (speech/label from explorer focus).
2. `itemKind` locked to equation; Command `t` refused with mode-panel message.
3. `x` toggles Nemeth ↔ LaTeX only while empty; Insert authors into `#composer-source`.
4. `n` applies replacement to the focused subtree; Escape aborts without changing the equation.

### What must not happen

- Hiding `#composer-source` when switching to Equation.
- “Enter creates an empty equation and opens the replacement writer” as a separate path.
- A second labeled writer (“Replace focused mathematics”) for routine authoring.

## Status strings

Examples:

- `Insert · Text · UEB G2`
- `Command · Text · UEB G1`
- `Insert · Equation · Nemeth · empty`
- `Insert · Equation · LaTeX · editing`
- `Insert · Equation · Nemeth · replacing: integral`

`#save-status` remains save outcomes only (no live mode spam). `#mode-panel` non-live; `s` focuses it.

## Error handling

- Illegal `t` / `x` switches → mode-panel refusal text (no forced live).
- Nemeth Insert non-cell keys → `aria-invalid` + `aria-describedby` status on the composer field (reuse Nemeth gate helper).
- Cancel (Escape) discards pending UEB buffer / Nemeth draft / latex draft.

## Testing / verification

### Unit

- Command entry: `Ctrl+[` path represented as a domain or renderer helper if extracted; Escape is cancel action not enter-Command.
- `t` / `x` unchanged domain rules; remove `q` cancel from Command key table; document Escape outside Command machine as cancel.

### Electron / e2e

- Add Text: field visible; `Ctrl+[` → Command in mode panel; Escape returns to read without committing.
- Add Equation: `x` keeps `#composer-source` visible; no `#replacement-dock` visible; `x` toggles LaTeX; cells/`n` commit.
- Subtree `E`: same composer; `t` refused; Escape aborts; `n` replaces.
- Command button enters Command.
- Help lists `Ctrl+[`, Escape cancel, no `q` as cancel.

### Manual AT

- VoiceOver: `Ctrl+[` enters Command without VO pass-through; Escape cancels; Tab reaches Command button and chrome.
- Braille: Space+full-cell → Command; Escape chord cancels.

## Implementation sketch

1. Remap keys: Escape→cancel; `Ctrl+[`→Command; delete `q`; update help / HUMAN-TESTING.
2. Add Command button in composer chrome.
3. Route new-equation and subtree replace through `#composer-source` + replacement-session domain; hide/remove `#replacement-dock` UI.
4. Stop Equation `renderComposer` path that removes the textarea / “opens replacement writer” messaging.
5. Status: subtree scope suffix on `#mode-panel`.
6. e2e rewrite for unified path; update docs.

## Decisions log

| Decision | Choice |
| --- | --- |
| Composer model | Single field everywhere |
| Replacement dock UI | Retired as product surface |
| Subtree edit | Same composer; equation-only; status shows scope |
| Text `t` cycle | G2 ↔ G1 only |
| Equation `x` cycle | Nemeth ↔ LaTeX while empty |
| Command entry (QWERTY) | `Ctrl+[` |
| Command entry (braille) | Space + full cell |
| Cancel | Escape (remove `q`) |
| Command discoverability | Chord + focusable Command button |
| Mode speech | On-demand `#mode-panel` + `s` |
| Branch | `testing` |

## Open questions (none blocking v1)

- Shortcut remapping preferences: defer until after human testing.
- Whether article live preview while typing Nemeth in the unified field needs extra polish beyond today’s draft preview behavior.
