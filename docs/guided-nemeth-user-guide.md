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

The number of cells does not decide the policy by itself. A two-cell opener can
still be immediate when its first recognized code already denotes a valid local
operation, while a longer code is collected only when BANA requires the later
cells to determine the symbol. Conversely, a one-cell separator or terminator
can be a structural follow-up because it acts on the object already under the
cursor. This is the general rule used for every BANA family, not a special case
for arrows or integrals.

For an arrow used as a modifier, complete the arrow code before pressing
**Enter**. For example, after opening a directly-over modifier, `$[33o` is one
local Rule 15.12 code. Omniya does not place a partial barb or shaft in the
modifier slot. If you stop early or enter a cell that is not part of that
registered arrow, the slot remains unchanged and you can correct the local
code. This same bounded rule applies to any BANA construction whose individual
cells are not meaningful until the complete local symbol is known; it is not
specific to arrows.

### Multi-level scripts

Nemeth level indicators can describe a script on a script. Enter the complete
two- or three-level indicator sequence, then press **Enter** once. For example,
`~~` means superscript followed by superscript, while `~;~` means superscript,
subscript, superscript. Omniya creates the corresponding nested MathML and
places you in the first required slot. Fill each slot with ordinary local
operations. This is one bounded atomic sequence, not a buffer for the
expression that will go inside the scripts. The same rule covers every
two- and three-level direction combination in BANA Rules 14.4.2 and 14.4.3.

For scripts, keep using the same local progression. Enter a base, choose the
subscript or superscript operation, and then fill that slot. A comma inside a
script uses the contracted comma code and keeps you in that script. A prime is
entered before a later script, so the editor keeps the prime with the base.
These are local tree operations, not punctuation that makes you restart or
retype the expression.

The same-side modifier code is also local. After completing one overbar or
underbar, enter the BANA higher-order indicator twice to open a new modifier
on that already modified object. This creates nested MathML rather than
turning the second modifier into an opposite-side modifier. For a binomial,
choose the binomial operation at the opening parenthesis, enter the upper
cell, use the directly-under separator to move to the lower cell, and close
the bounded two-cell object. The editor never buffers the surrounding
equation.

When the same bar is repeated directly over or under one object, the editor
keeps the bars together as one parallel-bar modifier. This is different from
the doubled higher-order indicator, which deliberately opens a modifier on
the previous modifier.

For a non-decimal numeral, start the numeric indicator and enter its digit
symbols, including the BANA-approved letter digits, as one local numeric atom.
For an uppercase Roman numeral, enter the double-capital indicator followed by
the Roman letters. The editor groups only that numeral and then returns to
ordinary local operations.

After a scripted expression, the bounded punctuation-indicator apostrophe-s
code adds the possessive suffix at baseline. It changes only the local script
and leaves the rest of the expression untouched.

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

When a BANA modifier has both an under and an over part, enter the first side,
its local value, the second-side indicator, its local value, and the final
terminator. For example, an underbar and overbar on `a` is one bounded
modifier construction. The editor turns the existing `munder` into a
`munderover` and opens only the missing slot. This is the same structural
follow-up rule used for bounds, scripts, and radicals: the code changes the
object already under the cursor; it does not start a second expression
parser.
