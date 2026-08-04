# Omniya Core

Omniya Core is an early experiment for blind mathematicians to create, navigate, and return to mathematical work. This repository currently contains a deliberately bare-bones Electron prototype for testing the idea of “math napkins.” It is not a finished product or a substitute for design work with blind mathematicians.

## Prototype capabilities

- Create and switch between local napkins.
- Add plain text or LaTeX equations in a linear sequence.
- Convert LaTeX to native MathML entirely offline.
- Attach a plain-text note to every item.
- Navigate items with the keyboard and edit earlier items.
- Save committed changes to Electron's local `userData` directory.

The UI is read-first: a left napkin rail and a center transcript show only committed text, MathML, and notes. `Add item` opens a separate compact add mode; Enter on a focused article opens the same panel in edit mode. This keeps reading and writing from competing for the same keyboard commands.

There are no accounts, cloud services, collaboration features, AI features, rich text, import/export, reordering, or release packaging.

## Run from source

The prototype requires a current Node.js installation.

```bash
npm install
npm start
```

All application code and MathJax resources are installed locally. The running app does not make network requests.

## Keyboard interaction

- Use Tab and Shift+Tab to move through ordinary controls.
- In Read mode, use Up/Down Arrow or Home/End to move between focused items.
- Press Enter on a focused item to edit it.
- Press Backspace on a focused item to delete it; focus moves to the next item, or the previous item when deleting the last item.
- Activate `Add item` to enter Add mode; focus moves to Content.
- In Add mode, press Enter to add, Shift+Enter for a new line, and Escape to discard and return to reading.
- In Edit mode, choose Save changes or press Escape/Cancel to return to reading.
- Arrow keys inside textareas retain normal cursor movement.

Only completed Add and Save actions are persisted; unfinished form drafts are not.

## Tests

```bash
npm test
npm run test:e2e
npm run test:all
```

The unit tests cover the small state model, local JSON storage, and LaTeX-to-MathML conversion. The Electron test exercises the read/add/edit modes, semantic article focus, notes, MathML, keyboard navigation, relaunch persistence, offline behavior, and axe scans across initial, add, edit, and error states.

## Inspecting the latest Electron test run

The E2E test normally finishes quickly, so use the inspect command when you want a saved result:

```bash
npm run test:inspect
```

Each run replaces the same ignored directory, `test/artifacts/latest/`, with:

- `electron.png` — final Electron screenshot;
- `aria.txt` — accessibility tree snapshot;
- `main.html` — final main-region HTML;
- `metadata.json` — capture time, napkin, mode, and item count.

The directory never accumulates timestamped snapshots. The files are local inspection artifacts and are gitignored. Electron normally stores personal napkins outside the repository in its platform-specific `userData` directory. If you override `OMNIYA_TEST_USER_DATA_DIR` for local testing, use an ignored path such as `.omniya-data/`.

Automated tests cannot establish that the workflow is genuinely usable. Before expanding this prototype, manually complete the workflow with VoiceOver on macOS and NVDA on Windows, and then evaluate it with blind mathematicians. Pay particular attention to item-selection announcements, MathML navigation, editing context, error recovery, and focus after every action.

## Minimal structure

- `src/main.js` creates the secure Electron window and three IPC handlers.
- `src/preload.cjs` exposes load, save, and LaTeX conversion methods.
- `src/domain/model.js` contains the napkin data operations.
- `src/main/mathml.js` and `src/main/storage.js` contain the two Node-side helpers.
- `src/renderer/app.js` contains the complete renderer behavior.

The data file is named `napkins.json` inside the platform-specific directory returned by Electron's `app.getPath('userData')`.

## Project direction

Most mathematical software is designed visually and made accessible afterward. Omniya Core is intended to explore the opposite approach with blind mathematicians, screen-reader users, accessibility engineers, and blind STEM students before its architecture becomes fixed.

The project is maintained by Axiya and licensed under the Apache License 2.0.
