# Read-first napkin interaction design

## Goal

Make it immediately obvious whether the user is reading the napkin or adding/editing an item, while keeping the entire workflow keyboard-first and small enough to evaluate with blind mathematicians.

The current problem is mode collision: the reading transcript and the add form are permanently visible, so the same focus area appears to be both a document and a form. The new design makes reading the default state and opens writing as an explicit temporary mode.

## Design decision

Use three renderer-only interaction modes:

- `read`: inspect and navigate committed napkin content.
- `add`: create one new item.
- `edit`: modify the currently selected item.

The persisted application schema does not change. The mode and drafts are transient renderer state only.

## Layout

```text
┌ Napkins ┐ ┌──────────────────────────────────────────────┐
│         │ │ Reading: Proof ideas                  Saved  │
│ napkin  │ │                                              │
│ napkin  │ │ Item 1 of 4                                  │
│         │ │ text, MathML, and note                        │
│         │ │                                              │
│         │ │ Item 2 of 4                                  │
│         │ │ text, MathML, and note                        │
│         │ │                                              │
│         │ │                         [Add item]            │
└─────────┘ └──────────────────────────────────────────────┘
```

Read mode does not show the full composer. Its only writing affordance is a clearly labeled `Add item` button. Activating it replaces the lower action area with a compact, visibly labeled panel:

```text
Adding to “Proof ideas”                         [Back to reading]
Text  Equation                                  [Discard draft]
Content                                         [Add item]
Note
Enter adds · Shift+Enter makes a new line · Escape cancels
```

Edit mode uses the same panel, but the heading becomes `Editing item 2`, the saved source and note are loaded, and the action becomes `Save changes`.

## Reading model

The transcript becomes a semantic section containing one `<article>` per item. Each article contains:

- a concise heading such as “Text item 1 of 4” or “Equation item 2 of 4”;
- the actual text or imported MathML node;
- the note as ordinary text when present.

Only the current article is in the Tab sequence. Arrow navigation moves the current article and DOM focus together; the article itself remains the semantic reading surface, so assistive technology can inspect the MathML descendants instead of encountering a listbox option whose descendants are hidden from its accessibility tree.

The WAI-ARIA feed pattern is useful inspiration for article-level focus, position information, and skim-friendly names/descriptions, but this finite napkin should use a normal labeled section with semantic articles rather than claiming to be an auto-loading feed. See [WAI-ARIA feed guidance](https://www.w3.org/WAI/ARIA/apg/patterns/feed/).

## Keyboard contract

### Read mode

- `Tab` enters the napkin rail, the single current-article stop, and `Add item` in that order.
- `ArrowUp` / `ArrowDown` select and focus the previous/next article without wrapping.
- `Home` / `End` select and focus the first/last article.
- `Enter` opens the focused article in edit mode.
- `Tab` never walks through every note, MathML descendant, or item control.

### Add mode

- Opening the mode focuses `Content`.
- `Tab` moves through input type, Content, Note, and actions in normal form order.
- `Enter` commits the item; `Shift+Enter` inserts a newline.
- `Escape` discards the unfinished draft and returns focus to the previously selected article.
- Arrow keys retain normal text-field cursor behavior. They do not silently change the selected document item while the user is typing.

### Edit mode

- Opening focuses the selected item’s source.
- `Save changes` validates and commits source, note, and regenerated MathML together.
- `Escape` or `Cancel` discards the draft and returns focus to the selected article.

This follows the useful split demonstrated by Jupyter: notebook-level navigation has one keyboard vocabulary, while text editing keeps the browser’s normal editing keys. See [Jupyter’s command/edit mode shortcuts](https://jupyter-tutorial.readthedocs.io/en/24.1.0/notebook/shortcuts.html).

## Focus and announcements

- The mode heading is updated to `Reading`, `Adding`, or `Editing` and is announced through the existing polite status region.
- Entering Add/Edit mode moves focus exactly once to the source field.
- Leaving Add/Edit mode restores focus to the selected article.
- Selection announcements include napkin name, item position, type, and note presence without moving focus unnecessarily.
- Article position uses `aria-posinset` and `aria-setsize`; the article name and description identify the source and note.
- A compact `Keyboard help` button explains the mode-specific keys. It is a real, focusable control, not hidden-only instructions.

VS Code provides a comparable model: one Tab stop per major workbench area, arrow navigation within a focused list or tab group, and a context-sensitive accessibility-help command. See [VS Code accessibility guidance](https://code.visualstudio.com/docs/configure/accessibility/accessibility).

## Error and persistence behavior

- Failed LaTeX conversion keeps Add/Edit mode open, preserves the draft, and focuses the associated error.
- Successful Add/Edit returns to Read mode, selects the committed article, and autosaves.
- Unfinished Add/Edit drafts are never persisted.
- Save failures keep the in-memory state and expose the existing Retry save action.

## Verification

The Electron tests will cover:

1. Read mode’s compact Tab order and article Arrow/Home/End navigation.
2. Enter from an article opening Edit mode rather than appending an item.
3. Add mode focus, Text/Equation selection, notes, Enter submission, and Escape cancellation.
4. Edit mode regeneration, cancel behavior, and focus restoration.
5. Native MathML descendants and note announcements.
6. Reload persistence, offline execution, and axe/ARIA checks for each mode.

## Scope

No accounts, cloud sync, collaboration, AI, rich text, item deletion, reordering, or visual-polish pass is introduced. The implementation remains vanilla HTML, CSS, and JavaScript modules in the existing Electron shell.
