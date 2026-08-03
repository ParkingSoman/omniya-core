/**
 * Napkin - A single mathematical document
 * A napkin contains a sequence of items (text or equations)
 */

/**
 * Item type definition
 * @typedef {Object} Item
 * @property {string} id - Unique identifier
 * @property {string} type - 'text' or 'equation'
 * @property {string} content - The text content or LaTeX
 * @property {string} [note] - Optional freeform note
 * @property {number} [position] - Position in the sequence
 * @property {Object} [mathml] - Pre-computed MathML for equations
 */

/**
 * Document - An ordered sequence of items
 * @typedef {Object} Document
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {Item[]} items - Ordered list of items
 * @property {number} lastSelectedIndex - Index of last focused item
 */

/**
 * Napkin - Container for documents
 * @typedef {Object} Napkin
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {Document} document - The main document
 */

// Generate unique IDs
let napkinCounter = 0;
let documentCounter = 0;
let itemCounter = 0;

/**
 * Create a new Document
 * @param {string} [name='Untitled Document'] - Document name
 * @returns {Document}
 */
export function createDocument(name = 'Untitled Document') {
  documentCounter++;
  return {
    id: `doc-${documentCounter}`,
    name,
    items: [],
    lastSelectedIndex: -1
  };
}

/**
 * Create a new Text Item
 * @param {string} content - Text content
 * @param {string} [note] - Optional note
 * @param {number} [position] - Position in sequence
 * @returns {Item}
 */
export function createTextItem(content, note = '', position = null) {
  itemCounter++;
  return {
    id: `item-${itemCounter}`,
    type: 'text',
    content,
    note,
    position
  };
}

/**
 * Create a new Equation Item
 * @param {string} content - LaTeX content
 * @param {string} [note] - Optional note
 * @param {number} [position] - Position in sequence
 * @returns {Item}
 */
export function createEquationItem(content, note = '', position = null) {
  itemCounter++;
  return {
    id: `item-${itemCounter}`,
    type: 'equation',
    content,
    note,
    position,
    mathml: null // Will be computed when needed
  };
}

/**
 * Create a new Napkin with a document
 * @param {string} [name='Untitled Napkin'] - Napkin name
 * @returns {Napkin}
 */
export function createNapkin(name = 'Untitled Napkin') {
  napkinCounter++;
  napkinCounter++; // Reuse counter style for documents
  const doc = createDocument(name);
  return {
    id: `napkin-${napkinCounter}`,
    name,
    document: doc
  };
}

/**
 * Get an item by ID
 * @param {Item[]} items - List of items
 * @param {string} id - Item ID
 * @returns {Item|null}
 */
export function findItemById(items, id) {
  return items.find(item => item.id === id) || null;
}

/**
 * Get the item at a given position
 * @param {Item[]} items - List of items
 * @param {number} index - Position index
 * @returns {Item|null}
 */
export function getItemAt(items, index) {
  return items[index] || null;
}

/**
 * Get the position index of an item
 * @param {Item[]} items - List of items
 * @param {Item} item - Item to find
 * @returns {number}
 */
export function getItemPosition(items, item) {
  return items.findIndex(i => i.id === item.id);
}

/**
 * Insert an item at a position
 * @param {Item[]} items - List of items
 * @param {Item} item - Item to insert
 * @param {number} position - Position to insert at
 * @returns {Item[]}
 */
export function insertItem(items, item, position = items.length) {
  const clonedItems = [...items];
  const itemWithPosition = { ...item, position };
  clonedItems.splice(position, 0, itemWithPosition);
  return clonedItems;
}

/**
 * Update an item's content
 * @param {Item[]} items - List of items
 * @param {Item} item - Item to update
 * @param {string} content - New content
 * @returns {Item[]}
 */
export function updateItemContent(items, item, content) {
  const updatedItem = { ...item, content };
  const index = items.findIndex(i => i.id === item.id);
  if (index !== -1) {
    items[index] = { ...items[index], ...updatedItem };
  }
  return items;
}

/**
 * Update an item's note
 * @param {Item[]} items - List of items
 * @param {Item} item - Item to update
 * @param {string} note - New note
 * @returns {Item[]}
 */
export function updateItemNote(items, item, note) {
  const index = items.findIndex(i => i.id === item.id);
  if (index !== -1) {
    items[index] = { ...items[index], note };
  }
  return items;
}

/**
 * Add an item to the end of the document
 * @param {Item[]} items - List of items
 * @param {Item} item - Item to add
 * @param {boolean} isEquation - Whether this is an equation item
 * @returns {Item[]}
 */
export function addItem(items, item, isEquation = false) {
  const newItems = insertItem(items, item, items.length);
  return { ...items, items: newItems };
}

/**
 * Remove an item from the document
 * @param {Item[]} items - List of items
 * @param {Item} item - Item to remove
 * @returns {Item[]}
 */
export function removeItem(items, item) {
  const index = items.findIndex(i => i.id === item.id);
  if (index !== -1) {
    return items.filter(i => i.id !== item.id);
  }
  return items;
}

/**
 * Move an item to a new position
 * @param {Item[]} items - List of items
 * @param {Item} item - Item to move
 * @param {number} newPosition - New position
 * @returns {Item[]}
 */
export function moveItem(items, item, newPosition) {
  const index = items.findIndex(i => i.id === item.id);
  if (index === -1) return items;
  
  const itemToMove = items.splice(index, 1)[0];
  items.splice(newPosition, 0, itemToMove);
  return items;
}
