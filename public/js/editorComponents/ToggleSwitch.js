/**
 * ToggleSwitch Component
 * 
 * A standardized toggle switch that replaces checkboxes across all editors.
 * Uses the existing game's neon-green retro styling.
 * 
 * Usage:
 *   const toggle = ToggleSwitch.create({
 *     id: 'recipeActive',
 *     label: 'Active',
 *     checked: true,
 *     onChange: (checked) => console.log('Toggle:', checked)
 *   });
 *   container.appendChild(toggle);
 */

export const ToggleSwitch = {
    /**
     * Create a toggle switch element
     * @param {Object} options
     * @param {string} [options.id] - Input ID
     * @param {string} [options.name] - Input name
     * @param {string} [options.label=''] - Label text (displayed after toggle)
     * @param {boolean} [options.checked=false] - Initial checked state
     * @param {boolean} [options.disabled=false] - Disabled state
     * @param {boolean} [options.small=false] - Use small variant
     * @param {Function} [options.onChange] - Callback when toggle changes
     * @returns {HTMLElement}
     */
    create(options = {}) {
        const { 
            id = null, 
            name = null,
            label = '', 
            checked = false, 
            disabled = false,
            small = false,
            onChange = null 
        } = options;

        const wrapper = document.createElement('label');
        wrapper.className = 'toggle-switch' + (small ? ' toggle-switch--small' : '');

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        input.disabled = disabled;
        if (id) input.id = id;
        if (name) input.name = name;

        const slider = document.createElement('span');
        slider.className = 'toggle-slider';

        wrapper.appendChild(input);
        wrapper.appendChild(slider);

        if (label) {
            const labelText = document.createElement('span');
            labelText.className = 'toggle-label';
            labelText.textContent = label;
            wrapper.appendChild(labelText);
        }

        // Change handler
        if (onChange) {
            input.addEventListener('change', () => {
                onChange(input.checked);
            });
        }

        // Expose input for external access
        wrapper._input = input;

        return wrapper;
    },

    /**
     * Get the checked state of a toggle
     * @param {HTMLElement} toggleEl - The toggle wrapper element
     * @returns {boolean}
     */
    isChecked(toggleEl) {
        const input = toggleEl._input || toggleEl.querySelector('input[type="checkbox"]');
        return input ? input.checked : false;
    },

    /**
     * Set the checked state of a toggle
     * @param {HTMLElement} toggleEl - The toggle wrapper element
     * @param {boolean} checked - The new checked state
     */
    setChecked(toggleEl, checked) {
        const input = toggleEl._input || toggleEl.querySelector('input[type="checkbox"]');
        if (input) {
            input.checked = checked;
        }
    },

    /**
     * Set the disabled state of a toggle
     * @param {HTMLElement} toggleEl - The toggle wrapper element
     * @param {boolean} disabled - The new disabled state
     */
    setDisabled(toggleEl, disabled) {
        const input = toggleEl._input || toggleEl.querySelector('input[type="checkbox"]');
        if (input) {
            input.disabled = disabled;
        }
    },

    /**
     * Get the input element from a toggle wrapper
     * @param {HTMLElement} toggleEl - The toggle wrapper element
     * @returns {HTMLInputElement}
     */
    getInput(toggleEl) {
        return toggleEl._input || toggleEl.querySelector('input[type="checkbox"]');
    }
};

export default ToggleSwitch;

