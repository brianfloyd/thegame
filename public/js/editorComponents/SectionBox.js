/**
 * SectionBox Component
 * 
 * A reusable boxed section container with title bar and optional collapsibility.
 * Used to group related fields in all editors.
 * 
 * Usage:
 *   const section = SectionBox.create({
 *     title: 'Required Ingredients',
 *     collapsible: true,
 *     collapsed: false,
 *     content: '<div>...</div>'
 *   });
 *   container.appendChild(section);
 */

export const SectionBox = {
    /**
     * Create a section box element
     * @param {Object} options
     * @param {string} options.title - Section title
     * @param {boolean} [options.collapsible=false] - Whether section can be collapsed
     * @param {boolean} [options.collapsed=false] - Initial collapsed state
     * @param {string|HTMLElement} [options.content] - Inner content (HTML string or element)
     * @param {string} [options.id] - Optional ID for the section
     * @returns {HTMLElement}
     */
    create(options) {
        const { 
            title, 
            collapsible = false, 
            collapsed = false, 
            content = '',
            id = null 
        } = options;

        const section = document.createElement('div');
        section.className = 'section-box' + (collapsible ? ' collapsible' : '') + (collapsed ? ' collapsed' : '');
        if (id) section.id = id;

        // Header
        const header = document.createElement('div');
        header.className = 'section-box-header';
        
        const titleEl = document.createElement('h4');
        titleEl.className = 'section-box-title';
        titleEl.textContent = title;
        header.appendChild(titleEl);

        // Content
        const contentEl = document.createElement('div');
        contentEl.className = 'section-box-content';
        
        if (typeof content === 'string') {
            contentEl.innerHTML = content;
        } else if (content instanceof HTMLElement) {
            contentEl.appendChild(content);
        }

        section.appendChild(header);
        section.appendChild(contentEl);

        // Collapsible behavior
        if (collapsible) {
            header.addEventListener('click', () => {
                section.classList.toggle('collapsed');
            });
        }

        // Expose content element for later manipulation
        section._contentEl = contentEl;
        section._headerEl = header;

        return section;
    },

    /**
     * Get the content element of a section box
     * @param {HTMLElement} sectionBox
     * @returns {HTMLElement}
     */
    getContent(sectionBox) {
        return sectionBox._contentEl || sectionBox.querySelector('.section-box-content');
    },

    /**
     * Set the content of a section box
     * @param {HTMLElement} sectionBox
     * @param {string|HTMLElement} content
     */
    setContent(sectionBox, content) {
        const contentEl = this.getContent(sectionBox);
        if (typeof content === 'string') {
            contentEl.innerHTML = content;
        } else {
            contentEl.innerHTML = '';
            contentEl.appendChild(content);
        }
    },

    /**
     * Toggle collapsed state
     * @param {HTMLElement} sectionBox
     * @param {boolean} [collapsed] - Force specific state
     */
    toggle(sectionBox, collapsed) {
        if (typeof collapsed === 'boolean') {
            sectionBox.classList.toggle('collapsed', collapsed);
        } else {
            sectionBox.classList.toggle('collapsed');
        }
    }
};

export default SectionBox;


