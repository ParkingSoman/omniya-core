# Command-mode UX refine: `x` umbrella, Escape parity, Nemeth gate, on-demand status

## Goal

Fix the human-testing pain points in Insert/Command mode on `testing` so that:

1. Equation / method switching mirrors Text / grade switching (`t`-shaped umbrella).
2. Escape enters Command for equation authoring the same way it does for UEB text.
3. Nemeth Insert rejects non-cell QWERTY and explains LaTeX is the place for print letters.
4. Mode / “mission control” state is **available on demand**, not force-announced by the app.

Work lands on the `testing` branch (human gate). Do not merge to `main` in this effort.

## Non-goals

- Redesigning read-mode Edit (`E` on explorer / articles) beyond avoiding Command-key clash.
- Perkins hardware drivers or changing six-key simulation defaults.
- Full WCAG audit / new AT test lab.
- Persisting `uebGrade` or equation method across app launches (still session-scoped unless already persisted elsewhere).
- Removing `#save-status` visually for sighted users.

## Problems observed (current behavior)

| Symptom | Cause |
| --- | --- |
| Command `e` feels like cancel / different input box | `e` switches item type to Equation and re-renders; empty equations open the **replacement dock**, which is a different field. Not a `t`-style in-place toggle. |
| `e` confuses with Edit `E` | Same letter; Edit remains a read/explorer binding. |
| Escape after UEB → Command; Escape in equation → cancel | Replacement dock key handler always `cancelReplacementEditor` on Escape. |
| Latin letters accepted in Nemeth | Replacement Insert has no print-letter gate. |
| Mode string hard to “find” / noisy | `#save-status` is `role="status"` + `aria-live="polite"` and is rewritten on almost every Command key, so the **app** drives speech. |

## Design principles (status / announcements)

Aligned with how strong accessible apps expose mode (e.g. VS Code status bar + Accessibility Help; focusable chrome queried by the user):

1. **Do not force speech as basic mode UX.** Mode changes update visible/AT-readable text; the screen reader speaks when the user navigates to that text or when the user runs an explicit “focus status” command.
2. **On-demand is WCAG-compatible.** WCAG 4.1.3 requires status to be programmatically available when presented without focus; **moving focus to the status on user request** is a valid pattern (focus arrival is what AT speaks). Live regions are not mandatory for mode flips.
3. **Reserve interruption for true failures the user must notice while staying in the field** — and prefer inline `aria-invalid` + error text on the active input over assertive live chatter. Prefer silence + inspectable text by default.

## Architecture

```text
Interaction layer
  Insert  — content keys only
  Command — umbrella keys only (never insert)

Umbrellas (Command)
  t  — Text / UEB family (unchanged shape)
  x  — Equation / math family (replaces e)
  s  — Focus mode panel (on demand)
  ?  — Contextual help dialog
  i / Enter — Insert
  n  — Submit / Replace commit path
  q  — Cancel composer or replacement (discard)

Status surfaces (split)
  #mode-panel   — persistent mode string; NOT live; focusable on demand via Command s
  #save-status  — save / persistence outcome text only; NOT live (inspect or focus if needed)
  field errors  — aria-invalid + associated error text on the active control
```

### Branch

- Implement on `testing` (current human gate checkout / worktree).
- Update [`docs/HUMAN-TESTING.md`](../HUMAN-TESTING.md) key map when this ships.
- Supersedes Command-key tables in [`2026-08-14-ueb-text-command-mode-design.md`](2026-08-14-ueb-text-command-mode-design.md) for `e` → `x` and status behavior; that older spec remains historical for the initial UEB landing.

## 1. Remap Equation umbrella: `e` → `x`

`x` is the Equation / method umbrella, **same shape as `t`**:

| Circumstance | Behavior |
| --- | --- |
| Not yet Equation (chooser, or empty Text) | Become **Equation**, method **Nemeth**. Stay in the same add/edit session; do not discard the session. Opening the replacement writer for a new empty equation remains the existing commit path (`n` / Enter submit of an empty equation item) — **Command `x` alone must not cancel the dock or look like “start over.”** |
| Already Equation, **empty** | Toggle method **Nemeth ↔ LaTeX**. |
| Already Equation, **has content** | Do not change method; update mode panel to current Equation · method · editing. |
| Text with content | Refuse: cannot switch to Equation after text content exists. Write the refusal into the mode panel (and optionally the composer error if still on composer). |

**`e` in Command mode:** unknown command (same as any other unbound letter). Do **not** keep a silent alias to `x` — that would preserve the Edit clash. Contextual help and HUMAN-TESTING docs list only `x`.

**Read / explorer Edit `E`:** unchanged. It is not a Command-mode key.

### Composer vs replacement dock when choosing Equation

- Switching empty Text → Equation via `x` updates command state + chrome (hidden radios / preferred method). It must **not** call `returnToRead()` or clear the add session.
- If the product still uses “empty equation item + replacement dock” as the Nemeth writer, that transition happens on **submit of an empty equation** (`n` / existing Enter submit path), not as a side effect of the first `x` keypress while the user only wanted to pick Equation / toggle method.
- While the **replacement dock** is open, Command `x` toggles Nemeth ↔ LaTeX **only while the draft is empty** (same empty rule), via the existing method setter; with content, refuse / show current method in the mode panel.

## 2. Escape parity: equation uses Command, not cancel

| Context | Escape | Cancel discard |
| --- | --- | --- |
| Text composer, Insert | → Command | `q` |
| Text composer, Command | no-op (stay Command) | `q` |
| Replacement dock, Insert | → Command (keep draft, keep dock open, **focus stays on `#replacement-input`**) | `q` |
| Replacement dock, Command | no-op (stay Command; focus unchanged) | `q` |
| MathJax explorer | leave explorer (unchanged) | n/a |

Replacement dock today binds Escape → `cancelReplacementEditor`. Change that to enter Command (sync `commandState`, update `#mode-panel`). **`q` in Command** (and Cancel button) remains the discard path.

While in Command inside the replacement dock, content keys do not write cells; `i` / Enter return to Insert with focus on `#replacement-input`.

## 3. Nemeth Insert input gate

When replacement method is **Nemeth** and interaction is **Insert**:

**Allowed input**

- Unicode braille cells (U+2800–U+28FF).
- The existing guided Nemeth ASCII cell alphabet already consumed by the replacement `input` pipeline (the same set that makes `#1+2` and current e2e fixtures work). Implement as one shared `isAllowedNemethCellInput(key)` helper used by the keydown gate — do not invent a second alphabet.
- Control keys already handled (Enter, Backspace undo-step, Escape → Command).
- Six-key simulation cells when the test flag is on.

**Rejected input**

- Ordinary Latin letters `a–z` / `A–Z` and any other character for which `isAllowedNemethCellInput` is false.

**On reject**

- Do not insert the character.
- Set `aria-invalid="true"` on `#replacement-input`.
- Put a short message on `#replacement-status` (or a dedicated error tied with `aria-describedby`), e.g.  
  `Nemeth mode accepts braille cells only. Switch to LaTeX with Command x while the draft is empty, or enter cells.`
- Do **not** use an assertive live region for this. The user hears it when focus is on the field (invalid) / describedby, or when they focus the mode/error text.

When method is **LaTeX**, QWERTY print remains allowed as today.

## 4. On-demand mode panel (mission control)

### Split surfaces

| Element | Purpose | Live? | Focus |
| --- | --- | --- | --- |
| `#mode-panel` (new or renamed from mode portion of header meta) | Always shows `formatStatus(commandState)` (Command/Insert · Text/Equation · grade/method · empty/editing) | **No** (`aria-live` absent / off). Prefer a labeled region, e.g. `aria-label="Authoring mode"` or a visible heading + text. | `tabindex="-1"`; focused only by Command `s` (and optionally a documented click). |
| `#save-status` | Persistence outcomes only (“Saving…”, “Saved”, “Not saved”) | **No** forced live. Update text only; user reads it with the screen reader if they navigate to it. Remove `role="status"` / `aria-live` from this element for mode-and-save quietness. | Not used for mode. |
| Composer / replacement errors | Invalid Nemeth key, missing text, etc. | No forced live; associate with the control. | Stay on the control. |

Stop calling `announce(formatStatus(...))` into a polite live region on every `t` / `x` / `i` / Escape. Updating `#mode-panel.textContent` is enough. Do not reintroduce live regions for mode or save as part of this refine.

### Command `s` — focus mode panel

| Key | Behavior |
| --- | --- |
| `s` in Command | Focus `#mode-panel`. Screen reader speaks it because **focus moved** (user requested). Return focus to the previous content control is **not** automatic; user Tabs / `i` as needed. Help text documents this. |

`?` remains the contextual help **dialog** (lists what keys do in the current state). `s` is the lightweight “where am I?” without opening a dialog.

### Naming

Use **`s`** (“status” / “state”). Do not reuse `e`. Document in help and HUMAN-TESTING.

## 5. Global Command keys (revised table)

| Key | Behavior |
| --- | --- |
| `t` | Text / UEB umbrella (unchanged). |
| `x` | Equation / Nemeth↔LaTeX umbrella (new; replaces `e`). |
| `s` | Focus `#mode-panel` (on demand). |
| `?` | Open contextual Keyboard help. |
| `i` / `Enter` | Insert mode. |
| `n` | Submit current item / commit path as today. |
| `q` | Cancel / discard composer or replacement. |

## Error handling

- Illegal type/method switch → update mode panel text with the refusal; do not throw; do not live-announce.
- Illegal Nemeth print key → reject keystroke + field error as above.
- liblouis failures → existing text error path; do not expand live-region use for mode.

## Testing / verification

### Unit

- `applyCommandKey`: `x` transitions mirror former `e` tables; `e` is unknown.
- Escape/Command state helpers if extracted for replacement dock.
- `formatStatus` unchanged in meaning; consumers write to `#mode-panel`.

### Electron / e2e

- Command `x` from empty Text becomes Equation without cancelling add session.
- Empty Equation: `x` cycles Nemeth ↔ LaTeX; mode panel text updates; no polite live required for the assertion (read `textContent`).
- Replacement dock: Escape → Command (dock remains); `q` cancels.
- Nemeth Insert: typing `a` does not appear in the field; error text present; LaTeX method still accepts `a`.
- Command `s` moves `document.activeElement` to `#mode-panel`.
- Update UEB e2e that asserted `e` cycling → use `x`.
- Update help / HUMAN-TESTING key lists.

### Manual (sighted + AT)

- Confirm mode flips do **not** spam VoiceOver when staying in the field.
- Confirm `s` focuses mode panel and VO reads the full status string.
- Confirm Edit `E` in explorer still opens replacement.

## Implementation sketch

1. Domain: rename Command key `e` → `x` in `command-mode.js` + unit tests; add `action: 'focus-status'` for `s`.
2. Renderer HTML: add `#mode-panel` (labeled, not live, `tabindex="-1"`); narrow `#save-status` to save outcomes.
3. Stop routing mode strings through polite live `announce()`; write mode panel only.
4. Replacement dock Escape → enter Command; wire Command keys inside dock (including `x` method toggle when empty, `s`, `q`).
5. Nemeth keydown gate on `#replacement-input`.
6. Fix empty Text→Equation `x` so it does not tear down the session / surprise-open a cancelled-looking UI; align submit path with docs.
7. Update help, HUMAN-TESTING, e2e.

## Decisions log

| Decision | Choice |
| --- | --- |
| Equation umbrella key | `x` (not `e`) |
| Method toggle | Same `x`, only while equation draft empty (like `t` for grade) |
| Escape in replacement | Command (keep draft); `q` cancels |
| Latin in Nemeth | Reject with field error pointing to LaTeX + `x` |
| Mode speech | On demand via focus (`s`); no forced live for mode flips |
| Status key | `s` |
| Save outcomes | Text only; no polite live on `#save-status` |
| Branch | `testing` |

## Open questions (none blocking)

None for v1 of this refine. If AT testers prefer a dialog instead of focus-for-`s`, we can later make `s` open a tiny status-only dialog; focus-first is the default.
