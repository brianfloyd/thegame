/**
 * JSONGridEditor Component
 * 
 * A reusable grid editor for managing arrays of objects (ingredients, outputs, etc.).
 * Supports add/remove rows with customizable field definitions.
 * 
 * Usage:
 *   const grid = JSONGridEditor.create({
 *     fields: [
 *       { key: 'item_id', type: 'select', label: 'Item', options: items },
 *       { key: 'quantity', type: 'number', label: 'Qty', min: 1, default: 1 }
 *     ],
 *     data: [{ item_id: 1, quantity: 5 }],
 *     emptyText: 'No ingredients added',
 *     addText: '+ Add Ingredient',
 *     onChange: (data) => console.log('Data changed:', data)
 *   });
 */

export const JSONGridEditor = {
    /**
     * Create a JSON grid editor
     * @param {Object} options
     * @param {Array<Object>} options.fields - Field definitions
     * @param {Array<Object>} [options.data=[]] - Initial data array
     * @param {string} [options.emptyText='No items added'] - Text when empty
     * @param {string} [options.addText='+ Add Row'] - Add button text
     * @param {Function} [options.onChange] - Callback when data changes: (data) => void
     * @param {Function} [options.onRenderRow] - Custom row render callback
     * @returns {HTMLElement}
     */
    create(options) {
        const {
            fields,
            data = [],
            emptyText = 'No items added',
            addText = '+ Add Row',
            onChange = null,
            onRenderRow = null
        } = options;

        const container = document.createElement('div');
        container.className = 'json-grid-editor';

        // Store state
        container._fields = fields;
        container._data = [...data];
        container._emptyText = emptyText;
        container._addText = addText;
        container._onChange = onChange;
        container._onRenderRow = onRenderRow;

        // Rows container
        const rowsContainer = document.createElement('div');
        rowsContainer.className = 'json-grid-rows';
        container.appendChild(rowsContainer);
        container._rowsContainer = rowsContainer;

        // Add button
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'json-grid-add-btn';
        addBtn.textContent = addText;
        addBtn.addEventListener('click', () => {
            this.addRow(container);
        });
        container.appendChild(addBtn);

        // Initial render
        this.render(container);

        return container;
    },

    /**
     * Set data and re-render
     * @param {HTMLElement} containerEl
     * @param {Array} data
     */
    setData(containerEl, data) {
        containerEl._data = [...data];
        this.render(containerEl);
    },

    /**
     * Get current data
     * @param {HTMLElement} containerEl
     * @returns {Array}
     */
    getData(containerEl) {
        return [...containerEl._data];
    },

    /**
     * Add a new row with default values
     * @param {HTMLElement} containerEl
     */
    addRow(containerEl) {
        const fields = containerEl._fields;
        const newRow = {};
        
        fields.forEach(field => {
            if (field.default !== undefined) {
                newRow[field.key] = field.default;
            } else if (field.type === 'number') {
                newRow[field.key] = 0;
            } else if (field.type === 'select' && field.options && field.options.length > 0) {
                newRow[field.key] = '';
            } else {
                newRow[field.key] = '';
            }
        });

        containerEl._data.push(newRow);
        this.render(containerEl);
        this._triggerChange(containerEl);
    },

    /**
     * Remove a row by index
     * @param {HTMLElement} containerEl
     * @param {number} index
     */
    removeRow(containerEl, index) {
        containerEl._data.splice(index, 1);
        this.render(containerEl);
        this._triggerChange(containerEl);
    },

    /**
     * Update a row value
     * @param {HTMLElement} containerEl
     * @param {number} index
     * @param {string} key
     * @param {*} value
     */
    updateRow(containerEl, index, key, value) {
        if (containerEl._data[index]) {
            containerEl._data[index][key] = value;
            this._triggerChange(containerEl);
        }
    },

    /**
     * Trigger onChange callback
     * @param {HTMLElement} containerEl
     * @private
     */
    _triggerChange(containerEl) {
        if (containerEl._onChange) {
            containerEl._onChange([...containerEl._data]);
        }
    },

    /**
     * Create an input element for a field
     * @param {Object} field - Field definition
     * @param {*} value - Current value
     * @param {number} rowIndex - Row index
     * @param {HTMLElement} containerEl - Container element
     * @returns {HTMLElement}
     */
    _createFieldInput(field, value, rowIndex, containerEl) {
        const { key, type, options = [], min, max, step, placeholder = '' } = field;

        let input;

        if (type === 'select') {
            input = document.createElement('select');
            input.className = 'editor-select';
            
            // Add empty option
            const emptyOpt = document.createElement('option');
            emptyOpt.value = '';
            emptyOpt.textContent = placeholder || 'Select...';
            input.appendChild(emptyOpt);

            options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt.value;
                option.textContent = opt.label;
                if (opt.value == value || opt.label === value) {
                    option.selected = true;
                }
                input.appendChild(option);
            });
        } else {
            input = document.createElement('input');
            input.className = 'editor-input';
            input.type = type || 'text';
            input.value = value || '';
            input.placeholder = placeholder;
            
            if (type === 'number') {
                if (min !== undefined) input.min = min;
                if (max !== undefined) input.max = max;
                if (step !== undefined) input.step = step;
                input.style.width = '80px';
            }
        }

        // Change handler
        input.addEventListener('change', () => {
            let newValue = input.value;
            if (type === 'number') {
                newValue = parseFloat(newValue) || 0;
            }
            this.updateRow(containerEl, rowIndex, key, newValue);
        });

        return input;
    },

    /**
     * Render the grid
     * @param {HTMLElement} containerEl
     */
    render(containerEl) {
        const rowsContainer = containerEl._rowsContainer;
        const data = containerEl._data;
        const fields = containerEl._fields;
        const emptyText = containerEl._emptyText;
        const onRenderRow = containerEl._onRenderRow;

        rowsContainer.innerHTML = '';

        if (data.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'json-grid-empty';
            empty.textContent = emptyText;
            rowsContainer.appendChild(empty);
            return;
        }

        data.forEach((rowData, index) => {
            const row = document.createElement('div');
            row.className = 'json-grid-row';
            row.dataset.index = index;

            // Create field inputs
            fields.forEach(field => {
                const value = rowData[field.key];
                
                const fieldWrapper = document.createElement('div');
                fieldWrapper.className = 'field-group';
                if (field.flex) fieldWrapper.style.flex = field.flex;
                
                const input = this._createFieldInput(field, value, index, containerEl);
                fieldWrapper.appendChild(input);
                row.appendChild(fieldWrapper);
            });

            // Custom render callback
            if (onRenderRow) {
                onRenderRow(row, rowData, index);
            }

            // Remove button
            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'json-grid-remove-btn';
            removeBtn.textContent = 'Remove';
            removeBtn.addEventListener('click', () => {
                this.removeRow(containerEl, index);
            });
            row.appendChild(removeBtn);

            rowsContainer.appendChild(row);
        });
    }
};

export default JSONGridEditor;


