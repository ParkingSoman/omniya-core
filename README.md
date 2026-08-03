# Omniya Core

Omniya Core is an early experiment for blind mathematicians to create, navigate, and return to mathematical work. This repository currently contains a deliberately bare-bones Electron prototype for testing the idea of “math napkins.” It is not a finished product or a substitute for design work with blind mathematicians.

## Prototype capabilities

- Create and switch between local napkins.
- Add plain text or LaTeX equations in a linear sequence.
- Convert LaTeX to native MathML entirely offline.
- Attach a plain-text note to every item.
- Navigate items with the keyboard and edit earlier items.
- Save committed changes to Electron's local `userData` directory.

There are no accounts, cloud services, collaboration features, AI features, rich text, import/export, deletion, reordering, or release packaging.

## Run from source

The prototype requires a current Node.js installation.

```bash
npm install
npm start
```

All application code and MathJax resources are installed locally. The running app does not make network requests.

## Keyboard interaction

- Use Tab and Shift+Tab to move through ordinary controls.
- In the item list, use Up/Down Arrow or Home/End to change selection.
- Press Enter in the item list to edit the selected item.
- Press Escape while editing to discard the draft and return to the item list.
- Press Control+Enter, or Command+Enter on macOS, to add an item from the composer.

Only completed Add and Save actions are persisted; unfinished form drafts are not.

## Tests

```bash
npm test
npm run test:e2e
npm run test:all
```

The unit tests cover the small state model, local JSON storage, and LaTeX-to-MathML conversion. The single Electron test exercises the complete offline workflow, keyboard focus, relaunch persistence, and an automated axe scan.

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
