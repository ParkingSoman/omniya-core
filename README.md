# Omniya Core

A research prototype exploring screen-reader-first mathematical workspaces.

Omniya Core is an experimental, local-first workspace for blind mathematicians, blind STEM students, screen-reader users, and accessibility researchers to create, revisit, organize, and navigate mathematical thought.

The repository contains a deliberately small Electron prototype for local mathematical documents, casually called “math napkins” in the UI. The client is ground-up scratchwork that makes design hypotheses concrete and testable; it is meant to generate conversation, not prescribe a product architecture. It is not a finished mathematical editor, and the automated test suite is not evidence that the workflow is usable without feedback from blind users.

## At a glance

- **Status:** Early research prototype
- **Platform:** Electron, vanilla HTML/CSS/JavaScript
- **Storage:** Local JSON files
- **Math:** LaTeX converted to native MathML and rendered with local MathJax
- **Network:** No network access required
- **Primary purpose:** Generate conversation about screen-reader-first mathematical workflows
- **Best contributions now:** Community discussion, critique, and alternative models

## Contents

- [Why this exists](#why-this-exists)
- [The document model](#the-document-model)
- [Current capabilities](#current-prototype-capabilities)
- [Status and boundaries](#current-project-phase-and-boundaries)
- [Where help is most useful now](#where-help-is-most-useful-now)
- [Project direction](#project-direction)
- [How to contribute](#how-to-contribute)
- [Run and test](#run-from-source)
- [Project status and license](#project-status-stewardship-and-license)

## Why this exists

Most mathematical software is designed visually first and made accessible afterward. That order can leave the underlying document model, navigation, focus behavior, and interaction language mismatched with how a blind person actually reads and constructs mathematics.

Omniya Core is exploring the opposite order. The project is trying to understand what a mathematical workspace should be when semantic structure, speech, Braille, keyboard navigation, and user control are primary design inputs rather than accessibility layers added at the end.

The current prototype is intentionally modest so that these questions remain visible:

- How should a screen-reader-first workspace represent a sequence of mathematical thoughts?
- How should a user move between prose, equations, annotations, and earlier ideas?
- What should reading, editing, exploration, and recovery feel like when visual layout is not primary?
- How should native MathML, speech, Braille, keyboard interaction, and local privacy work together?

These are research questions, not settled product requirements.

## Who this project is for

Omniya Core is being built for and with:

- blind mathematicians and blind STEM students;
- screen-reader users who work with mathematical notation;
- accessibility engineers and assistive-technology specialists;
- MathML, LaTeX, speech, and Braille specialists;
- interaction and UX researchers;
- educators, Electron/JavaScript developers, and technical writers.

You do not need to be a programmer to contribute. The most valuable contribution may be a careful description of a confusing interaction, a screen-reader observation, a better evaluation question, or evidence that a seemingly obvious design decision does not work.

## The current document model

The prototype stores named local documents. Each document contains a linear sequence of committed items; each item is plain text or a LaTeX equation and can have a freeform note. The interface calls these documents “napkins,” but the name is only a friendly label. Users can create and switch between documents, read earlier items, explore equations semantically, edit previous items, and save the work locally.

## Why the approach is different

This project is not trying to retrofit a conventional visual editor with labels and keyboard shortcuts. The prototype is intentionally scratchwork: a small research instrument for asking better design questions before committing to a larger architecture.

The intended process is to:

- begin with the lived experience of blind mathematicians and screen-reader users, rather than treating accessibility as a later compliance pass;
- keep the document model, interaction rules, and visual layer small and reversible while assumptions are being tested;
- use concrete workflows—reading a sequence, entering an equation, revisiting an earlier idea, recovering from an error—to expose where a design helps or fails;
- preserve semantic structure so research can examine MathML, speech, Braille, focus, and keyboard behavior directly;
- prefer local, offline experiments that are easy to run, inspect, and change;
- treat every current interaction as a hypothesis, not as the final product language.

The point of the Electron app is to make these hypotheses testable. The architecture is provisional and may be replaced when research with blind users exposes a better model. Major decisions should be discussed, tested, and revised with the people who rely on the resulting experience—not inferred by sighted developers from visual convenience alone.

## Current prototype capabilities

The current Electron app can create, switch between, and delete named napkins; add text, equations, and notes; navigate and edit earlier items; explore semantic MathML; regenerate equations; save and recover local JSON state; and open existing napkin files. Equation conversion happens in the main process and rendering uses a bundled MathJax 4 runtime with semantic, speech, Braille, and expression-explorer support. The automated Electron workflow runs offline.

The interface uses semantic HTML, native form controls, labeled fields, visible focus indicators, a narrow preload bridge, context isolation, a sandboxed renderer, and a restrictive content-security policy.

## Current project phase and boundaries

Omniya Core is in a ground-up exploration and conversation phase. The immediate question is not whether this particular UI is the right one. It is what people need from an accessibility-first workspace for creating, revisiting, and navigating mathematics, and which assumptions should be discarded before a real product is designed.

The architecture is provisional. This prototype should be treated as a conversation prompt and source of concrete questions, not as a finished replacement for existing mathematical software.

This prototype deliberately does not include:

- accounts, authentication, or profiles;
- cloud sync, collaboration, or network services;
- AI features or telemetry;
- rich text, visual layout editing, or a conventional canvas;
- item reordering, general import/export, search, or formal proof management;
- installers, release automation, or production packaging;
- a claim that the current interaction model is ready for sustained mathematical work.

Keeping these boundaries narrow is intentional. Large features would make it harder to learn whether the core reading, equation exploration, editing, and persistence model is sound.

## Where help is most useful now

The highest-priority contribution right now is conversation with the community about what an accessibility-first mathematical workspace should be. The existing client is a concrete prompt for that conversation, not an interaction model the project has already chosen.

Useful ways to participate are:

1. Share how you currently read, write, revisit, and organize mathematics with a screen reader, Braille display, keyboard, or other assistive technology.
2. Question the assumptions represented by this scratchwork and propose fundamentally different models.
3. Discuss what should be designed from the ground up before implementation choices become constraints.

For now, start a design-focused GitHub issue for a conceptual question, lived experience, or alternative model. Use an issue for concrete behavior reports too; broader discussion threads, interviews, and community calls can grow around those questions as the project develops.

Assistive-technology testing, documentation, MathML review, interaction experiments, usability-study design, and focused bug fixes are useful when they support that discussion. Contributors are encouraged to question the current UI and architecture rather than assume they must preserve them.

## Project direction

Near-term and longer-term work are both research questions, not a feature roadmap. The distinction is urgency and scope: near-term questions concern the basic shape of a workspace, while longer-term questions concern what that workspace might support once its foundations are understood.

### Near-term design questions

The most pressing questions are simple but foundational:

- How should a person create and read a sequence of thoughts, return to earlier context, and understand where they are?
- What should focus, selection, and screen-reader announcements communicate at each level?
- How should entering, exploring, editing, and discussing an equation relate to one another?
- Which parts of a mathematical document should be visible, available, or local at each moment?
- How should these questions be discussed and evaluated with blind mathematicians and students?

Usability sessions, assistive-technology testing, interaction experiments, and documentation are ways to investigate these questions—not commitments to preserve the current interface.

### Longer-term research questions

If those foundations prove useful, later research might explore organizing proofs, definitions, claims, equations, and dependencies; nonvisual representations of larger mathematical structures; searching substantial bodies of work; accessible collaboration and interoperable formats; Braille and educational workflows; privacy-preserving synchronization; and extensibility without compromising semantic and keyboard access.

These directions should be shaped through research and collaboration with blind users, not selected solely by maintainers or sighted developers.

## How to contribute

The project is especially interested in thoughtful discussion before implementation. You do not need to write code, and you do not need to treat the current client as a foundation to preserve.

Useful entry points include screen-reader testing, reproducible accessibility reports, automated keyboard/accessibility tests, MathML or MathJax review, interaction experiments, documentation, focused bug fixes, and respectful usability-study design. Small experiments are preferred to large unsolicited rewrites.

### What makes a strong issue

Start with the user problem and affected workflow. Describe the observed experience or open design question; expected and actual behavior; operating system, screen reader, runtime, and input method; exact napkin content or reproduction steps; and a focused reproduction when possible.

### What makes a strong pull request

Keep the change narrow and link it to an issue or documented experiment. Explain the rationale, accessibility impact, and whether the implementation is intentionally exploratory. Include or update tests for behavioral changes, preserve offline behavior, semantic HTML, native MathML, and understandable focus behavior.

Accessibility work should not be treated as guesswork. Please avoid making broad design decisions “for blind users” without evidence, testing, or consultation. A respectful report that says “I do not know yet; here is what I observed” is more useful than confident visual-first speculation.

Major interaction and document-model changes should begin as issues or small experiments. They should not be merged solely because they are visually convenient or pass automated accessibility checks.

## Testing with assistive technology

Automated tests cover important invariants, but they cannot establish that the workflow is genuinely usable. Before expanding the prototype, manually complete the full flow with a screen reader: create and switch napkins; add text, an equation, and a note; explore nested expressions and matrix cells; edit and cancel; trigger a conversion error; delete an item and a napkin; then close and reopen saved work.

Pay attention to item type and position announcements, equation structure, focus after every action, save status, and recovery instructions. Record the screen reader, operating system, Electron version, and keyboard used.

## Run from source

The prototype requires a current Node.js installation.

```bash
npm install
npm start
```

Run the application through Electron. Opening `src/renderer/index.html` directly does not provide the preload bridge and is not a supported way to test the product.

The renderer and MathJax assets are installed locally. The application is designed to run offline and does not load a CDN. If local MathJax assets are missing, reinstall dependencies with `npm install` rather than adding a network fallback.

By default, committed state is stored as `napkins.json` under Electron’s platform-specific `app.getPath("userData")` directory. The `OMNIYA_TEST_USER_DATA_DIR` environment variable is reserved for isolated automated tests.

## Keyboard interaction

- Use Tab and Shift+Tab to move through ordinary controls.
- In the napkin sidebar, focus a napkin and press Backspace to delete it after confirmation.
- In Read mode, Up and Down move between items. Home and End move to the first and last item; on compact Mac keyboards these are commonly Fn+Left Arrow and Fn+Right Arrow.
- Press Enter on a focused text item to edit it.
- Press Enter on a focused equation to enter MathJax’s expression explorer. MathJax handles movement through the expression; Escape returns to the item.
- Press `E` on a focused item to edit it.
- Press Backspace on a focused item to delete it; focus moves to a nearby remaining item.
- Activate `Add item` to enter Add mode and focus the Content field.
- In Add mode, Enter adds the item, Shift+Enter inserts a new line, and Escape discards the draft.
- Arrow keys on the Text/Equation radio group switch the input type.
- In Edit mode, Save changes commits the item. Escape or Cancel returns to reading without saving the draft.
- Arrow keys inside textareas retain normal text-cursor behavior.

Only completed Add and Save actions are persisted. Unfinished drafts are not saved.

## Tests

```bash
npm test
npm run test:e2e
npm run test:all
```

The unit tests cover the domain model, state validation, local JSON persistence, queued atomic writes, corrupt-data recovery, and LaTeX-to-MathML conversion. The Electron tests use isolated user-data directories and cover read/add/edit modes, notes, napkin deletion, semantic MathML, keyboard exploration, relaunch persistence, offline behavior, and accessibility checks with axe-core.

The Electron test browser context is placed offline and records unexpected external HTTP requests. On macOS, run GUI tests from a normal logged-in terminal rather than a restricted GUI sandbox; the sandbox can abort GUI applications before the app’s JavaScript starts.

## Opening editable example napkins

Generate a single ignored napkin file containing several separate examples and open it in the normal Electron application:

```bash
npm run test:inspect
```

The examples include plain text, `a+b`, a nested fraction, a matrix, a radical and sum, and a mixed proof scratch napkin. Each is editable through the same application flow as ordinary work. The command overwrites:

`test/artifacts/latest/test.napkin.json`

That path is gitignored and is not a collection of permanent test reports.

To open another compatible napkin file:

```bash
npm run open:napkin -- /path/to/example.napkin.json
```

Committed changes made after opening a file are saved back to that file. A napkin file uses the application’s local JSON state format and may contain multiple napkins.

## Repository structure

- `src/main.js`, `src/preload.cjs`, and `src/main/` provide the secure Electron boundary, narrow bridge, MathML conversion, and local persistence.
- `src/domain/model.js` contains state factories, validation, and immutable napkin/item operations.
- `src/renderer/` contains the semantic page, restrained styling, application behavior, and local MathJax configuration.
- `scripts/open-napkin.mjs` opens an existing napkin file in the normal application.
- `test/unit/` covers model, persistence, MathML, and local assets; `test/e2e/` covers Electron workflows and accessibility acceptance.
- `test/inspect.mjs` generates the editable example napkin file.

## Project status, stewardship, and license

Omniya Core is an early prototype maintained by Axiya and released under the Apache License 2.0. The implementation is intentionally small and experimental so people can question its assumptions while ground-up research develops.
