/**
 * NPCWidget Component
 * 
 * Handles NPC activity widget display during harvest sessions and cooldowns.
 * Auto-shows/hides based on NPC harvest state.
 */

import Component from '../core/Component.js';

export default class NPCWidget extends Component {
    constructor(game) {
        super(game);
        this.isVisible = false;
        this.currentPlayerId = null;
    }
    
    init() {
        super.init();
        
        // Subscribe to room updates to check for active harvests/cooldowns
        this.subscribe('room:update', (data) => this.handleRoomUpdate(data));
        this.subscribe('room:moved', (data) => this.handleRoomUpdate(data));
        
        // Subscribe to player stats to get player ID
        this.subscribe('player:stats', (data) => {
            // Try to get playerId from stats (may not be available)
            if (data.stats) {
                // Check various possible locations for playerId
                if (data.stats.playerId !== undefined) {
                    this.currentPlayerId = data.stats.playerId;
                } else if (data.stats.player_id !== undefined) {
                    this.currentPlayerId = data.stats.player_id;
                } else if (data.stats.id !== undefined) {
                    this.currentPlayerId = data.stats.id;
                }
            }
        });
        
        // Initially hide the widget
        this.hide();
    }
    
    /**
     * Handle room update events
     */
    handleRoomUpdate(data) {
        if (!data.npcs || data.npcs.length === 0) {
            this.hide();
            return;
        }
        
        // Find NPC with active harvest/cooldown
        let activeHarvestNPC = null;
        
        for (const npc of data.npcs) {
            // Check if NPC has active harvest or cooldown
            const hasActiveHarvest = npc.harvestStatus === 'active' || 
                                    (npc.state && npc.state.harvest_active === true);
            const hasCooldown = npc.harvestStatus === 'cooldown' || 
                               (npc.state && npc.state.cooldown_until && Date.now() < npc.state.cooldown_until);
            
            if (hasActiveHarvest || hasCooldown) {
                // Check if this player is the harvesting player (if harvesting and playerId is available)
                if (hasActiveHarvest && npc.state && npc.state.harvesting_player_id && this.currentPlayerId) {
                    if (npc.state.harvesting_player_id !== this.currentPlayerId) {
                        // Another player is harvesting this NPC, skip it
                        continue;
                    }
                }
                
                // If no playerId available, show widget for any active harvest/cooldown (backward compatibility)
                activeHarvestNPC = npc;
                break;
            }
        }
        
        if (activeHarvestNPC) {
            this.show(activeHarvestNPC);
        } else {
            this.hide();
        }
    }
    
    /**
     * Show the NPC widget with data
     */
    show(npc) {
        const widget = document.getElementById('widget-npc');
        if (!widget) {
            console.error('[NPCWidget] widget-npc element not found');
            return;
        }
        
        this.isVisible = true;
        
        // Update widget content
        const nameEl = document.getElementById('npcWidgetName');
        const statusEl = document.getElementById('npcWidgetStatus');
        const progressBar = document.getElementById('npcWidgetProgressBar');
        
        if (nameEl) nameEl.textContent = npc.name || 'Unknown NPC';
        
        const status = npc.harvestStatus || (npc.state?.harvest_active ? 'active' : 'cooldown');
        if (statusEl) {
            statusEl.textContent = status === 'active' ? 'Harvesting...' : 'Recharging...';
        }
        
        if (progressBar) {
            progressBar.className = 'npc-widget-progress-bar';
            progressBar.classList.add(status === 'active' ? 'harvesting' : 'cooldown');
            
            // Progress: 0-1 value, where 1 = full (harvest starts at 1, drains to 0)
            // Cooldown starts at 0, fills to 1
            const progress = npc.harvestProgress !== undefined ? npc.harvestProgress : 0;
            progressBar.style.width = `${progress * 100}%`;
        }
        
        // Update timing info
        this.updateTimingInfo(npc);
        
        // Trigger widget display update
        if (typeof window.updateWidgetDisplay === 'function') {
            window.updateWidgetDisplay();
        }
    }
    
    /**
     * Update timing information with stat buff indicators
     */
    updateTimingInfo(npc) {
        // Pulse timing
        const pulseEl = document.getElementById('npcWidgetPulse');
        const resonanceNotePulse = document.getElementById('npcWidgetResonanceNote');
        
        if (pulseEl && (npc.baseCycleTime || npc.effectiveCycleTime)) {
            const displayCycleTime = npc.effectiveCycleTime || npc.baseCycleTime;
            pulseEl.textContent = `${(displayCycleTime / 1000).toFixed(1)}s`;
            
            // Show resonance note if effective cycle time is different from base
            if (resonanceNotePulse) {
                if (npc.effectiveCycleTime && npc.effectiveCycleTime !== npc.baseCycleTime) {
                    resonanceNotePulse.style.display = 'inline';
                } else {
                    resonanceNotePulse.style.display = 'none';
                }
            }
        }
        
        // Hit rate
        const hitRateEl = document.getElementById('npcWidgetHitRate');
        const resonanceNoteHitRate = document.getElementById('npcWidgetHitRateNote');
        
        if (hitRateEl && npc.hitRate !== undefined) {
            hitRateEl.textContent = `${(npc.hitRate * 100).toFixed(0)}%`;
            
            // Show resonance note if hit rate is less than 100%
            if (resonanceNoteHitRate) {
                if (npc.hitRate < 1.0) {
                    resonanceNoteHitRate.style.display = 'inline';
                } else {
                    resonanceNoteHitRate.style.display = 'none';
                }
            }
        }
        
        // Harvest time
        const harvestEl = document.getElementById('npcWidgetHarvest');
        const harvestNote = document.getElementById('npcWidgetHarvestNote');
        
        if (harvestEl && (npc.baseHarvestableTime || npc.effectiveHarvestableTime || npc.harvestableTime)) {
            const displayHarvestableTime = npc.effectiveHarvestableTime || npc.baseHarvestableTime || npc.harvestableTime;
            harvestEl.textContent = `${(displayHarvestableTime / 1000).toFixed(1)}s`;
            
            // Show fortitude note if effective harvestable time is different from base
            if (harvestNote) {
                if (npc.effectiveHarvestableTime && npc.effectiveHarvestableTime !== npc.baseHarvestableTime) {
                    harvestNote.style.display = 'inline';
                } else {
                    harvestNote.style.display = 'none';
                }
            }
        }
        
        // Cooldown time
        const cooldownEl = document.getElementById('npcWidgetCooldown');
        const cooldownNote = document.getElementById('npcWidgetCooldownNote');
        
        if (cooldownEl && (npc.baseCooldownTime || npc.effectiveCooldownTime || npc.cooldownTime)) {
            const displayCooldownTime = npc.effectiveCooldownTime || npc.baseCooldownTime || npc.cooldownTime;
            cooldownEl.textContent = `${(displayCooldownTime / 1000).toFixed(1)}s`;
            
            // Show fortitude note if effective cooldown time is different from base
            if (cooldownNote) {
                if (npc.effectiveCooldownTime && npc.effectiveCooldownTime !== npc.baseCooldownTime) {
                    cooldownNote.style.display = 'inline';
                } else {
                    cooldownNote.style.display = 'none';
                }
            }
        }
    }
    
    /**
     * Hide the NPC widget
     */
    hide() {
        if (!this.isVisible) return;
        
        this.isVisible = false;
        
        // Trigger widget display update
        if (typeof window.updateWidgetDisplay === 'function') {
            window.updateWidgetDisplay();
        }
    }
    
    /**
     * Get visibility state (for widget display system)
     */
    getVisibility() {
        return this.isVisible;
    }
}

