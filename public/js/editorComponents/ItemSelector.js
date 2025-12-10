/**
 * ItemSelector Component
 * 
 * A specialized dropdown for selecting items from the game's item database.
 * Can be filtered by item type (ingredient, rune, currency, etc.).
 * 
 * Usage:
 *   const selector = ItemSelector.create({
 *     id: 'outputItem',
 *     items: allItems,
 *     filterType: 'ingredient',
 *     value: 5,
 *     placeholder: 'Select item...',
 *     onChange: (itemId, item) => console.log('Selected:', item)
 *   });
 */

export const ItemSelector = {
    /**
     * Create an item selector dropdown
     * @param {Object} options
     * @param {string} [options.id] - Element ID
     * @param {Array} options.items - Array of item objects { id, name, item_type, ... }
     * @param {string} [options.filterType] - Filter by item_type (ingredient, rune, etc.)
     * @param {*} [options.value] - Selected item ID
     * @param {string} [options.placeholder='Select item...'] - Placeholder text
     * @param {Function} [options.onChange] - Callback: (itemId, item) => void
     * @returns {HTMLElement}
     */
    create(options) {
        const {
            id = null,
            items = [],
            filterType = null,
            value = null,
            placeholder = 'Select item...',
            onChange = null
        } = options;

        const wrapper = document.createElement('div');
        wrapper.className = 'item-selector';

        const select = document.createElement('select');
        select.className = 'editor-select';
        if (id) select.id = id;

        wrapper.appendChild(select);

        // Store references
        wrapper._select = select;
        wrapper._items = items;
        wrapper._filterType = filterType;
        wrapper._onChange = onChange;

        // Populate and render
        this.setItems(wrapper, items, value);

        // Change handler
        select.addEventListener('change', () => {
            const selectedId = select.value ? parseInt(select.value) : null;
            const selectedItem = wrapper._items.find(i => i.id === selectedId) || null;
            if (onChange) {
                onChange(selectedId, selectedItem);
            }
        });

        return wrapper;
    },

    /**
     * Set items and optionally select a value
     * @param {HTMLElement} wrapperEl
     * @param {Array} items
     * @param {*} [selectedValue]
     */
    setItems(wrapperEl, items, selectedValue = null) {
        const select = wrapperEl._select;
        const filterType = wrapperEl._filterType;

        wrapperEl._items = items;

        // Filter items if needed
        let filteredItems = items;
        if (filterType) {
            filteredItems = items.filter(item => item.item_type === filterType);
        }

        // Clear and repopulate
        select.innerHTML = '';

        // Empty option
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = 'Select item...';
        select.appendChild(emptyOpt);

        // Item options
        filteredItems.forEach(item => {
            const option = document.createElement('option');
            option.value = item.id;
            option.textContent = item.name;
            if (item.id == selectedValue) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    },

    /**
     * Get selected item ID
     * @param {HTMLElement} wrapperEl
     * @returns {number|null}
     */
    getValue(wrapperEl) {
        const value = wrapperEl._select.value;
        return value ? parseInt(value) : null;
    },

    /**
     * Set selected value
     * @param {HTMLElement} wrapperEl
     * @param {*} value
     */
    setValue(wrapperEl, value) {
        wrapperEl._select.value = value || '';
    },

    /**
     * Get the selected item object
     * @param {HTMLElement} wrapperEl
     * @returns {Object|null}
     */
    getSelectedItem(wrapperEl) {
        const id = this.getValue(wrapperEl);
        return wrapperEl._items.find(i => i.id === id) || null;
    }
};

export default ItemSelector;

