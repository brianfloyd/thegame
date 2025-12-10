/**
 * ListSidebar Component
 * 
 * A reusable sidebar with search, list, and action buttons.
 * Used for the left panel of all editors.
 * 
 * Usage:
 *   const sidebar = ListSidebar.create({
 *     title: 'Recipes',
 *     searchPlaceholder: 'Search recipes...',
 *     items: recipes,
 *     renderItem: (recipe) => ({ name: recipe.name, meta: `ID: ${recipe.id}` }),
 *     onSelect: (recipe) => selectRecipe(recipe.id),
 *     onCreate: () => createNew(),
 *     onClone: () => cloneCurrent(),
 *     onDelete: () => deleteCurrent()
 *   });
 */

export const ListSidebar = {
    /**
     * Create a list sidebar element
     * @param {Object} options
     * @param {string} options.title - Sidebar title
     * @param {string} [options.searchPlaceholder='Search...'] - Search input placeholder
     * @param {Array} [options.items=[]] - Initial items array
     * @param {Function} options.renderItem - Function to render item: (item) => { name, meta, inactive? }
     * @param {Function} [options.getItemId] - Function to get item ID: (item) => id
     * @param {Function} [options.onSelect] - Callback when item selected: (item) => void
     * @param {Function} [options.onSearch] - Callback when search changes: (query) => void
     * @param {Function} [options.onCreate] - Callback for create button
     * @param {Function} [options.onClone] - Callback for clone button
     * @param {Function} [options.onDelete] - Callback for delete button
     * @returns {HTMLElement}
     */
    create(options) {
        const {
            title,
            searchPlaceholder = 'Search...',
            items = [],
            renderItem,
            getItemId = (item) => item.id,
            onSelect = null,
            onSearch = null,
            onCreate = null,
            onClone = null,
            onDelete = null
        } = options;

        const sidebar = document.createElement('div');
        sidebar.className = 'list-sidebar';

        // Header
        const header = document.createElement('div');
        header.className = 'list-sidebar-header';

        const titleEl = document.createElement('div');
        titleEl.className = 'list-sidebar-title';
        titleEl.textContent = title;
        header.appendChild(titleEl);

        // Search input
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'list-sidebar-search';
        searchInput.placeholder = searchPlaceholder;
        header.appendChild(searchInput);

        // Action buttons
        if (onCreate || onClone || onDelete) {
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'list-sidebar-actions';

            if (onCreate) {
                const createBtn = document.createElement('button');
                createBtn.className = 'list-sidebar-btn';
                createBtn.textContent = 'New';
                createBtn.addEventListener('click', onCreate);
                actionsDiv.appendChild(createBtn);
            }

            if (onClone) {
                const cloneBtn = document.createElement('button');
                cloneBtn.className = 'list-sidebar-btn';
                cloneBtn.textContent = 'Clone';
                cloneBtn.disabled = true;
                cloneBtn.addEventListener('click', onClone);
                actionsDiv.appendChild(cloneBtn);
                sidebar._cloneBtn = cloneBtn;
            }

            if (onDelete) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'list-sidebar-btn list-sidebar-btn--danger';
                deleteBtn.textContent = 'Delete';
                deleteBtn.disabled = true;
                deleteBtn.addEventListener('click', onDelete);
                actionsDiv.appendChild(deleteBtn);
                sidebar._deleteBtn = deleteBtn;
            }

            header.appendChild(actionsDiv);
        }

        sidebar.appendChild(header);

        // Content (list)
        const content = document.createElement('div');
        content.className = 'list-sidebar-content';
        sidebar.appendChild(content);

        // Store references
        sidebar._content = content;
        sidebar._searchInput = searchInput;
        sidebar._items = items;
        sidebar._selectedId = null;
        sidebar._renderItem = renderItem;
        sidebar._getItemId = getItemId;
        sidebar._onSelect = onSelect;
        sidebar._searchQuery = '';

        // Search handler
        searchInput.addEventListener('input', () => {
            sidebar._searchQuery = searchInput.value.toLowerCase();
            if (onSearch) {
                onSearch(sidebar._searchQuery);
            }
            this.render(sidebar);
        });

        // Initial render
        this.render(sidebar);

        return sidebar;
    },

    /**
     * Set items and re-render
     * @param {HTMLElement} sidebarEl
     * @param {Array} items
     */
    setItems(sidebarEl, items) {
        sidebarEl._items = items;
        this.render(sidebarEl);
    },

    /**
     * Set selected item ID
     * @param {HTMLElement} sidebarEl
     * @param {*} id
     */
    setSelected(sidebarEl, id) {
        sidebarEl._selectedId = id;
        
        // Enable/disable clone and delete buttons
        if (sidebarEl._cloneBtn) {
            sidebarEl._cloneBtn.disabled = !id;
        }
        if (sidebarEl._deleteBtn) {
            sidebarEl._deleteBtn.disabled = !id;
        }
        
        this.render(sidebarEl);
    },

    /**
     * Get selected item ID
     * @param {HTMLElement} sidebarEl
     * @returns {*}
     */
    getSelected(sidebarEl) {
        return sidebarEl._selectedId;
    },

    /**
     * Get search query
     * @param {HTMLElement} sidebarEl
     * @returns {string}
     */
    getSearchQuery(sidebarEl) {
        return sidebarEl._searchQuery || '';
    },

    /**
     * Render the list
     * @param {HTMLElement} sidebarEl
     */
    render(sidebarEl) {
        const content = sidebarEl._content;
        const items = sidebarEl._items || [];
        const renderItem = sidebarEl._renderItem;
        const getItemId = sidebarEl._getItemId;
        const onSelect = sidebarEl._onSelect;
        const selectedId = sidebarEl._selectedId;
        const searchQuery = sidebarEl._searchQuery || '';

        content.innerHTML = '';

        // Filter items by search
        const filtered = items.filter(item => {
            if (!searchQuery) return true;
            const rendered = renderItem(item);
            const name = (rendered.name || '').toLowerCase();
            const meta = (rendered.meta || '').toLowerCase();
            return name.includes(searchQuery) || meta.includes(searchQuery);
        });

        if (filtered.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'editor-hint';
            empty.textContent = searchQuery ? 'No matches found' : 'No items';
            content.appendChild(empty);
            return;
        }

        filtered.forEach(item => {
            const itemId = getItemId(item);
            const rendered = renderItem(item);

            const itemEl = document.createElement('div');
            itemEl.className = 'list-item' + (itemId === selectedId ? ' selected' : '');
            itemEl.dataset.itemId = itemId;

            const nameEl = document.createElement('div');
            nameEl.className = 'list-item-name';
            nameEl.textContent = rendered.name;
            itemEl.appendChild(nameEl);

            if (rendered.meta) {
                const metaEl = document.createElement('div');
                metaEl.className = 'list-item-meta' + (rendered.inactive ? ' inactive' : '');
                metaEl.textContent = rendered.meta;
                itemEl.appendChild(metaEl);
            }

            itemEl.addEventListener('click', () => {
                this.setSelected(sidebarEl, itemId);
                if (onSelect) {
                    onSelect(item);
                }
            });

            content.appendChild(itemEl);
        });
    }
};

export default ListSidebar;


