# The napkin editor works like Word

A napkin is one document. You type in it. You undo and redo in it. An equation
sits inside a sentence, as one unit. Only two things are new: writing an
equation as Nemeth or LaTeX, and reading or editing an equation by its parts.

The rule for this editor is **do not innovate**. Where Word has a key, the
editor uses that key. Every key below is listed with the reason it is there.

## Keys that come from Word

| Action | Windows | Mac | Why |
|---|---|---|---|
| Insert an equation at the caret | `Alt+=` | `Control+=` | Word's own equation key. Word MVP answer on Microsoft Q&A for Mac. The Mac key is less well documented than the Windows one. |
| Undo | `Ctrl+Z` | `Cmd+Z` | Word |
| Redo | `Ctrl+Y` | `Cmd+Shift+Z` | Word |
| New paragraph | `Enter` | `Return` | Word |
| Move, select, select all | arrows, `Shift+arrows`, `Ctrl+A` | same, with `Cmd` | Word. The browser does these. |
| Move past an equation | one arrow press selects it, the next moves past it | same | Word treats an equation as one object |
| Delete an equation | first `Backspace` or `Delete` selects it, the second deletes it | same | Word selects an object before it deletes it |
| New note | `Ctrl+N` | `Cmd+N` | Word's new document. File > New note runs it. |
| Find in the note | `Ctrl+F` | `Cmd+F` | Word. Next match: `Enter`, or `F3` / `Cmd+G`. Previous: `Shift+Enter`, or `Shift+F3` / `Shift+Cmd+G`. |
| Print | `Ctrl+P` | `Cmd+P` | Word |
| Undo and redo from the menu | Edit > Undo, Edit > Redo | same | Word. The menu items go to the editor's history, not the browser's. |

One undo step covers typing. Each equation insert, edit or delete is its own
undo step. Typing and equations share one history.

## Keys that Word does not have

| Action | Key | Why |
|---|---|---|
| Read the selected equation by its parts | `Enter` | Word has no tree reading. This is the hierarchical explorer. |
| Move through the parts | arrow keys | MathJax's own explorer keys |
| Replace the part you are on | `r` | Kept from the earlier editor |
| Insert after the part you are on | `a` | Kept from the earlier editor |
| Insert before the part you are on | `o` | Kept from the earlier editor |
| Leave the explorer | `Escape` | Kept. The equation stays selected in the document. |
| Delete the equation you are reading | `Backspace` | Same result as the two-press delete. Undo brings it back. |
| Pick Nemeth or LaTeX in the equation field | `Ctrl+E` / `Ctrl+L` while the field is empty | Kept from the earlier editor. They only work inside the equation field, so they do not clash with Word's centre and left-align keys. |

## The screen

The page is built to look like a note-taking app and to work like Word. The
rules behind it, and how they were checked, are in `docs/judging.md`.

| Part | What it is | Why |
|---|---|---|
| Notes list (left) | A plain list under "Notes", with "New note" | Apple Notes and Bear. The interface says "note"; the code, files and schema still say "napkin". |
| Toolbar (top) | Undo, Redo, Insert equation (shows its key), Find, Export and Shortcuts. Real, labelled buttons in the Tab order. | Word's quick-access bar. Discoverable without help. |
| Note title | The note's name as a heading, with Rename and Delete beside it | The actions sit next to the thing they change. |
| The page | One reading column on a white page. No border, no side bar on focus. An empty note shows what to do. | Writing is the whole screen. |
| Find bar | A strip under the toolbar: one field, "2 of 5", Previous, Next, Close. Every match is highlighted. Escape closes it and leaves the match selected. | Word's find, kept as small as it can be. It also finds text inside equations the person typed. |
| Equation panel | A strip under the toolbar. A visible Nemeth braille / LaTeX choice, one field, a preview of the equation, Insert, Cancel. | Word's equation input with its preview. It pushes the page down so it never covers the line being edited. |
| Export dialog | Web page, LaTeX document, plain text, Print | Word's Save As and Print, in one short list |
| Save status | "Saved" beside the note title. A one-line hint under the title while an equation is selected. | Apple Notes and Word keep state next to the title, not in a bar. There is no status bar. |
| Shortcuts | A dialog of short tables | Word's shortcut sheet |

Equations alone on a line are centred, as in Word. Light and dark follow the
system. A button with nothing to do is `aria-disabled`, not `disabled`, so a
person who presses Undo until it runs out does not lose their place.

### Find, preview and export

- **Find** matches text without regard to case. It also matches an equation whose
  typed source (the LaTeX, or the braille cells) holds the words. The count is a
  polite live region, so a screen reader says "2 of 5" as you move. There is no
  replace.
- **Preview.** While you type in the equation panel, the draft is drawn under the
  field after a short pause. A hidden line, "Reads as: a over b plus the square
  root of x", holds what a screen reader would say. It is read with the field,
  not announced as you type, because a braille typist already hears a line per
  keystroke. An unfinished draft shows nothing, not an error.
- **Export** writes a web page (equations stay MathML, which a screen reader
  reads), a LaTeX document, or plain text with equations between dollar signs.
  An equation typed as LaTeX exports as typed. Others are worked out from their
  MathML, which handles common forms and is not complete. **Print** hides
  everything except the title and the note, and the system print window can save
  a PDF.

**Not done on purpose, because each is a new capability and not polish:** bold,
italic, headings and lists (UEB marks emphasis with typeform indicators, so this
needs a braille decision first); replace; a symbol picker; searching the list of
notes; a braille file (BRF) export.

## What changed for people who used the earlier editor

| Before | Now |
|---|---|
| A list of items. Up and Down moved between items. | One document. Arrow keys move through it. |
| `Ctrl+E` or `Ctrl+L` started an equation anywhere. | `Alt+=` (Windows) or `Control+=` (Mac) starts it. `Ctrl+E` and `Ctrl+L` pick the method inside the field. |
| The equation field stayed open after Enter, ready for the next equation. | The equation is inserted and the caret returns to the document, after the equation. The next equation is one `Alt+=` away. A braille tester asked for the old behaviour in August 2026. It does not fit a document, where text follows an equation. Revisit this if testers miss it. |
| Each item had a note. | The note field is gone. When an old note is opened, each of those notes becomes its own paragraph. |
| Undo worked inside one equation. | Undo and redo work everywhere. |
| Backspace on an equation in the list deleted it at once. | Backspace selects it first, as in Word. |

## How it is built

| Part | File | What it does |
|---|---|---|
| Editor | `src/renderer/editor/index.js` | ProseMirror view, history, keys. `createNapkinEditor`. |
| Document shape | `src/renderer/editor/schema.js` | Paragraphs of text and inline `math` atoms. |
| Equation in the page | `src/renderer/editor/math-node-view.js` | Draws one equation. Names it for a reader. Hands the keys to the explorer when it is entered. |
| MathJax drawing | `src/renderer/editor/math-render.js` | Draws MathML. Reads MathJax's speech label. |
| Word's Backspace | `src/renderer/editor/commands.js` | Select the equation first, then delete it. |
| Bundle | `scripts/build-editor.mjs` | Builds `editor.bundle.js`. Runs before `npm start`, `npm run test:e2e` and the packaging scripts. |
| App | `src/renderer/app.js` | Napkin list, saving, the equation field, the explorer, menus. |
| Saved shape | `src/domain/document.js` | The plain JSON of a document. No ProseMirror import, so the domain stays standalone. |
| Upgrade | `src/domain/migration.js` | Old item lists become documents. `storage.js` keeps a copy of the old file first. |

The editor is bundled because the page allows only `script-src 'self'`, and
ProseMirror imports its parts by package name. The bundle is generated and is
not committed.

### Saved shape (schema v3)

```
{ schemaVersion: 3, activeNapkinId, napkins: [ { id, name, doc } ] }
doc       = { type: 'doc', content: [ paragraph, ... ] }
paragraph = { type: 'paragraph', content?: [ text | math, ... ] }
text      = { type: 'text', text }
math      = { type: 'math', attrs: { mathml, source, sourceKind: 'nemeth' | 'latex' } }
```

`source` is what the person typed. It is empty after an edit by parts, because
what was typed replaced only part of the equation. The spoken label is not
saved. MathJax makes it each time the equation is drawn.

### Reading an equation

The equation is one image with a name, `role="img"` and the MathJax speech as
`aria-label`. A reader says it once as the caret passes. When the explorer is
entered, the name is lifted so the reader can walk the parts. When the
explorer is left, the name returns.

## How it is tested

| Layer | Where | What it shows |
|---|---|---|
| Unit | `test/unit/` | Document shape, migration, storage, Nemeth. |
| Editor in Electron | `test/e2e/word-flow.test.js` and the other `test/e2e/` files | Keys, caret, undo, saving. |
| Accessibility tree | `test/e2e/editor-accessibility.test.js` | Arrow behaviour at an equation, and what a virtual screen reader says. |
| axe | in the e2e files | ARIA faults. |
| Real readers | `test/screen-reader/`, run by `.github/workflows/screen-reader.yml` | What NVDA (Windows) and VoiceOver (macOS) say. The transcript is saved as a CI artifact. |

The real-reader job records the words a reader speaks. It cannot say whether a
blind person finds the flow good. The sign-off in `docs/HUMAN-TESTING.md` stays.

## Open questions

- **VoiceOver.** Measured for reading, not for caret echo. In CI run 6, reading by
  items, VoiceOver said "Solve", then "x squared image", then "for x.", in order.
  The macOS job now asserts that the equation is named this way. Guidepup does not
  capture VoiceOver's echo of arrow-key caret moves, in a plain text input or in
  the editor, so what VoiceOver says as the caret passes the equation is still
  unmeasured. A run where VoiceOver says nothing at all is reported as skipped
  (run 4 did). A person with VoiceOver should try `docs/HUMAN-TESTING.md` step 5.
- **NVDA.** Works as designed, from CI run 4 on Windows. The line reads "Solve,
  graphic, x squared, for x." Arrowing says "o", "l", "v", "e", "space", then
  "graphic, x squared" as the caret arrives, then "out of graphic" as it passes.
  The plain text input walks the same way. After Left Arrow back onto the
  equation it said "space", not the equation name.
- **Mac equation key.** `Control+=` is the most often reported key. Microsoft
  does not document it.

## Braille for ordinary text

The app does not translate ordinary text into braille. It gives the screen reader plain text.
The screen reader turns that text into braille, in the table the person chose there.

| What | Where |
|---|---|
| Table choice: contracted or not, any language, separate input and output tables | The screen reader's own braille settings (NVDA Braille settings, VoiceOver Braille, JAWS) |
| Text on the braille display | Plain text from the editor. No `aria-braillelabel` on paragraphs. |
| Equations | Keep their own braille label. Mathematics is a code, not a table choice. |

Why. The old grade 1 / grade 2 switch changed only the words on its button. The braille
label on each paragraph was always grade 2 and overrode the person's table. Removing both
means a reader who wants grade 1, or a table from another language, gets it. Apple's
VoiceOver guides and Google Docs work this way: the app offers a braille on/off or nothing,
and the screen reader owns the table. See the sources in the pull request for #37.

Left in place and now unused by the editor: `src/main/ueb-service.js` (liblouis), the
`ueb:translate` bridge, `src/renderer/ueb-braille-projection.js`, and the grade fields in
`src/domain/authoring-state.js`. Delete them when you are sure no other feature needs them.
