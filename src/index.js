/**
 * Omniya Core - Entry Point
 * Minimal desktop GUI for building accessible math documents
 */

import { createNapkin } from './models/napkin.js';
import { createItemStore } from './store/itemStore.js';
import { NapkinManager } from './manager/napkinManager.js';

export { createNapkin, createItemStore, NapkinManager };

console.log('Omniya Core initialized');
