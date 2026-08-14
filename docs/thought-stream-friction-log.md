# Thought-stream demo: application friction log

Date: 2026-08-14  
Branch: `codex/paper-writing-workflow`  
Context: Building a headed, braille-first demo that works \(\int_0^1\sqrt{1-x^2}\,dx\) the way a blind author would have to use Omniya today.

This file records **product/engine friction discovered while using the app as the only workspace**, not unit-test gaps. Findings should drive follow-up fixes; the demo works around them where noted.

## Severity key

- **Blocker:** cannot complete a natural authoring step without a workaround
- **Major:** possible, but unintuitive or easy to get wrong
- **Minor:** polish / clarity

---

## F1 — Problem statements as Text cannot render mathematics (Major)

**Observed:** A text napkin item with `evaluate ∫_0^1 of 2x dx` shows raw Unicode/ASCII, not MathJax. The equation item below renders properly.

**Why it hurts:** Blind and sighted users both need the *problem* to be readable mathematics. Putting the prompt in text trains a bad habit and makes the napkin look broken.

**Workaround used in demo:** Author the problem itself as equation item 1 (Nemeth), not as text.

**Likely fix:** Either allow inline math in text items, or guide “state the problem” into an equation item (and maybe a short plain-language note field that is clearly non-math).

---

## F2 — Fraction after definite integral replaces the integral (Blocker for one-draft authoring)

**Observed (domain probe):** Sequence roughly `⠮ ⠰ ⠁ ⠘ ⠃ ⠐` builds `\int_a^b`. Then `⠹` (simple fraction start), even after an explicit `script.baseline` choice, **replaces** the `msubsup` integral with an empty `mfrac`. Final submit contains only the fraction — the integral and bounds are gone.

**Contrast:** After baseline, inserting letter `⠭` correctly appends a sibling: `\int_a^b x`.

**Why it hurts:** A natural Nemeth reading of “integral from a to b of [fraction]” cannot be typed in one replacement draft today. The fraction opener treats the focused integral structure as the replacement target.

**Workaround used in demo:** Author `\int_a^b x` first, submit, Explorer to the placeholder `x`, **E**-replace with \(\sqrt{1-x^2}\) (or a fraction). That is a valid blind workflow, but it is not the linear draft a teacher might expect.

**Likely fix:** After baseline return from an integral/script, structure openers (`⠹`, `⠜`, grouping) should **insert after** the integral (or into an integrand slot), not `replaceMathTarget` the integral node.

---

## F3 — Upper-bound Explorer targeting is easy to miss (Major)

**Observed:** After specializing the lower bound to `0`, a generic “ArrowRight until label matches overscript” walk stayed on speech `"0, math..."` / Braille `⠼⠴` and never reached `b`. Later, a fixed `Down → Right → Right` path landed on `"Radicand 0"` once the integrand was a radical — arrow counts that worked for bare `\int_a^b x` fail after the tree gains nested content.

**Why it hurts:** Exact subtree replace is the product’s editing model. If upper/lower bound focus is unreliable, bound specialization fails silently from the user’s point of view (they edit the wrong slot or give up).

**Workaround used in demo:** Specialize bounds **before** nesting a radical integrand (while the tree is still `\int_a^b x`), using the e2e path `Enter → ArrowDown → ArrowRight` (lower) / one more Right (upper). Document that post-nesting bound edits are much harder.

**Likely fix:** Stable focus restore + documented bound navigation; optionally announce script role more consistently; consider bound-specific commands later.

---

## F8 — Pressing E at root focus replaces the whole equation (by design; demo usage mistake)

### Verdict

**Not an editing-engine bug.** Exact replacement replaces whatever Explorer currently owns.  
**Not a “root start” UX bug either:** Enter is supposed to land on the **root equation**; authors then navigate downward to the edit site and only then press E.

Wiping \(\int_a^b\) when submitting a radical is what happens if **E is pressed while focus is still the root** (speech like “the integral from a to b of x”). That was a **demo/agent usage error**, not the app starting in the wrong place.

### Evidence (domain)

| Replacement target | Radical submit keeps \(\int_a^b\)? |
|--------------------|-----------------------------------|
| Leaf integrand `x` | **Yes** |
| Math root / whole-expression range / integral `msubsup` | **No** |

### Correct workflow

1. Enter → Explorer on **root**  
2. Arrow to the integrand leaf (Braille `⠭`, not `⠮⠰…⠭`)  
3. E → replace only that leaf  

### Remaining real friction (narrower)

- Reaching the integrand sibling under a definite integral can take non-obvious arrow sequences (see F9).  
- Scope chrome could still say more plainly “whole equation” vs “integrand x” so mistakes are obvious sooner.  
- Capture-failure fallback to root should stay rare and announced.

### Demo handling

Refuse E until focus is bare integrand; assert `msubsup` survives after replace.

---

## F9 — Arrow recipes depend on tree shape (Major learning cost)

**Observed:** For bare `\int_a^b`, existing e2e uses `Down → Right` for underscript. For `\int_a^b x` (integrand sibling), that same recipe lands on the integrand or the integral *group*, not the bound:

| Goal | Path that works for `\int_a^b x` |
|------|----------------------------------|
| Root (after Enter) | — |
| Integrand `x` | Down, Right, Right |
| Lower `a` | Down, Down, Right, Up |
| Upper `b` | Down, Down, Right, Right |

**Why it matters:** This is not “broken navigation”; authors must learn the tree. Demos/tests that copy recipes from a different shape will “fail” and look like product bugs. Auditing usage means re-mapping paths when the expression changes.

**Demo handling:** Hard-code the measured paths above; specialize bounds before nesting a radical when possible.

## F4 — `OMNIYA_HEADLESS=0` was ignored whenever test userData was set (Blocker for demos) — fixed on this branch

**Observed:** `src/main.js` treated any `OMNIYA_TEST_USER_DATA_DIR` as headless (`show: false`), so headed demos stayed invisible even with `OMNIYA_HEADLESS=0`.

**Fix shipped:** `OMNIYA_HEADLESS=0` now forces a visible window; default e2e still hides via `OMNIYA_HEADLESS=1`.

---

## F5 — Draft Backspace was missing (Major) — fixed on this branch

**Observed:** Incomplete atomic prefixes could be corrected only by not committing; accepted cells had no step undo short of Escape (discard all) or post-submit Cmd+Z.

**Fix shipped:** `undoNemethStep` + Backspace in the Nemeth replacement dock.

**Remaining gap:** Post-submit undo is still whole-replacement and RAM-only across relaunch.

---

## F6 — Ambiguous cells surface clickable choices mid-flow (Major for pure keyboard/braille)

**Observed:** Digits after script indicators can open a choice panel (`script.subscript` vs `indicator.english-letter`, etc.). The demo can click buttons; a display user may need a braille/keyboard choice path that is equally obvious.

**Demo handling:** Auto-click preferred `data-operation-id` when the panel appears.

**Likely fix:** Ensure choice UI is fully operable from keyboard/braille without assuming pointer, and announce choices clearly.

---

## F7 — Slow visible typing vs engine immediacy (Minor / demo concern)

**Observed:** Immediate codes update the draft MathML as soon as a cell is accepted. For a *watchable* demo we must insert long pauses; the app itself has no “demo tempo.”

**Not a bug** — but without pauses, observers cannot see braille cells land.

---

## F10 — Pending bounded prefixes were cleared from the input (Minor for braille review) — fixed on this branch

**Observed:** After each cell the replacement textarea cleared, even while NemethState still held an incomplete atomic sequence (e.g. arrow `⠫⠒⠒⠕`). Immediate commits correctly clear; bounded codes should stay feelable on a braille display until Enter commits them.

**Fix shipped:** Mirror `nemethState.prefix` while status is pending/choice; feed only the new suffix on the next input so engine behavior stays cell-by-cell.

---

## Implications for the demo design

| Desired story | What the app actually allows |
|---------------|------------------------------|
| Type the full hard integral in one draft | Often not, if integrand is a fraction/radical opened while integral is focused (F2) |
| Write problem in text, work in equations | Text problem is poorly rendered (F1) |
| E-replace integrand without careful focus | Easy to wipe the integral if E is pressed on the operator (F8) |
| Casually arrow to upper bound and E | Nested integrand changes Explorer paths; need role-confirmed focus (F3) |
| Watch headed automation | Requires `OMNIYA_HEADLESS=0` (now honored, F4) |

The demo therefore:

1. Authors the problem as **equation** math  
2. Uses **placeholder integrand → E-replace** for \(\sqrt{1-x^2}\)  
3. Uses **explicit bound navigation**  
4. Types **slowly** with Unicode Braille cells and asserts `aria-braillelabel` during reads  
5. Records \(\pi/4\) as a follow-on equation  

---

## Open questions for product

1. Should integrals own an explicit integrand hole so `⠹`/`⠜` fill that slot instead of replacing the operator?  
2. Should “new problem” create an equation item by default?  
3. Should Explorer expose a bound-index API for assistive commands (lower/upper)?  
