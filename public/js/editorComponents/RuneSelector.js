/**
 * RuneSelector Component
 * 
 * A specialized dropdown for selecting rune types.
 * Used in crafting recipes for required runes (SPEED, EFFICIENCY only - PRODUCTION excluded).
 * 
 * Usage:
 *   const selector = RuneSelector.create({
 *     id: 'runeType',
 *     value: 'SPEED',
 *     includeProduction: false,
 *     onChange: (runeType) => console.log('Selected:', runeType)
 *   });
 */

export const RuneSelector = {
    // Available rune types
    RUNE_TYPES: {
        PRODUCTION: { value: 'PRODUCTION', label: 'Production', color: '#9900ff' },
        SPEED: { value: 'SPEED', label: 'Speed', color: '#00FF00' },
        EFFICIENCY: { value: 'EFFICIENCY', label: 'Efficiency', color: '#FFD700' }
    },

    /**
     * Create a rune selector dropdown
     * @param {Object} options
     * @param {string} [options.id] - Element ID
     * @param {string} [options.value] - Selected rune type
     * @param {boolean} [options.includeProduction=false] - Include PRODUCTION rune option
     * @param {string} [options.placeholder='Select rune type...'] - Placeholder text
     * @param {Function} [options.onChange] - Callback: (runeType) => void
     * @returns {HTMLElement}
     */
    create(options = {}) {
        const {
            id = null,
            value = null,
            includeProduction = false,
            placeholder = 'Select rune type...',
            onChange = null
        } = options;

        const wrapper = document.createElement('div');
        wrapper.className = 'rune-selector';

        const select = document.createElement('select');
        select.className = 'editor-select';
        if (id) select.id = id;

        // Empty option
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = placeholder;
        select.appendChild(emptyOpt);

        // Rune type options
        Object.values(this.RUNE_TYPES).forEach(rune => {
            // Skip PRODUCTION unless explicitly included
            if (rune.value === 'PRODUCTION' && !includeProduction) return;

            const option = document.createElement('option');
            option.value = rune.value;
            option.textContent = rune.label;
            if (rune.value === value) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        wrapper.appendChild(select);

        // Store references
        wrapper._select = select;
        wrapper._onChange = onChange;

        // Change handler
        select.addEventListener('change', () => {
            const selectedType = select.value || null;
            if (onChange) {
                onChange(selectedType);
            }
        });

        return wrapper;
    },

    /**
     * Get selected rune type
     * @param {HTMLElement} wrapperEl
     * @returns {string|null}
     */
    getValue(wrapperEl) {
        return wrapperEl._select.value || null;
    },

    /**
     * Set selected value
     * @param {HTMLElement} wrapperEl
     * @param {string} value
     */
    setValue(wrapperEl, value) {
        wrapperEl._select.value = value || '';
    },

    /**
     * Get rune type info
     * @param {string} runeType
     * @returns {Object|null}
     */
    getRuneInfo(runeType) {
        return this.RUNE_TYPES[runeType] || null;
    },

    /**
     * Get all available rune types (for recipes - excludes PRODUCTION)
     * @returns {Array<{value: string, label: string}>}
     */
    getRecipeRuneTypes() {
        return [
            { value: 'SPEED', label: 'Speed' },
            { value: 'EFFICIENCY', label: 'Efficiency' }
        ];
    }
};

export default RuneSelector;


