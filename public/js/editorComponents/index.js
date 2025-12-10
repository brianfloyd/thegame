/**
 * Editor Components - Unified reusable UI components for all game editors
 * 
 * Components:
 * - SectionBox: Grouped fields with title bar
 * - FieldGrid: 2/3/4-column CSS grid layout
 * - ToggleSwitch: Standardized toggle replacing checkboxes
 * - ListSidebar: Search + list + actions sidebar
 * - JSONGridEditor: Dynamic row management for arrays
 * - ItemSelector: Item dropdown with filtering
 * - RuneSelector: Rune type dropdown
 * 
 * Usage:
 *   import { SectionBox, FieldGrid, ToggleSwitch } from './editorComponents/index.js';
 *   
 *   // Or import all
 *   import * as EditorComponents from './editorComponents/index.js';
 */

export { SectionBox } from './SectionBox.js';
export { FieldGrid } from './FieldGrid.js';
export { ToggleSwitch } from './ToggleSwitch.js';
export { ListSidebar } from './ListSidebar.js';
export { JSONGridEditor } from './JSONGridEditor.js';
export { ItemSelector } from './ItemSelector.js';
export { RuneSelector } from './RuneSelector.js';

// Default export with all components
export default {
    SectionBox: null,
    FieldGrid: null,
    ToggleSwitch: null,
    ListSidebar: null,
    JSONGridEditor: null,
    ItemSelector: null,
    RuneSelector: null
};

// Lazy load components on first access
const componentPromises = {};

/**
 * Load all components asynchronously
 * @returns {Promise<Object>}
 */
export async function loadComponents() {
    const [
        { SectionBox },
        { FieldGrid },
        { ToggleSwitch },
        { ListSidebar },
        { JSONGridEditor },
        { ItemSelector },
        { RuneSelector }
    ] = await Promise.all([
        import('./SectionBox.js'),
        import('./FieldGrid.js'),
        import('./ToggleSwitch.js'),
        import('./ListSidebar.js'),
        import('./JSONGridEditor.js'),
        import('./ItemSelector.js'),
        import('./RuneSelector.js')
    ]);

    return {
        SectionBox,
        FieldGrid,
        ToggleSwitch,
        ListSidebar,
        JSONGridEditor,
        ItemSelector,
        RuneSelector
    };
}

