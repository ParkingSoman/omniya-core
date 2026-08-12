# Guided Nemeth interaction decisions

This log records only behavior that is visible to a Nemeth user and departs
from a conventional linear Nemeth writing session. BANA 2022 and the October
2025 errata are normative. APH terminology is used for teaching labels.

## Persistent empty slots

- **User problem:** A reader must be able to stop at a numerator, denominator,
  script, or radical body and resume later without a hidden parser stack.
- **BANA references:** Rules 13, 14, and 16; BANA 2022 pp. 154–221.
- **Chosen behavior:** Required children are persisted as stable MathML holes and
  announced with their structural path, for example “editing denominator,
  empty, fraction inside exponent.”
- **Rejected alternatives:** Keep a transient parameter stack, or silently
  omit an unfinished child from the saved equation.
- **Contributor validation:** Pending qualified-transcriber and blind-user
  task validation.
- **Status:** Implemented in the draft transition core; VoiceOver and display
  validation remains a release task.

## Explicit ambiguity choices

- **User problem:** A local Nemeth sequence can have more than one valid meaning
  at the current focus.
- **BANA references:** Rules 19, 21, and 24; symbol index and Appendix B.
- **Chosen behavior:** Return a short context-filtered choice list. The author
  selects the intended operation before the tree changes.
- **Rejected alternatives:** Guess from a global expression parser, or choose
  the first registry entry silently.
- **Contributor validation:** Pending contributor review.
- **Status:** Implemented in the transition API and the small choice control in
  the replacement dock; contributor validation remains pending.

## Terminators move focus

- **User problem:** A user who enters a closing fraction, radical, or grouping
  indicator expects to continue at the surrounding level.
- **BANA references:** Rules 13, 16, and 19.
- **Chosen behavior:** Standard closing indicators perform their BANA operation
  and move focus to the enclosing row or next open slot.
- **Rejected alternatives:** Treat terminators as inert punctuation and require
  a separate navigation command.
- **Contributor validation:** Pending contributor review.
- **Status:** Implemented for the currently registered fraction, radical, and
  grouping transitions; family-specific coverage remains pending.

## Paired grouping boundaries

- **User problem:** Selecting an explicit grouping operation should make its
  editable extent clear immediately.
- **BANA references:** Rule 19.
- **Chosen behavior:** The operation creates one paired MathML grouping node and
  focuses its content hole. The closing indicator returns focus outward.
- **Rejected alternatives:** Insert only a literal opening bar or parenthesis
  and ask a later global parser to infer the extent.
- **Contributor validation:** Pending contributor review.
- **Status:** Implemented for the registered round-group transition; additional
  delimiter families remain pending.
