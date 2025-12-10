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
        
        // Selection
        selectedNpc: null,
        isCreating: false,
        
        // Loading state
        loading: false,
        
        // Filters
        filters: {
            search: '',
            type: 'all',
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
                    this.npcs = mapRowsToNpcs(data.npcs || []);
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
                filtered = filtered.filter(npc => npc.npc_type === this.filters.type);
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
            this.selectedNpc = npc;
            this.isCreating = false;
            this.populateForm(npc);
        },
        
        populateForm(npc) {
            console.log('[NPCEditor] populateForm - raw npc.output_items:', npc.output_items, typeof npc.output_items);
            
            // output_items should already be normalized by mapRowToNpc
            // Use the normalized data directly
            let outputItems = [];
            if (Array.isArray(npc.output_items)) {
                // Already normalized by mapRowToNpc, use as-is
                outputItems = npc.output_items.map(item => ({
                    item_name: item.item_name || '',
                    quantity: item.quantity || 1,
                    chance: item.chance !== undefined ? item.chance : 1.0
                }));
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
            } else {
                console.warn('[NPCEditor] output_items is not in expected format:', npc.output_items);
            }
            
            console.log('[NPCEditor] populateForm - normalized outputItems:', outputItems);
            
            // Ensure harvest_prerequisite_items is always an array
            let harvestPrereqs = [];
            if (Array.isArray(npc.harvest_prerequisite_items)) {
                harvestPrereqs = npc.harvest_prerequisite_items.map(item => ({
                    item_name: item.item_name || ''
                }));
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
                output_items: this.formData.output_items,
                output_distribution: this.formData.output_distribution,
                harvest_prerequisite_items: this.formData.harvest_prerequisite_items,
                harvest_prerequisite_message: this.formData.harvest_prerequisite_message || null,
                failure_states: this.formData.failure_states,
                display_color: this.formData.display_color,
                scriptable: this.formData.scriptable,
                active: this.formData.active,
                pulse_echo_yield: parseInt(this.formData.pulse_echo_yield)
            };
            
            this.loading = true;
            
            if (this.isCreating) {
                EditorBase.send({ type: 'createNPC', npc: npcData });
            } else if (this.selectedNpc) {
                EditorBase.send({ 
                    type: 'updateNPC', 
                    npcId: this.selectedNpc.id,
                    updates: npcData 
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
            this.formData.output_items.push(createDefaultOutputItem());
        },
        
        removeOutputItem(index) {
            this.formData.output_items.splice(index, 1);
        },
        
        addHarvestPrerequisite() {
            this.formData.harvest_prerequisite_items.push(createDefaultHarvestPrerequisite());
        },
        
        removeHarvestPrerequisite(index) {
            this.formData.harvest_prerequisite_items.splice(index, 1);
        },

        // ============================================
        // UTILITIES
        // ============================================
        
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
