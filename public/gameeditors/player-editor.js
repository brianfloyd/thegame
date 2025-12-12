/**
 * Player Editor - Alpine.js Component
 * 
 * Uses actual database schema columns from migrations.
 */

import { EditorBase } from '/js/editorShared/EditorBase.js';
import {
    PLAYER_STATS,
    PLAYER_ABILITIES,
    STAT_LABELS,
    ABILITY_LABELS,
    RESOURCE_LABELS,
    FLAG_LABELS,
    mapRowToPlayer,
    mapRowsToPlayers,
    validatePlayer
} from '/js/models/player.js';
import { parseMarkup } from '/js/utils/Markup.js';

// Make playerEditor available globally for Alpine.js
window.playerEditor = function() {
    return {
        // ============================================
        // STATE
        // ============================================
        
        players: [],
        filteredPlayers: [],
        selectedPlayer: null,
        loading: false,
        
        // Filters
        filters: {
            search: '',
            godModeOnly: false
        },
        
        // Form data - matches actual database columns
        formData: {
            name: '',
            // Stats
            stat_ingenuity: 5,
            stat_resonance: 5,
            stat_fortitude: 5,
            stat_acumen: 5,
            // Abilities
            ability_crafting: 0,
            ability_attunement: 0,
            ability_endurance: 0,
            ability_commerce: 0,
            // Resources
            resource_vitalis: 50,
            resource_max_vitalis: 100,
            resource_max_encumbrance: 100,
            // Points
            assignable_points: 5,
            // Flags
            flag_god_mode: 0,
            flag_always_first_time: 0,
            // Pulse
            pulse_echoes: 0,
            pulse_echo_tier: 1,
            // Attunement
            base_attunement_points: 10,
            base_attunement_cooldown_ms: 10000,
            base_attunement_delay_ms: 2000,
            // UI Settings
            auto_navigation_time_ms: 1000,
            loop_delay_ms: 1000,
            room_update_interval_ms: 30000
        },
        
        // Active tab
        activeTab: 'stats',
        
        // Inventory data
        inventoryData: {
            inventory: [],
            currentEncumbrance: 0
        },
        
        // New inventory item form
        newInventoryItem: {
            itemName: '',
            quantity: 1
        },
        
        // All items for dropdown
        allItems: [],
        
        // Notification
        notification: {
            show: false,
            message: '',
            type: 'info'
        },
        
        // Constants for template
        STAT_LABELS,
        ABILITY_LABELS,
        RESOURCE_LABELS,
        FLAG_LABELS,

        // ============================================
        // LIFECYCLE
        // ============================================
        
        init() {
            console.log('[PlayerEditor] Initializing...');
            
            EditorBase.init({
                onReady: (socket) => {
                    console.log('[PlayerEditor] EditorBase ready, loading players...');
                    this.loadPlayers();
                    this.loadAllItems();
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
            console.log('[PlayerEditor] Message:', data.type, data);
            
            switch (data.type) {
                case 'playerList':
                    console.log('[PlayerEditor] Received players:', data.players?.length || 0);
                    // Use raw data directly - it should already have the right fields
                    this.players = (data.players || []).map(p => ({
                        ...p,
                        flag_god_mode: p.flag_god_mode ?? 0
                    }));
                    console.log('[PlayerEditor] Mapped players:', this.players);
                    this.applyFilter();
                    this.loading = false;
                    break;
                    
                case 'playerData':
                    if (data.player) {
                        const player = mapRowToPlayer(data.player);
                        const idx = this.players.findIndex(p => p.id === player.id);
                        if (idx !== -1) {
                            this.players[idx] = player;
                        }
                        if (this.selectedPlayer && this.selectedPlayer.id === player.id) {
                            this.selectedPlayer = player;
                            this.populateForm(player);
                        }
                        this.applyFilter();
                    }
                    this.loading = false;
                    break;
                    
                case 'playerInventory':
                    this.inventoryData = {
                        inventory: data.inventory || [],
                        currentEncumbrance: data.currentEncumbrance || 0
                    };
                    this.loading = false;
                    break;
                    
                case 'playerInventoryUpdated':
                    this.inventoryData = {
                        inventory: data.inventory || [],
                        currentEncumbrance: data.currentEncumbrance || 0
                    };
                    this.showNotification('Inventory updated', 'success');
                    this.loading = false;
                    break;
                    
                case 'itemList':
                    this.allItems = data.items || [];
                    break;
                    
                case 'playerUpdated':
                    if (data.player) {
                        const player = mapRowToPlayer(data.player);
                        const idx = this.players.findIndex(p => p.id === player.id);
                        if (idx !== -1) {
                            this.players[idx] = player;
                        }
                        if (this.selectedPlayer && this.selectedPlayer.id === player.id) {
                            this.selectedPlayer = player;
                            this.populateForm(player);
                        }
                        this.applyFilter();
                        this.showNotification('Player updated', 'success');
                    }
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
        
        loadPlayers() {
            this.loading = true;
            EditorBase.send({ type: 'getAllPlayers' });
        },

        // ============================================
        // FILTERING
        // ============================================
        
        applyFilter() {
            let filtered = [...this.players];
            
            if (this.filters.search) {
                const search = this.filters.search.toLowerCase();
                filtered = filtered.filter(p => 
                    p.name.toLowerCase().includes(search)
                );
            }
            
            if (this.filters.godModeOnly) {
                filtered = filtered.filter(p => p.flag_god_mode === 1);
            }
            
            this.filteredPlayers = filtered;
        },

        // ============================================
        // SELECTION
        // ============================================
        
        selectPlayer(player) {
            this.selectedPlayer = player;
            this.populateForm(player);
            this.loadInventory(player.id);
        },
        
        loadInventory(playerId) {
            if (!playerId) return;
            this.loading = true;
            EditorBase.send({
                type: 'getPlayerInventory',
                playerId: playerId
            });
        },
        
        loadAllItems() {
            EditorBase.send({
                type: 'getAllItems'
            });
        },
        
        addInventoryItem() {
            if (!this.selectedPlayer || !this.newInventoryItem.itemName || !this.newInventoryItem.quantity) {
                this.showNotification('Please select an item and enter a quantity', 'error');
                return;
            }
            
            this.loading = true;
            EditorBase.send({
                type: 'addPlayerInventoryItem',
                playerId: this.selectedPlayer.id,
                itemName: this.newInventoryItem.itemName,
                quantity: parseInt(this.newInventoryItem.quantity) || 1
            });
            
            // Reset form
            this.newInventoryItem = {
                itemName: '',
                quantity: 1
            };
        },
        
        removeInventoryItem(itemName, quantity) {
            if (!this.selectedPlayer || !itemName || !quantity || quantity < 1) {
                this.showNotification('Please enter a valid quantity', 'error');
                return;
            }
            
            this.loading = true;
            EditorBase.send({
                type: 'removePlayerInventoryItem',
                playerId: this.selectedPlayer.id,
                itemName: itemName,
                quantity: parseInt(quantity) || 1
            });
        },
        
        populateForm(player) {
            this.formData = {
                name: player.name,
                // Stats
                stat_ingenuity: player.stat_ingenuity,
                stat_resonance: player.stat_resonance,
                stat_fortitude: player.stat_fortitude,
                stat_acumen: player.stat_acumen,
                // Abilities
                ability_crafting: player.ability_crafting,
                ability_attunement: player.ability_attunement,
                ability_endurance: player.ability_endurance,
                ability_commerce: player.ability_commerce,
                // Resources
                resource_vitalis: player.resource_vitalis,
                resource_max_vitalis: player.resource_max_vitalis,
                resource_max_encumbrance: player.resource_max_encumbrance,
                // Points
                assignable_points: player.assignable_points,
                // Flags
                flag_god_mode: player.flag_god_mode,
                flag_always_first_time: player.flag_always_first_time,
                // Pulse
                pulse_echoes: player.pulse_echoes,
                pulse_echo_tier: player.pulse_echo_tier,
                // Attunement
                base_attunement_points: player.base_attunement_points,
                base_attunement_cooldown_ms: player.base_attunement_cooldown_ms,
                base_attunement_delay_ms: player.base_attunement_delay_ms,
                // UI Settings
                auto_navigation_time_ms: player.auto_navigation_time_ms,
                loop_delay_ms: player.loop_delay_ms,
                room_update_interval_ms: player.room_update_interval_ms
            };
        },
        
        resetForm() {
            this.formData = {
                name: '',
                stat_ingenuity: 5,
                stat_resonance: 5,
                stat_fortitude: 5,
                stat_acumen: 5,
                ability_crafting: 0,
                ability_attunement: 0,
                ability_endurance: 0,
                ability_commerce: 0,
                resource_vitalis: 50,
                resource_max_vitalis: 100,
                resource_max_encumbrance: 100,
                assignable_points: 5,
                flag_god_mode: 0,
                flag_always_first_time: 0,
                pulse_echoes: 0,
                pulse_echo_tier: 1,
                base_attunement_points: 10,
                base_attunement_cooldown_ms: 10000,
                base_attunement_delay_ms: 2000,
                auto_navigation_time_ms: 1000,
                loop_delay_ms: 1000,
                room_update_interval_ms: 30000
            };
        },

        // ============================================
        // CRUD OPERATIONS
        // ============================================
        
        savePlayer() {
            if (!this.selectedPlayer) return;
            
            this.loading = true;
            EditorBase.send({
                type: 'updatePlayer',
                playerId: this.selectedPlayer.id,
                updates: {
                    stat_ingenuity: parseInt(this.formData.stat_ingenuity),
                    stat_resonance: parseInt(this.formData.stat_resonance),
                    stat_fortitude: parseInt(this.formData.stat_fortitude),
                    stat_acumen: parseInt(this.formData.stat_acumen),
                    ability_crafting: parseInt(this.formData.ability_crafting),
                    ability_attunement: parseInt(this.formData.ability_attunement),
                    ability_endurance: parseInt(this.formData.ability_endurance),
                    ability_commerce: parseInt(this.formData.ability_commerce),
                    resource_vitalis: parseInt(this.formData.resource_vitalis),
                    resource_max_vitalis: parseInt(this.formData.resource_max_vitalis),
                    resource_max_encumbrance: parseInt(this.formData.resource_max_encumbrance),
                    assignable_points: parseInt(this.formData.assignable_points),
                    flag_god_mode: parseInt(this.formData.flag_god_mode),
                    flag_always_first_time: parseInt(this.formData.flag_always_first_time),
                    pulse_echoes: parseInt(this.formData.pulse_echoes),
                    pulse_echo_tier: parseInt(this.formData.pulse_echo_tier),
                    base_attunement_points: parseInt(this.formData.base_attunement_points),
                    base_attunement_cooldown_ms: parseInt(this.formData.base_attunement_cooldown_ms),
                    base_attunement_delay_ms: parseInt(this.formData.base_attunement_delay_ms),
                    auto_navigation_time_ms: parseInt(this.formData.auto_navigation_time_ms),
                    loop_delay_ms: parseInt(this.formData.loop_delay_ms),
                    room_update_interval_ms: parseInt(this.formData.room_update_interval_ms)
                }
            });
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
        
        formatPlayerName(name) {
            if (!name) return '';
            // Use parseMarkup to apply markup effects (like @ symbols for color)
            return parseMarkup(name, '#00ffff');
        },
        
        navigateTo(path) {
            EditorBase.setNavigatingAway(true);
            window.location.href = path;
        },
        
        formatDate(dateStr) {
            if (!dateStr) return 'N/A';
            return new Date(dateStr).toLocaleString();
        }
    };
};
