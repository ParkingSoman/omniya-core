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

**Workaround used in demo:** Search until speech role is explicitly `underscript` / `overscript` (reject radicand/radical foci), then confirm `#replacement-scope` before typing.

**Likely fix:** Stable focus restore + documented bound navigation; optionally announce script role more consistently; consider bound-specific commands later.

---

## F8 — E without navigating to the integrand replaces the integral (Major — usage footgun; engine OK)

### Verdict

**Not a splice/editing-engine bug** when the target really is the integrand leaf.  
**Yes, a usage / focus-bridge footgun** when E is pressed while Explorer still owns the *whole* expression (or the integral `msubsup`, or a range covering both).

### Evidence (domain, 2026-08-14)

Starting document: `\int_a^b x` as sibling `msubsup` + `mi`.

| Replacement target | After submitting radical \(\sqrt{1-x^2}\) | Integral kept? |
|--------------------|--------------------------------------------|----------------|
| Leaf `mi` (`x`) | `\int_a^b \sqrt{1-x^2}` | **Yes** |
| `msubsup` (integral structure) | `\sqrt{...}` left, orphan `x` | **No** |
| Math root | Only `\sqrt{...}` | **No** |
| Range covering integral + `x` | Only `\sqrt{...}` | **No** |

So `replaceMathTarget` / `submitReplacement` preserve the integral **if and only if** the session target is the integrand node.

### Evidence (Electron focus)

After authoring `\int_a^b x` and pressing Enter (no further arrows), speech/Braille are still the **whole** utterance:

- speech: `the integral from a to b of x, math, ...`
- braille: `⠮⠰⠁⠘⠃⠐⠭`
- `#replacement-scope` after **E**: `Selected: the integral from a to b of x...` with a single `data-target-id`

That is the wipe path (root / whole-expression target), not the leaf-`x` path. It feels like “the app deleted my integral,” but the editor replaced exactly the scope Explorer had selected.

### Why it hurts

Exact replacement is the product model. Authors (and demos) naturally think “I’m editing the integrand” while focus is still the full integral phrase. One **E** then destroys bounds + operator.

### Related code that amplifies the footgun

- `openReplacementEditor` falls back to the **canonical equation root** when explorer capture fails (`src/renderer/app.js`) — another whole-equation replace that looks like data loss.
- Bridge comments already note historical “silently fell back to the equation root” risk (`math-explorer-bridge.js`).

### Demo handling

Refuse to press E unless focus is bare integrand (`⠭`, scope must not say integral); after submit assert `msubsup` still present with `msqrt`.

### Likely product fixes

1. Stronger scope copy: “Replacing whole equation” vs “Replacing integrand x”.  
2. Block or warn when replacing a node that would drop sibling structure the user just authored (optional).  
3. First-class integrand navigation / hole so leaf focus is the default after writing `\int_a^b …`.  
4. Never silently widen a failed descendant capture to root without saying so in the dock.

---

## F9 — Reaching the integrand leaf from whole-expression focus is non-obvious (Major)

**Observed:** After submitting `\int_a^b x`, Explorer speech is often the full phrase `the integral from a to b of x` with Braille `⠮⠰⠁⠘⠃⠐⠭`. Repeated **ArrowDown alone never leaves that whole-expression focus**, so a careful “don’t E on the integral” policy still cannot find the leaf `x` without mixing Right/Down (and guessing).

**Why it hurts:** Exact replacement requires leaf focus. If the walk to the integrand is obscure, authors either E on the whole integral (F8) or abandon structural edit.

**Demo handling:** Mixed arrow choreography until Braille is exactly `⠭` (reject any braille that still contains `⠮`).

**Likely fix:** Clearer tree walk (e.g. Down enters children left-to-right including siblings after `msubsup`); announce “integrand” as a first-class role; or Tab between top-level siblings.
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
