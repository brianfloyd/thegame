/**
 * FieldGrid Component
 * 
 * A CSS grid-based layout for form fields.
 * Supports 2, 3, or 4-column layouts with responsive behavior.
 * 
 * Usage:
 *   const grid = FieldGrid.create({ columns: 3 });
 *   grid.appendChild(FieldGrid.field({ label: 'Name', required: true, input: inputEl }));
 */

export const FieldGrid = {
    /**
     * Create a field grid container
     * @param {Object} options
     * @param {number} [options.columns=3] - Number of columns (2, 3, or 4)
     * @param {string} [options.className] - Additional class names
     * @returns {HTMLElement}
     */
    create(options = {}) {
        const { columns = 3, className = '' } = options;
        
        const grid = document.createElement('div');
        grid.className = `field-grid field-grid--${columns}col ${className}`.trim();
        
        return grid;
    },

    /**
     * Create a field group (label + input)
     * @param {Object} options
     * @param {string} options.label - Field label text
     * @param {boolean} [options.required=false] - Show required indicator
     * @param {HTMLElement} options.input - The input element
     * @param {boolean} [options.fullWidth=false] - Span full grid width
     * @param {string} [options.id] - Optional ID for the group
     * @returns {HTMLElement}
     */
    field(options) {
        const { label, required = false, input, fullWidth = false, id = null } = options;

        const group = document.createElement('div');
        group.className = 'field-group' + (fullWidth ? ' field-full' : '');
        if (id) group.id = id;

        const labelEl = document.createElement('label');
        labelEl.className = 'field-label';
        labelEl.innerHTML = label + (required ? ' <span class="required">*</span>' : '');
        
        if (input.id) {
            labelEl.setAttribute('for', input.id);
        }

        group.appendChild(labelEl);
        group.appendChild(input);

        return group;
    },

    /**
     * Create a text input element
     * @param {Object} options
     * @param {string} [options.id] - Input ID
     * @param {string} [options.value=''] - Initial value
     * @param {string} [options.placeholder=''] - Placeholder text
     * @param {string} [options.type='text'] - Input type
     * @param {number} [options.min] - Min value for number inputs
     * @param {number} [options.max] - Max value for number inputs
     * @param {number} [options.step] - Step value for number inputs
     * @returns {HTMLInputElement}
     */
    input(options = {}) {
        const { 
            id = null, 
            value = '', 
            placeholder = '', 
            type = 'text',
            min = null,
            max = null,
            step = null
        } = options;

        const input = document.createElement('input');
        input.className = 'editor-input';
        input.type = type;
        input.value = value;
        input.placeholder = placeholder;
        if (id) input.id = id;
        if (min !== null) input.min = min;
        if (max !== null) input.max = max;
        if (step !== null) input.step = step;

        return input;
    },

    /**
     * Create a select element
     * @param {Object} options
     * @param {string} [options.id] - Select ID
     * @param {Array<{value: string, label: string, selected?: boolean}>} options.options - Select options
     * @param {string} [options.value] - Selected value
     * @returns {HTMLSelectElement}
     */
    select(options = {}) {
        const { id = null, options: selectOptions = [], value = null } = options;

        const select = document.createElement('select');
        select.className = 'editor-select';
        if (id) select.id = id;

        selectOptions.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt.value;
            option.textContent = opt.label;
            if (opt.selected || opt.value === value) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        return select;
    },

    /**
     * Create a textarea element
     * @param {Object} options
     * @param {string} [options.id] - Textarea ID
     * @param {string} [options.value=''] - Initial value
     * @param {string} [options.placeholder=''] - Placeholder text
     * @param {number} [options.rows=3] - Number of rows
     * @returns {HTMLTextAreaElement}
     */
    textarea(options = {}) {
        const { id = null, value = '', placeholder = '', rows = 3 } = options;

        const textarea = document.createElement('textarea');
        textarea.className = 'editor-textarea';
        textarea.value = value;
        textarea.placeholder = placeholder;
        textarea.rows = rows;
        if (id) textarea.id = id;

        return textarea;
    }
};

export default FieldGrid;


