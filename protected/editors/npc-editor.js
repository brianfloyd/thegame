/**
 * NPC Editor - Alpine.js Component
 * 
 * Uses actual database schema columns from scriptable_npcs table.
 */

import { EditorBase } from '/js/editorShared/EditorBase.js';
import {
    NPC_TYPES,
    NPC_TYPE_LABELS,
    mapRowToNpc,
    mapRowsToNpcs,
    validateNpc,
    getNpcTypeLabel,
    isHarvestable,
    createDefaultOutputItem,
    createDefaultHarvestPrerequisite
} from '/js/models/npc.js';

// Make npcEditor available globally for Alpine.js
window.npcEditor = function() {
    return {
        // ============================================
        // STATE
        // ============================================
        
        // List data
        npcs: [],
        filteredNpcs: [],
        
        // Related data
        allItems: [],
        npcTypes: [], // Will be loaded from database
        
        // New output item form
        newOutputItem: {
            itemName: '',
            quantity: 1,
            chance: 1.0
        },
        
        // New harvest prerequisite form
        newHarvestPrerequisite: {
            itemName: ''
        },
        
        // Selection
        selectedNpc: null,
        isCreating: false,
        
        // Loading state
        loading: false,
        
        // Filters
        filters: {
            search: '',
            type: 'all', // 'all', 'scriptable', 'lorekeeper'
            harvestableOnly: false
        },
        
        // Form data - matches actual scriptable_npcs table columns
        formData: {
            name: '',
            description: '',
            npc_type: 'neutral',
            base_cycle_time: 5000,
            difficulty: 1,
            harvestable_time: 60000,
            cooldown_time: 120000,
            required_stats: {},
            required_buffs: [],
            input_items: [],
            output_items: [],
            harvest_prerequisite_items: [],
            failure_states: [],
            harvest_prerequisite_message: '',
            display_color: '#00ff00',
            scriptable: true,
            active: true,
            pulse_echo_yield: 1
        },
        
        // Notification
        notification: {
            show: false,
            message: '',
            type: 'info'
        },
        
        // Active tab
        activeTab: 'basic',
        
        // Room placement data
        placements: [],
        allMaps: [],
        roomsForMap: [],
        selectedMapId: null,
        
        // New room placement form
        newPlacement: {
            mapId: null,
            roomId: null,
            slot: 0
        },
        
        // Lorekeeper history data
        lorekeeperHistory: {
            greetings: [],
            itemAwards: []
        },
        
        // Lorekeeper form data
        lorekeeperData: {
            lore_type: 'dialogue',
            engagement_enabled: true,
            engagement_delay: 3000,
            initial_message: '',
            initial_message_color: '#00ffff',
            keywords_responses: {},
            keyword_color: '#ff00ff',
            incorrect_response: 'I do not understand what you mean.',
            puzzle_mode: null,
            puzzle_clues: {},
            puzzle_solution: '',
            puzzle_success_message: '',
            puzzle_failure_message: 'That is not the answer I seek.',
            puzzle_reward_item: null,
            puzzle_award_once_only: false,
            puzzle_award_after_delay: false,
            puzzle_award_delay_seconds: null,
            puzzle_award_delay_response: null
        },
        
        // Constants for template
        NPC_TYPES,
        NPC_TYPE_LABELS,

        // ============================================
        // LIFECYCLE
        // ============================================
        
        init() {
            console.log('[NPCEditor] Initializing...');
            
            EditorBase.init({
                onReady: (socket) => {
                    console.log('[NPCEditor] EditorBase ready, loading NPCs...');
                    this.loadNpcs();
                    // Items are loaded via getAllItems in onReady
                    this.loadMaps();
                },
                onMessage: (data) => {
                    this.handleMessage(data);
                },
                onError: (error) => {
                    this.showNotification('Connection error: ' + error.message, 'error');
                }
            });
            
            window.addEventListener('beforeunload', () => {
                EditorBase.setNavigatingAway(true);
            });
        },

        // ============================================
        // WEBSOCKET HANDLERS
        // ============================================
        
        handleMessage(data) {
            console.log('[NPCEditor] Message:', data.type, data);
            
            switch (data.type) {
                case 'npcList':
                    console.log('[NPCEditor] Received npcs:', data.npcs?.length || 0);
                    // Map using the canonical model which normalizes output_items
                    // IMPORTANT: mapRowToNpc now preserves the lorekeeper property
                    this.npcs = mapRowsToNpcs(data.npcs || []);
                    
                    // Debug: Check if lorekeeper data is preserved
                    const lorekeeperNpcs = this.npcs.filter(n => n.npc_type === 'lorekeeper');
                    if (lorekeeperNpcs.length > 0) {
                        console.log('[NPCEditor] Found lorekeeper NPCs:', lorekeeperNpcs.map(n => ({
                            id: n.id,
                            name: n.name,
                            hasLorekeeper: !!n.lorekeeper,
                            lorekeeper: n.lorekeeper
                        })));
                    }
                    
                    // Extract unique NPC types from the database
                    const uniqueTypes = new Set();
                    this.npcs.forEach(npc => {
                        if (npc.npc_type) {
                            uniqueTypes.add(npc.npc_type);
                        }
                    });
                    this.npcTypes = Array.from(uniqueTypes).sort();
                    console.log('[NPCEditor] Loaded NPC types from database:', this.npcTypes);
                    
                    // If a NPC is already selected, ensure its type is in the list
                    if (this.selectedNpc && this.selectedNpc.npc_type && !this.npcTypes.includes(this.selectedNpc.npc_type)) {
                        this.npcTypes.push(this.selectedNpc.npc_type);
                        this.npcTypes.sort();
                    }
                    
                    // Debug: Check first NPC's data
                    if (this.npcs.length > 0) {
                        const firstNpc = this.npcs[0];
                        console.log('[NPCEditor] First NPC name:', firstNpc.name);
                        console.log('[NPCEditor] First NPC raw output_items from DB:', data.npcs[0]?.output_items);
                        console.log('[NPCEditor] First NPC normalized output_items:', firstNpc.output_items);
                        console.log('[NPCEditor] First NPC raw harvest_prerequisite_item from DB:', data.npcs[0]?.harvest_prerequisite_item);
                        console.log('[NPCEditor] First NPC normalized harvest_prerequisite_items:', firstNpc.harvest_prerequisite_items);
                        console.log('[NPCEditor] First NPC output_distribution:', firstNpc.output_distribution);
                    }
                    this.applyFilter();
                    this.loading = false;
                    break;
                    
                case 'npcCreated':
                    if (data.npc) {
                        const npc = mapRowToNpc(data.npc);
                        this.npcs.push(npc);
                        this.applyFilter();
                        this.selectNpc(npc);
                        this.showNotification('NPC created', 'success');
                    }
                    this.loading = false;
                    this.isCreating = false;
                    break;
                    
                case 'npcUpdated':
                    if (data.npc) {
                        const npc = mapRowToNpc(data.npc);
                        const idx = this.npcs.findIndex(n => n.id === npc.id);
                        if (idx !== -1) {
                            this.npcs[idx] = npc;
                        }
                        if (this.selectedNpc && this.selectedNpc.id === npc.id) {
                            this.selectedNpc = npc;
                            this.populateForm(npc);
                        }
                        this.applyFilter();
                        this.showNotification('NPC updated', 'success');
                    }
                    this.loading = false;
                    break;
                    
                case 'npcDeleted':
                    if (data.npcId) {
                        this.npcs = this.npcs.filter(n => n.id !== data.npcId);
                        if (this.selectedNpc && this.selectedNpc.id === data.npcId) {
                            this.selectedNpc = null;
                            this.resetForm();
                        }
                        this.applyFilter();
                        this.showNotification('NPC deleted', 'success');
                    }
                    this.loading = false;
                    break;
                    
                case 'itemList':
                    this.allItems = data.items || [];
                    break;
                    
                case 'loreKeeperHistory':
                    this.lorekeeperHistory = {
                        greetings: data.greetings || [],
                        itemAwards: data.itemAwards || []
                    };
                    this.loading = false;
                    break;
                    
                case 'error':
                    this.showNotification(data.message || 'An error occurred', 'error');
                    this.loading = false;
                    break;
            }
        },

        // ============================================
        // DATA LOADING
        // ============================================
        
        loadNpcs() {
            this.loading = true;
            EditorBase.send({ type: 'getAllNPCs' });
            EditorBase.send({ type: 'getAllItems' });
        },
        
        loadAllItems() {
            EditorBase.send({ type: 'getAllItems' });
        },

        // ============================================
        // FILTERING
        // ============================================
        
        applyFilter() {
            let filtered = [...this.npcs];
            
            if (this.filters.search) {
                const search = this.filters.search.toLowerCase();
                filtered = filtered.filter(npc => 
                    npc.name.toLowerCase().includes(search) ||
                    npc.description.toLowerCase().includes(search)
                );
            }
            
            if (this.filters.type !== 'all') {
                if (this.filters.type === 'lorekeeper') {
                    // Show only lorekeeper NPCs
                    filtered = filtered.filter(npc => npc.npc_type === 'lorekeeper');
                } else if (this.filters.type === 'scriptable') {
                    // Show all NPCs except lorekeeper
                    filtered = filtered.filter(npc => npc.npc_type !== 'lorekeeper');
                }
            }
            
            if (this.filters.harvestableOnly) {
                filtered = filtered.filter(npc => npc.npc_type === 'harvestable');
            }
            
            this.filteredNpcs = filtered;
        },

        // ============================================
        // SELECTION
        // ============================================
        
        selectNpc(npc) {
            console.log('[NPCEditor] selectNpc called for:', npc.name, 'type:', npc.npc_type, 'has lorekeeper:', !!npc.lorekeeper);
            this.selectedNpc = npc;
            this.isCreating = false;
            
            // Ensure the NPC's type is in the npcTypes list
            if (npc.npc_type && !this.npcTypes.includes(npc.npc_type)) {
                this.npcTypes.push(npc.npc_type);
                this.npcTypes.sort();
            }
            
            // Reset to basic tab when selecting NPC
            this.activeTab = 'basic';
            
            // Load placements for this NPC (don't set loading=true here, it's handled in loadPlacements)
            if (npc.id) {
                this.loadPlacements(npc.id);
            }
            
            // Load lorekeeper history if this is a lorekeeper
            if (npc.npc_type === 'lorekeeper' && npc.id) {
                this.loadLoreKeeperHistory(npc.id);
            }
            
            this.populateForm(npc);
        },
        
        populateForm(npc) {
            console.log('[NPCEditor] populateForm - raw npc.output_items:', npc.output_items, typeof npc.output_items);
            
            // output_items should already be normalized by mapRowToNpc
            // Use the normalized data directly, but ensure it's always an array
            let outputItems = [];
            console.log('[NPCEditor] populateForm - npc.output_items check:', {
                isArray: Array.isArray(npc.output_items),
                length: npc.output_items?.length,
                value: npc.output_items,
                type: typeof npc.output_items
            });
            if (Array.isArray(npc.output_items)) {
                // Already normalized by mapRowToNpc, use as-is
                outputItems = npc.output_items.map(item => ({
                    item_name: item.item_name || item.itemName || '',
                    quantity: item.quantity || 1,
                    chance: item.chance !== undefined ? item.chance : 1.0
                })).filter(item => item.item_name); // Filter out empty items
            } else if (npc.output_items && typeof npc.output_items === 'object' && !Array.isArray(npc.output_items)) {
                // Fallback: if somehow still an object (shouldn't happen after normalization), normalize it
                console.warn('[NPCEditor] output_items is still an object, normalizing:', npc.output_items);
                for (const [itemName, value] of Object.entries(npc.output_items)) {
                    if (typeof value === 'number') {
                        outputItems.push({
                            item_name: itemName,
                            quantity: value,
                            chance: 1.0
                        });
                    } else if (typeof value === 'object' && value !== null) {
                        outputItems.push({
                            item_name: itemName,
                            quantity: value.quantity || 1,
                            chance: value.chance !== undefined ? value.chance : 1.0
                        });
                    }
                }
            } else if (npc.output_items) {
                // Try to parse if it's a string
                try {
                    const parsed = typeof npc.output_items === 'string' ? JSON.parse(npc.output_items) : npc.output_items;
                    if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                        for (const [itemName, value] of Object.entries(parsed)) {
                            if (typeof value === 'number') {
                                outputItems.push({
                                    item_name: itemName,
                                    quantity: value,
                                    chance: 1.0
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[NPCEditor] Failed to parse output_items:', e);
                }
            }
            
            console.log('[NPCEditor] populateForm - normalized outputItems:', outputItems);
            
            // Ensure harvest_prerequisite_items is always an array
            let harvestPrereqs = [];
            if (Array.isArray(npc.harvest_prerequisite_items) && npc.harvest_prerequisite_items.length > 0) {
                harvestPrereqs = npc.harvest_prerequisite_items.map(item => ({
                    item_name: item.item_name || item.itemName || ''
                })).filter(item => item.item_name); // Filter out empty items
            }
            
            this.formData = {
                name: npc.name,
                description: npc.description,
                npc_type: npc.npc_type,
                base_cycle_time: npc.base_cycle_time,
                difficulty: npc.difficulty,
                harvestable_time: npc.harvestable_time,
                cooldown_time: npc.cooldown_time,
                required_stats: npc.required_stats || {},
                required_buffs: npc.required_buffs || [],
                output_items: outputItems,
                output_distribution: npc.output_distribution || 'ground',
                harvest_prerequisite_items: harvestPrereqs,
                harvest_prerequisite_message: npc.harvest_prerequisite_message || '',
                failure_states: npc.failure_states || [],
                display_color: npc.display_color,
                scriptable: npc.scriptable,
                active: npc.active,
                pulse_echo_yield: npc.pulse_echo_yield
            };
            
            // Populate lorekeeper data if this is a lorekeeper
            if (npc.npc_type === 'lorekeeper') {
                console.log('[NPCEditor] Populating lorekeeper data for:', npc.name, 'lorekeeper object:', npc.lorekeeper);
                if (npc.lorekeeper) {
                    const lk = npc.lorekeeper;
                    this.lorekeeperData = {
                        lore_type: lk.lore_type || 'dialogue',
                        engagement_enabled: lk.engagement_enabled !== false,
                        engagement_delay: lk.engagement_delay || 3000,
                        initial_message: lk.initial_message || '',
                        initial_message_color: lk.initial_message_color || '#00ffff',
                        keywords_responses: typeof lk.keywords_responses === 'string' 
                            ? (lk.keywords_responses ? JSON.parse(lk.keywords_responses) : {})
                            : (lk.keywords_responses || {}),
                        keyword_color: lk.keyword_color || '#ff00ff',
                        incorrect_response: lk.incorrect_response || 'I do not understand what you mean.',
                    puzzle_mode: lk.puzzle_mode || null,
                    puzzle_clues: (() => {
                        // Handle puzzle_clues as array of objects: [{"keyword": "key", "answer": "value"}]
                        // But convert to object format for display: {"key": "value"}
                        if (!lk.puzzle_clues) return {};
                        if (typeof lk.puzzle_clues === 'string') {
                            try {
                                const parsed = JSON.parse(lk.puzzle_clues);
                                // If it's an array, convert to object for display
                                if (Array.isArray(parsed)) {
                                    const obj = {};
                                    parsed.forEach(item => {
                                        if (item && typeof item === 'object' && item.keyword && item.answer) {
                                            obj[item.keyword] = item.answer;
                                        }
                                    });
                                    return obj;
                                }
                                // If it's an object (legacy format), return as-is for display
                                if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                                    return parsed;
                                }
                                return {};
                            } catch (e) {
                                console.warn('[NPCEditor] Failed to parse puzzle_clues:', e);
                                return {};
                            }
                        }
                        // If it's already an array, convert to object for display
                        if (Array.isArray(lk.puzzle_clues)) {
                            const obj = {};
                            lk.puzzle_clues.forEach(item => {
                                if (item && typeof item === 'object' && item.keyword && item.answer) {
                                    obj[item.keyword] = item.answer;
                                }
                            });
                            return obj;
                        }
                        // If it's already an object, return it
                        if (typeof lk.puzzle_clues === 'object' && lk.puzzle_clues !== null) {
                            return lk.puzzle_clues;
                        }
                        return {};
                    })(),
                        puzzle_solution: lk.puzzle_solution || '',
                        puzzle_success_message: lk.puzzle_success_message || '',
                        puzzle_failure_message: lk.puzzle_failure_message || 'That is not the answer I seek.',
                        puzzle_reward_item: lk.puzzle_reward_item || null,
                        puzzle_award_once_only: lk.puzzle_award_once_only || false,
                        puzzle_award_after_delay: lk.puzzle_award_after_delay || false,
                        puzzle_award_delay_seconds: lk.puzzle_award_delay_seconds || null,
                        puzzle_award_delay_response: lk.puzzle_award_delay_response || null
                    };
                    console.log('[NPCEditor] Populated lorekeeperData:', this.lorekeeperData);
                } else {
                    console.warn('[NPCEditor] NPC is lorekeeper type but has no lorekeeper data:', npc);
                    // Initialize with defaults if no data exists
                    this.lorekeeperData = {
                        lore_type: 'dialogue',
                        engagement_enabled: true,
                        engagement_delay: 3000,
                        initial_message: '',
                        initial_message_color: '#00ffff',
                        keywords_responses: {},
                        keyword_color: '#ff00ff',
                        incorrect_response: 'I do not understand what you mean.',
                        puzzle_mode: null,
                        puzzle_clues: {},
                        puzzle_solution: '',
                        puzzle_success_message: '',
                        puzzle_failure_message: 'That is not the answer I seek.',
                        puzzle_reward_item: null,
                        puzzle_award_once_only: false,
                        puzzle_award_after_delay: false,
                        puzzle_award_delay_seconds: null,
                        puzzle_award_delay_response: null
                    };
                }
            } else {
                // Reset lorekeeper data for non-lorekeeper NPCs
                this.lorekeeperData = {
                    lore_type: 'dialogue',
                    engagement_enabled: true,
                    engagement_delay: 3000,
                    initial_message: '',
                    initial_message_color: '#00ffff',
                    keywords_responses: {},
                    keyword_color: '#ff00ff',
                    incorrect_response: 'I do not understand what you mean.',
                    puzzle_mode: null,
                    puzzle_clues: {},
                    puzzle_solution: '',
                    puzzle_success_message: '',
                    puzzle_failure_message: 'That is not the answer I seek.',
                    puzzle_reward_item: null,
                    puzzle_award_once_only: false,
                    puzzle_award_after_delay: false,
                    puzzle_award_delay_seconds: null,
                    puzzle_award_delay_response: null
                };
            }
            
            console.log('[NPCEditor] Populated form for NPC:', npc.name);
            console.log('[NPCEditor] Output items:', outputItems);
            console.log('[NPCEditor] Harvest prerequisites:', harvestPrereqs);
        },
        
        resetForm() {
            this.formData = {
                name: '',
                description: '',
                npc_type: 'neutral',
                base_cycle_time: 5000,
                difficulty: 1,
                harvestable_time: 60000,
                cooldown_time: 120000,
                required_stats: {},
                required_buffs: [],
                output_items: [],
                output_distribution: 'ground',
                harvest_prerequisite_items: [],
                harvest_prerequisite_message: '',
                failure_states: [],
                display_color: '#00ff00',
                scriptable: true,
                active: true,
                pulse_echo_yield: 1
            };
        },

        // ============================================
        // CRUD OPERATIONS
        // ============================================
        
        createNpc() {
            this.selectedNpc = null;
            this.isCreating = true;
            this.resetForm();
        },
        
        saveNpc() {
            if (!this.formData.name.trim()) {
                this.showNotification('NPC name is required', 'error');
                return;
            }
            if (!this.formData.description.trim()) {
                this.showNotification('NPC description is required', 'error');
                return;
            }
            
            // Convert output_items array to legacy format for database: {"Item Name": quantity}
            // Database expects: {"Pulse Resin": 1} format, not array format
            const outputItemsForDb = {};
            if (Array.isArray(this.formData.output_items)) {
                this.formData.output_items.forEach(item => {
                    if (item.item_name) {
                        // Store as simple format: {"Item Name": quantity}
                        // Note: chance is not stored in legacy format, only quantity
                        outputItemsForDb[item.item_name] = item.quantity || 1;
                    }
                });
            }
            
            // Convert harvest_prerequisite_items array to database format
            // Database stores as JSON array: [{"item_name": "Harvester Rune"}]
            let harvestPrereqsForDb = null;
            if (Array.isArray(this.formData.harvest_prerequisite_items) && this.formData.harvest_prerequisite_items.length > 0) {
                harvestPrereqsForDb = JSON.stringify(this.formData.harvest_prerequisite_items);
            }
            
            const npcData = {
                name: this.formData.name.trim(),
                description: this.formData.description.trim(),
                npc_type: this.formData.npc_type,
                base_cycle_time: parseInt(this.formData.base_cycle_time),
                difficulty: parseInt(this.formData.difficulty),
                harvestable_time: parseInt(this.formData.harvestable_time),
                cooldown_time: parseInt(this.formData.cooldown_time),
                required_stats: this.formData.required_stats,
                required_buffs: this.formData.required_buffs,
                input_items: [], // Not used in UI, keep as empty array for DB compatibility
                output_items: outputItemsForDb, // Convert to legacy format
                output_distribution: this.formData.output_distribution,
                harvest_prerequisite_items: harvestPrereqsForDb, // Store as JSON string
                harvest_prerequisite_message: this.formData.harvest_prerequisite_message || null,
                failure_states: this.formData.failure_states,
                display_color: this.formData.display_color,
                scriptable: this.formData.scriptable,
                active: this.formData.active,
                pulse_echo_yield: parseInt(this.formData.pulse_echo_yield)
            };
            
            // Add lorekeeper data if this is a lorekeeper
            if (this.formData.npc_type === 'lorekeeper') {
                npcData.lorekeeper = {
                    lore_type: this.lorekeeperData.lore_type,
                    engagement_enabled: this.lorekeeperData.engagement_enabled,
                    engagement_delay: parseInt(this.lorekeeperData.engagement_delay) || 3000,
                    initial_message: this.lorekeeperData.initial_message || null,
                    initial_message_color: this.lorekeeperData.initial_message_color || '#00ffff',
                    keywords_responses: Object.keys(this.lorekeeperData.keywords_responses || {}).length > 0
                        ? JSON.stringify(this.lorekeeperData.keywords_responses)
                        : null,
                    keyword_color: this.lorekeeperData.keyword_color || '#ff00ff',
                    incorrect_response: this.lorekeeperData.incorrect_response || 'I do not understand what you mean.',
                    puzzle_mode: this.lorekeeperData.puzzle_mode || null,
                    puzzle_clues: (() => {
                        // Convert from display format (object) to storage format (array of objects)
                        const clues = this.lorekeeperData.puzzle_clues;
                        if (!clues || typeof clues !== 'object' || Array.isArray(clues)) {
                            return null;
                        }
                        // Check if object has any keys
                        if (Object.keys(clues).length === 0) {
                            return null;
                        }
                        // Convert object to array format: [{"keyword": "key", "answer": "value"}]
                        const clueArray = Object.entries(clues).map(([keyword, answer]) => ({
                            keyword: keyword,
                            answer: answer
                        }));
                        return JSON.stringify(clueArray);
                    })(),
                    puzzle_solution: this.lorekeeperData.puzzle_solution || null,
                    puzzle_success_message: this.lorekeeperData.puzzle_success_message || null,
                    puzzle_failure_message: this.lorekeeperData.puzzle_failure_message || 'That is not the answer I seek.',
                    puzzle_reward_item: this.lorekeeperData.puzzle_reward_item || null,
                    puzzle_award_once_only: this.lorekeeperData.puzzle_award_once_only || false,
                    puzzle_award_after_delay: this.lorekeeperData.puzzle_award_after_delay || false,
                    puzzle_award_delay_seconds: this.lorekeeperData.puzzle_award_delay_seconds || null,
                    puzzle_award_delay_response: this.lorekeeperData.puzzle_award_delay_response || null
                };
            }
            
            this.loading = true;
            
            if (this.isCreating) {
                EditorBase.send({ type: 'createNPC', npc: npcData });
            } else if (this.selectedNpc) {
                // Handler expects { npc: {...} } format with id included
                const updateData = {
                    ...npcData,
                    id: this.selectedNpc.id
                };
                EditorBase.send({ 
                    type: 'updateNPC', 
                    npc: updateData
                });
            }
        },
        
        deleteNpc() {
            if (!this.selectedNpc) return;
            if (!confirm(`Delete NPC "${this.selectedNpc.name}"?`)) return;
            
            this.loading = true;
            EditorBase.send({ type: 'deleteNPC', npcId: this.selectedNpc.id });
        },

        // ============================================
        // OUTPUT ITEMS MANAGEMENT
        // ============================================
        
        addOutputItem() {
            if (!this.newOutputItem.itemName) {
                this.showNotification('Please select an item', 'error');
                return;
            }
            
            // Check if item already exists
            const existingIndex = this.formData.output_items.findIndex(
                item => item.item_name === this.newOutputItem.itemName
            );
            
            if (existingIndex !== -1) {
                // Update existing item quantity
                this.formData.output_items[existingIndex].quantity += parseInt(this.newOutputItem.quantity) || 1;
                this.showNotification('Item quantity updated', 'info');
            } else {
                // Add new item - ensure item_name is set correctly
                const newItem = {
                    item_name: this.newOutputItem.itemName,
                    quantity: parseInt(this.newOutputItem.quantity) || 1,
                    chance: parseFloat(this.newOutputItem.chance) || 1.0
                };
                console.log('[NPCEditor] Adding output item:', newItem);
                this.formData.output_items.push(newItem);
            }
            
            // Reset form
            this.newOutputItem = {
                itemName: '',
                quantity: 1,
                chance: 1.0
            };
        },
        
        removeOutputItem(index) {
            if (index >= 0 && index < this.formData.output_items.length) {
                this.formData.output_items.splice(index, 1);
            }
        },
        
        addHarvestPrerequisite() {
            if (!this.newHarvestPrerequisite.itemName) {
                this.showNotification('Please select an item', 'error');
                return;
            }
            
            // Check if item already exists
            const existingIndex = this.formData.harvest_prerequisite_items.findIndex(
                item => item.item_name === this.newHarvestPrerequisite.itemName
            );
            
            if (existingIndex !== -1) {
                this.showNotification('Item already in prerequisites', 'info');
                return;
            }
            
            // Add new item
            this.formData.harvest_prerequisite_items.push({
                item_name: this.newHarvestPrerequisite.itemName
            });
            
            // Reset form
            this.newHarvestPrerequisite = {
                itemName: ''
            };
        },
        
        removeHarvestPrerequisite(index) {
            if (index >= 0 && index < this.formData.harvest_prerequisite_items.length) {
                this.formData.harvest_prerequisite_items.splice(index, 1);
            }
        },

        // ============================================
        // UTILITIES
        // ============================================
        
        handleJsonInput(fieldName, value) {
            try {
                const parsed = JSON.parse(value);
                this.formData[fieldName] = parsed;
            } catch (e) {
                // Invalid JSON, keep current value
            }
        },
        
        handleLorekeeperJsonInput(fieldName, value) {
            try {
                const parsed = JSON.parse(value);
                // For puzzle_clues, convert from array format to object format for display
                if (fieldName === 'puzzle_clues') {
                    if (Array.isArray(parsed)) {
                        // Convert array format to object format for display
                        const obj = {};
                        parsed.forEach(item => {
                            if (item && typeof item === 'object' && item.keyword && item.answer) {
                                obj[item.keyword] = item.answer;
                            }
                        });
                        this.lorekeeperData[fieldName] = obj;
                    } else if (typeof parsed === 'object' && parsed !== null) {
                        // Already in object format (display format)
                        this.lorekeeperData[fieldName] = parsed;
                    } else {
                        this.lorekeeperData[fieldName] = {};
                    }
                } else {
                    this.lorekeeperData[fieldName] = parsed;
                }
            } catch (e) {
                // Invalid JSON, keep current value but show warning
                console.warn(`[NPCEditor] Invalid JSON for ${fieldName}:`, e);
            }
        },
        
        // ============================================
        // ROOM PLACEMENT MANAGEMENT
        // ============================================
        
        loadPlacements(npcId) {
            if (!npcId) return;
            // Don't set loading=true here - it will interfere with other operations
            // The handler will clear loading when it responds
            EditorBase.send({
                type: 'getNpcPlacements',
                npcId: npcId
            });
        },
        
        loadMaps() {
            EditorBase.send({
                type: 'getNpcPlacementMaps'
            });
        },
        
        loadRoomsForMap(mapId) {
            if (!mapId) {
                this.roomsForMap = [];
                return;
            }
            this.selectedMapId = mapId;
            this.newPlacement.mapId = mapId;
            this.newPlacement.roomId = null; // Reset room when map changes
            EditorBase.send({
                type: 'getNpcPlacementRooms',
                mapId: mapId
            });
        },
        
        addPlacement() {
            if (!this.selectedNpc || !this.newPlacement.mapId || !this.newPlacement.roomId) {
                this.showNotification('Please select a map and room', 'error');
                return;
            }
            
            this.loading = true;
            EditorBase.send({
                type: 'addNpcToRoom',
                npcId: this.selectedNpc.id,
                roomId: this.newPlacement.roomId,
                slot: parseInt(this.newPlacement.slot) || 0
            });
            
            // Reset form
            this.newPlacement = {
                mapId: null,
                roomId: null,
                slot: 0
            };
            this.selectedMapId = null;
            this.roomsForMap = [];
        },
        
        removePlacement(placementId) {
            if (!placementId) return;
            
            this.loading = true;
            EditorBase.send({
                type: 'removeNpcFromRoom',
                placementId: placementId,
                npcId: this.selectedNpc?.id
            });
        },
        
        // ============================================
        // ROOM PLACEMENT MANAGEMENT
        // ============================================
        
        loadPlacements(npcId) {
            if (!npcId) return;
            // Don't set loading=true here - it will interfere with other operations
            // The handler will clear loading when it responds
            EditorBase.send({
                type: 'getNpcPlacements',
                npcId: npcId
            });
        },
        
        loadMaps() {
            EditorBase.send({
                type: 'getNpcPlacementMaps'
            });
        },
        
        loadRoomsForMap(mapId) {
            if (!mapId) {
                this.roomsForMap = [];
                return;
            }
            this.selectedMapId = mapId;
            this.newPlacement.mapId = mapId;
            this.newPlacement.roomId = null; // Reset room when map changes
            EditorBase.send({
                type: 'getNpcPlacementRooms',
                mapId: mapId
            });
        },
        
        addPlacement() {
            if (!this.selectedNpc || !this.newPlacement.mapId || !this.newPlacement.roomId) {
                this.showNotification('Please select a map and room', 'error');
                return;
            }
            
            this.loading = true;
            EditorBase.send({
                type: 'addNpcToRoom',
                npcId: this.selectedNpc.id,
                roomId: this.newPlacement.roomId,
                slot: parseInt(this.newPlacement.slot) || 0
            });
            
            // Reset form
            this.newPlacement = {
                mapId: null,
                roomId: null,
                slot: 0
            };
            this.selectedMapId = null;
            this.roomsForMap = [];
        },
        
        removePlacement(placementId) {
            if (!placementId) return;
            
            this.loading = true;
            EditorBase.send({
                type: 'removeNpcFromRoom',
                placementId: placementId,
                npcId: this.selectedNpc?.id
            });
        },
        
        // ============================================
        // LOREKEEPER HISTORY MANAGEMENT
        // ============================================
        
        loadLoreKeeperHistory(npcId) {
            if (!npcId) return;
            EditorBase.send({
                type: 'getLoreKeeperHistory',
                npcId: npcId
            });
        },
        
        clearLoreKeeperHistory(clearGreetings, clearItemAwards) {
            if (!this.selectedNpc || !this.selectedNpc.id) return;
            if (!confirm(`Clear ${clearGreetings && clearItemAwards ? 'all history' : clearGreetings ? 'greetings' : 'item awards'} for ${this.selectedNpc.name}?`)) return;
            
            this.loading = true;
            EditorBase.send({
                type: 'clearLoreKeeperHistory',
                npcId: this.selectedNpc.id,
                clearGreetings: clearGreetings || false,
                clearItemAwards: clearItemAwards || false
            });
        },
        
        showNotification(message, type = 'info') {
            this.notification = { show: true, message, type };
            setTimeout(() => {
                this.notification.show = false;
            }, 3000);
        },
        
        navigateTo(path) {
            EditorBase.setNavigatingAway(true);
            window.location.href = path;
        },
        
        formatDate(dateStr) {
            if (!dateStr) return 'N/A';
            return new Date(dateStr).toLocaleString();
        },
        
        getNpcTypeLabel(type) {
            return NPC_TYPE_LABELS[type] || type;
        }
    };
};
