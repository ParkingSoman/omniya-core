# Omniya Core

Omniya Core is an early experiment for blind mathematicians to create, navigate, and return to mathematical work. This repository currently contains a deliberately bare-bones Electron prototype for testing the idea of “math napkins.” It is not a finished product or a substitute for design work with blind mathematicians.

## Prototype capabilities

- Create and switch between local napkins.
- Delete a focused napkin from the sidebar with Backspace after confirming the action; the sidebar may be empty until you create another napkin.
- Add plain text or LaTeX equations in a linear sequence.
- Convert LaTeX to native MathML and render equations with MathJax entirely offline.
- Render equations with the locally bundled MathJax 4 accessibility components (semantic enrichment, speech/Braille metadata, and the expression explorer). The app requires this local runtime; it does not fall back to a different renderer.
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

All application code and MathJax resources are installed locally. The running app does not make network requests. If the local MathJax assets are missing, reinstall dependencies with `npm install` rather than opening the renderer HTML directly.

## Keyboard interaction

- Use Tab and Shift+Tab to move through ordinary controls.
- In the napkin sidebar, focus a napkin and press Backspace to delete it after confirmation.
- In Read mode, use the Up and Down Arrow keys to move between focused items.
- Press Enter on a focused text item to edit it. Press Enter on a focused equation to enter MathJax's expression explorer; use its arrow keys to move through the expression and Escape to return to the item. Press `E` to edit it.
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

The unit tests cover the small state model, local JSON storage, and LaTeX-to-MathML conversion. The Electron test exercises the read/add/edit modes, semantic article focus, notes, MathML, keyboard navigation, relaunch persistence, offline behavior, and axe scans across initial, add, edit, and error states. The browser runtime is intentionally kept local: no CDN fallback is permitted by the renderer CSP.

The automated Electron process uses an isolated test data directory and quits when the test window closes. On macOS, run GUI tests from a normal logged-in terminal rather than a restricted GUI sandbox; the sandbox can abort GUI applications before the app’s JavaScript starts.

## Opening editable example napkins

Use this command to generate one ignored napkin file containing several separate, editable examples and open it in the normal Electron application:

```bash
npm run test:inspect
```

Electron opens the generated file directly. Each example is a separate napkin, so you can switch between them and read, add, edit, delete, and save using the normal app flow. Closing the app ends the command.

Each run replaces the same ignored file:

`test/artifacts/latest/test.napkin.json`

The file is the same persisted state format used by the app. It is local and gitignored; each run overwrites it rather than creating a collection of reports.

You can open any existing napkin file with the same application:

```bash
npm run open:napkin -- /path/to/example.napkin.json
```

When a file is opened this way, committed changes are saved back to that file. Running `npm start` without a file continues to use Electron's normal platform-specific `userData` location. If you override `OMNIYA_TEST_USER_DATA_DIR` for local testing, use an ignored path such as `.omniya-data/`.

Automated tests cannot establish that the workflow is genuinely usable. Before expanding this prototype, manually complete the workflow with VoiceOver on macOS and NVDA on Windows, and then evaluate it with blind mathematicians. Pay particular attention to item-selection announcements, MathML navigation, editing context, error recovery, and focus after every action.

## Minimal structure

- `src/main.js` creates the secure Electron window and the app IPC handlers.
- `src/preload.cjs` exposes the three app methods.
- `src/domain/model.js` contains the napkin data operations.
- `src/main/mathml.js` and `src/main/storage.js` contain the two Node-side helpers.
- `src/renderer/app.js` contains the complete renderer behavior.
- `scripts/open-napkin.mjs` opens a persisted napkin file in the normal app.

The data file is named `napkins.json` inside the platform-specific directory returned by Electron's `app.getPath('userData')`.

## Project direction

Most mathematical software is designed visually and made accessible afterward. Omniya Core is intended to explore the opposite approach with blind mathematicians, screen-reader users, accessibility engineers, and blind STEM students before its architecture becomes fixed.

The project is maintained by Axiya and licensed under the Apache License 2.0.
