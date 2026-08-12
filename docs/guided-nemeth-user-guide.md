# Writing mathematics with guided Nemeth

Omniya lets you read an equation with MathJax and edit the exact place you are
reading. Press **E** while MathJax has the expression you want focused. The
replacement starts empty, so the original equation is unchanged until you
submit it.

Nemeth is the default writing method when the app starts. Type one Braille
cell at a time. Ordinary, complete codes appear in the replacement immediately.
For example, the integral cell inserts `∫` right away. You can then use the
guided structural controls to add a numerator, denominator, bound, script, or
modifier. Those are follow-up operations on the MathML object that is already
there, not part of one large text buffer.

Some Nemeth symbols are a single local construction made from several cells.
An arrow is one example. Type all of the cells for the arrow, then press
**Enter**. Omniya creates the arrow only after the complete registered code is
present. If the code is incomplete or invalid, the draft does not change and
the input remains available for correction.

Enter always has a small, local meaning in Nemeth mode:

- If a bounded local code is waiting, Enter commits that one code.
- Otherwise, Enter submits the completed replacement draft.

It never parses an arbitrary expression or silently changes a larger part of
the equation. Escape cancels the replacement. You can choose LaTeX before
typing if you prefer it for this replacement; LaTeX uses the same exact
subtree replacement, focus restoration, undo, and save behavior. The choice is
remembered only until the app closes, and a fresh launch starts in Nemeth.

## The three local code styles

The same rule is used throughout the supported BANA mappings:

| Style | What you do | What it does |
| --- | --- | --- |
| Immediate | Type the complete code | Inserts or applies that one object as soon as it is recognized. |
| Atomic sequence | Enter the registered cells, then Enter | Commits one bounded construction, such as a particular arrow. |
| Structural follow-up | Enter a separator, terminator, or modifier code | Moves to or changes a slot in an object already in the draft. |

This is not a special arrow-versus-integral convention. It is the input
registry's general rule. An ordinary integral is immediate, while its bounds
are follow-ups. A compound object whose cells must be known together is an
atomic sequence. Each buffer is discarded after that one local code is
accepted, so writing from an empty equation and replacing a selected
subexpression use exactly the same small operations.

The same classification applies to alphabet indicators, typeforms, named
functions, radicals, grouping signs, operators, comparisons, shapes, and
arrows. If BANA defines a standalone symbol, it is immediate. If BANA defines
one multi-cell symbol whose meaning depends on the complete local code, it is
atomic-sequence. If a code changes the slot or decoration of an object already
on the page, it is structural-followup. These choices are properties of the
registry rows, so adding a new BANA construction does not require a new
editing mode or a second parser.

### Bounded modifier scopes

Some BANA modifiers cover more than one adjacent symbol. Enter the modifier
indicator, enter that expression one local symbol at a time, then enter the
modifier and its terminator. For example, an overbar on `a+b` is entered as
the multipurpose indicator, directly-over indicator, `a`, plus, `b`, bar, and
terminator. Omniya remembers only the first and last siblings of that one
modifier construction, wraps exactly that range, and returns to the surrounding
expression. It does not parse or buffer the rest of the equation.

The same bounded-scope rule applies wherever BANA defines a decoration over
several adjacent symbols. Standalone symbols still appear immediately, and
later structural codes modify the focused MathML object or the exact local
range selected by the current construction.
