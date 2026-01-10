/**
 * NPCWidget - Auto-managed widget for NPC harvest activity
 * 
 * Handles NPC activity widget display during harvest sessions and cooldowns.
 * Auto-shows/hides based on NPC harvest state.
 * 
 * **ARCHITECTURE:** Extends Widget (render-based) - ALL panel widgets use Widget system
 */

import Widget from './Widget.js';
import { parseMarkup } from '../utils/Markup.js';

export default class NPCWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        this.activeNPC = null; // Track active NPC for visibility
        this.currentPlayerId = null;
        this.harvestStartStats = null; // Track stats at harvest start for gained resources
        this.currentPulseEchoes = null; // Will be set when we receive stats
        this.currentPulseResin = null; // Will be set when we receive inventory
        this.progressAnimationInterval = null; // For smooth progress bar animation
        this.lastProgressUpdate = null; // Last progress value from server
        this.harvestStartTime = null; // Client-side harvest start time
        this.harvestDuration = null; // Total harvest duration in ms
        this.cooldownStartTime = null; // Client-side cooldown start time
        this.cooldownDuration = null; // Total cooldown duration in ms
        this.inventoryPollInterval = null; // For periodic inventory updates during harvest
    }
    
    init() {
        super.init();
        // No DOM lookups in init - done in onAttach
    }
    
    /**
     * Render widget - returns single root element
     */
    render() {
        const root = document.createElement('div');
        root.className = 'widget widget-npc widget-theme-npc';
        root.setAttribute('data-widget', 'npc');
        root.id = 'widget-npc';
        
        // Create header
        const header = document.createElement('div');
        header.className = 'widget-header';
        header.textContent = 'NPC Activity';
        root.appendChild(header);
        
        // Create content container
        const content = document.createElement('div');
        content.className = 'widget-content';
        
        // NPC name
        const nameEl = document.createElement('div');
        nameEl.id = 'npcWidgetName';
        nameEl.className = 'widget-npc-name';
        nameEl.textContent = 'Unknown NPC';
        content.appendChild(nameEl);
        
        // Status
        const statusEl = document.createElement('div');
        statusEl.id = 'npcWidgetStatus';
        statusEl.className = 'widget-npc-status';
        statusEl.textContent = 'Recharging...';
        content.appendChild(statusEl);
        
        // Progress bar container
        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = 'width: 100%; height: 8px; background: #0a0a0a; border: 1px solid #333; border-radius: 4px; overflow: hidden; margin-bottom: 10px;';
        
        const progressBar = document.createElement('div');
        progressBar.id = 'npcWidgetProgressBar';
        progressBar.className = 'npc-widget-progress-bar widget-progress-fill';
        progressBar.style.cssText = 'height: 100%; width: 0%; transition: width 0.2s linear;';
        progressContainer.appendChild(progressBar);
        content.appendChild(progressContainer);
        
        // Timing information section
        const timingSection = document.createElement('div');
        timingSection.className = 'widget-npc-timing';
        
        // Pulse timing row
        const pulseRow = document.createElement('div');
        pulseRow.className = 'widget-npc-timing-row';
        const pulseLabel = document.createElement('span');
        pulseLabel.className = 'widget-npc-timing-label';
        pulseLabel.textContent = 'Pulse:';
        const pulseValue = document.createElement('span');
        pulseValue.id = 'npcWidgetPulse';
        pulseValue.className = 'widget-npc-timing-value';
        pulseValue.textContent = '0.0s';
        const pulseNote = document.createElement('span');
        pulseNote.id = 'npcWidgetResonanceNote';
        pulseNote.style.cssText = 'color: #00ffff; font-size: 9px; margin-left: 4px; display: none;';
        pulseNote.textContent = '⚡';
        pulseNote.title = 'Resonance buff active';
        pulseRow.appendChild(pulseLabel);
        pulseRow.appendChild(pulseValue);
        pulseRow.appendChild(pulseNote);
        timingSection.appendChild(pulseRow);
        
        // Hit rate row
        const hitRateRow = document.createElement('div');
        hitRateRow.className = 'widget-npc-timing-row';
        const hitRateLabel = document.createElement('span');
        hitRateLabel.className = 'widget-npc-timing-label';
        hitRateLabel.textContent = 'Hit Rate:';
        const hitRateValue = document.createElement('span');
        hitRateValue.id = 'npcWidgetHitRate';
        hitRateValue.className = 'widget-npc-timing-value';
        hitRateValue.textContent = '100%';
        const hitRateNote = document.createElement('span');
        hitRateNote.id = 'npcWidgetHitRateNote';
        hitRateNote.style.cssText = 'color: #00ffff; font-size: 9px; margin-left: 4px; display: none;';
        hitRateNote.textContent = '⚡';
        hitRateNote.title = 'Resonance affects hit rate';
        hitRateRow.appendChild(hitRateLabel);
        hitRateRow.appendChild(hitRateValue);
        hitRateRow.appendChild(hitRateNote);
        timingSection.appendChild(hitRateRow);
        
        // Harvest time row
        const harvestRow = document.createElement('div');
        harvestRow.className = 'widget-npc-timing-row';
        const harvestLabel = document.createElement('span');
        harvestLabel.className = 'widget-npc-timing-label';
        harvestLabel.textContent = 'Harvest:';
        const harvestValue = document.createElement('span');
        harvestValue.id = 'npcWidgetHarvest';
        harvestValue.className = 'widget-npc-timing-value';
        harvestValue.textContent = '0.0s';
        const harvestNote = document.createElement('span');
        harvestNote.id = 'npcWidgetHarvestNote';
        harvestNote.style.cssText = 'color: #ff8800; font-size: 9px; margin-left: 4px; display: none;';
        harvestNote.textContent = '🛡️';
        harvestNote.title = 'Fortitude buff active';
        harvestRow.appendChild(harvestLabel);
        harvestRow.appendChild(harvestValue);
        harvestRow.appendChild(harvestNote);
        timingSection.appendChild(harvestRow);
        
        // Cooldown time row
        const cooldownRow = document.createElement('div');
        cooldownRow.className = 'widget-npc-timing-row';
        const cooldownLabel = document.createElement('span');
        cooldownLabel.className = 'widget-npc-timing-label';
        cooldownLabel.textContent = 'Cooldown:';
        const cooldownValue = document.createElement('span');
        cooldownValue.id = 'npcWidgetCooldown';
        cooldownValue.className = 'widget-npc-timing-value';
        cooldownValue.textContent = '0.0s';
        const cooldownNote = document.createElement('span');
        cooldownNote.id = 'npcWidgetCooldownNote';
        cooldownNote.style.cssText = 'color: #ff8800; font-size: 9px; margin-left: 4px; display: none;';
        cooldownNote.textContent = '🛡️';
        cooldownNote.title = 'Fortitude buff active';
        cooldownRow.appendChild(cooldownLabel);
        cooldownRow.appendChild(cooldownValue);
        cooldownRow.appendChild(cooldownNote);
        timingSection.appendChild(cooldownRow);
        
        content.appendChild(timingSection);
        
        // Harvest gains display
        const gainsSection = document.createElement('div');
        gainsSection.id = 'npcWidgetGains';
        gainsSection.style.cssText = 'margin-top: 8px; padding-top: 8px; border-top: 1px solid #333; font-size: 10px; display: block;';
        
        const gainsLabel = document.createElement('div');
        gainsLabel.style.cssText = 'color: #888; font-size: 9px; text-transform: uppercase; margin-bottom: 4px;';
        gainsLabel.textContent = 'Harvest Gains:';
        gainsSection.appendChild(gainsLabel);
        
        const resinGain = document.createElement('div');
        resinGain.id = 'npcWidgetResinGain';
        resinGain.style.cssText = 'color: #00ff00; margin: 2px 0; font-weight: bold;';
        resinGain.textContent = 'Pulse Resin: +0';
        gainsSection.appendChild(resinGain);
        
        const echoGain = document.createElement('div');
        echoGain.id = 'npcWidgetEchoGain';
        echoGain.style.cssText = 'color: #00ffff; margin: 2px 0; font-weight: bold;';
        echoGain.textContent = 'Pulse Echoes: +0';
        gainsSection.appendChild(echoGain);
        
        content.appendChild(gainsSection);
        root.appendChild(content);
        
        return root;
    }
    
    /**
     * Called after widget is attached
     */
    onAttach() {
        // If we already have an active NPC, show it now that rootElement exists
        if (this.activeNPC) {
            console.log('[NPCWidget] onAttach() called with existing activeNPC:', this.activeNPC.name);
            this.show(this.activeNPC);
        }
    }
    
    /**
     * Handle backend messages routed from WidgetManager
     */
    onMessage(msg) {
        
        if (msg.type === 'roomUpdate' || msg.type === 'moved') {
            this.handleRoomUpdate(msg);
        } else if (msg.type === 'playerStats' && msg.stats) {
            // Try to get playerId from stats
            if (msg.stats.playerId !== undefined) {
                this.currentPlayerId = msg.stats.playerId;
            } else if (msg.stats.player_id !== undefined) {
                this.currentPlayerId = msg.stats.player_id;
            } else if (msg.stats.id !== undefined) {
                this.currentPlayerId = msg.stats.id;
            }
            
            // Track pulse echoes for gains display
            if (msg.stats.pulseEchoes !== undefined) {
                const newEchoes = msg.stats.pulseEchoes.value !== undefined ? msg.stats.pulseEchoes.value : 
                                (typeof msg.stats.pulseEchoes === 'number' ? msg.stats.pulseEchoes : 0);
                
                const oldEchoes = this.currentPulseEchoes;
                
            // Initialize harvestStartStats if we have an active NPC but haven't started tracking yet
            if (this.activeNPC && !this.harvestStartStats) {
                this.trackHarvestStart();
            }
            
            // If we're tracking harvest and haven't set starting value yet, set it now
            // BUT: If this is the first update and we already have a value, it might be too late
            // Check if this value seems too high (might already include first drop)
            if (this.harvestStartStats && this.harvestStartStats.pulseEchoes === null && this.activeNPC) {
                // Check if harvest just started (less than 2 seconds ago) - if so, this is likely the baseline
                const harvestAge = this.harvestStartStats.timestamp ? (Date.now() - this.harvestStartStats.timestamp) : 0;
                if (harvestAge < 2000) {
                    this.harvestStartStats.pulseEchoes = newEchoes;
                } else {
                    // Harvest has been going for a while - this value might already include gains
                    this.harvestStartStats.pulseEchoes = newEchoes;
                }
            }
                
                this.currentPulseEchoes = newEchoes;
                
                // Update gains display - always try to update if we have rootElement
                if (this.rootElement) {
                    this.updateResourceGains();
                }
            }
        } else if (msg.type === 'inventoryList' || msg.type === 'inventory:update') {
            this.handleInventoryUpdate(msg);
        } else if (msg.type === 'npcWidget:resourceGain') {
            // Direct message from NPC cycle engine - most accurate tracking
            this.handleDirectResourceGain(msg);
        }
    }
    
    /**
     * Handle room update events
     */
    handleRoomUpdate(data) {
        if (!data.npcs || data.npcs.length === 0) {
            this.activeNPC = null;
            return;
        }
        
        // Find NPC with active harvest/cooldown
        let activeHarvestNPC = null;
        
        for (const npc of data.npcs) {
            // Check if NPC has active harvest or cooldown
            // Server sends harvestStatus: 'active' or 'cooldown' in the NPC data
            const hasActiveHarvest = npc.harvestStatus === 'active' || 
                                    (npc.state && npc.state.harvest_active === true);
            
            // Check cooldown - use cooldown_until timestamp to ensure we show widget during entire cooldown
            const now = Date.now();
            const hasCooldown = npc.harvestStatus === 'cooldown' || 
                               (npc.state && npc.state.cooldown_until && now < npc.state.cooldown_until);
            
            // Also check if this is the same NPC we were tracking (for smooth transition)
            const isTrackedNPC = this.activeNPC && this.activeNPC.id === npc.id;
            
            console.log(`[NPCWidget] NPC ${npc.name || 'Unknown'}: harvestStatus=${npc.harvestStatus}, hasActiveHarvest=${hasActiveHarvest}, hasCooldown=${hasCooldown}, cooldown_until=${npc.state?.cooldown_until}, now=${now}, isTrackedNPC=${isTrackedNPC}`);
            
            if (hasActiveHarvest || hasCooldown || (isTrackedNPC && npc.state && npc.state.cooldown_until && now < npc.state.cooldown_until)) {
                // Check if this player is the harvesting player (if harvesting and playerId is available)
                if (hasActiveHarvest && npc.state && npc.state.harvesting_player_id && this.currentPlayerId) {
                    if (npc.state.harvesting_player_id !== this.currentPlayerId) {
                        // Another player is harvesting this NPC, skip it
                        console.log(`[NPCWidget] NPC ${npc.name} is being harvested by another player, skipping`);
                        continue;
                    }
                }
                
                // If no playerId available, show widget for any active harvest/cooldown (backward compatibility)
                activeHarvestNPC = npc;
                console.log(`[NPCWidget] Found active NPC: ${npc.name || 'Unknown'}`);
                break;
            }
        }
        
        if (activeHarvestNPC) {
            console.log('[NPCWidget] Setting activeNPC and showing widget');
            // CRITICAL: Set activeNPC BEFORE calling show() so visibility check works
            // Also update if it's the same NPC (to update progress bar)
            const isSameNPC = this.activeNPC && this.activeNPC.id === activeHarvestNPC.id;
            const previousStatus = this.activeNPC?.harvestStatus;
            
            // If transitioning from harvest to cooldown, ensure status is set correctly
            if (isSameNPC && previousStatus === 'active' && 
                !activeHarvestNPC.harvestStatus && 
                activeHarvestNPC.state && 
                activeHarvestNPC.state.cooldown_until && 
                Date.now() < activeHarvestNPC.state.cooldown_until) {
                // Server hasn't updated status yet, but cooldown has started - set it manually
                activeHarvestNPC.harvestStatus = 'cooldown';
                console.log('[NPCWidget] Manually setting status to cooldown (transition detected)');
            }
            
            this.activeNPC = activeHarvestNPC;
            
            // Detect transition from harvest to cooldown - handle immediately
            if (previousStatus === 'active' && activeHarvestNPC.harvestStatus === 'cooldown') {
                console.log('[NPCWidget] Detected harvest->cooldown transition, switching immediately');
                // Clear harvest animation and start cooldown
                if (this.progressAnimationInterval) {
                    clearInterval(this.progressAnimationInterval);
                    this.progressAnimationInterval = null;
                }
            }
            
            // Always call show() to update the display (especially progress bar)
            this.show(activeHarvestNPC);
            console.log('[NPCWidget] activeNPC set to:', this.activeNPC?.name, 'progress:', this.activeNPC?.harvestProgress, 'status:', this.activeNPC?.harvestStatus);
        } else {
            // Only clear if we're sure there's no active harvest/cooldown
            // Check if we were tracking an NPC that might still be in cooldown
            if (this.activeNPC && this.activeNPC.state && this.activeNPC.state.cooldown_until) {
                const now = Date.now();
                if (now < this.activeNPC.state.cooldown_until) {
                    // Still in cooldown, keep showing widget
                    console.log('[NPCWidget] NPC still in cooldown, keeping widget visible');
                    // Update NPC data to reflect cooldown status
                    this.activeNPC.harvestStatus = 'cooldown';
                    this.show(this.activeNPC);
                    return;
                }
            }
            
            console.log('[NPCWidget] No active NPC found, clearing activeNPC');
            this.activeNPC = null;
            // Clear animation when widget hides
            if (this.progressAnimationInterval) {
                clearInterval(this.progressAnimationInterval);
                this.progressAnimationInterval = null;
            }
            // Stop inventory polling when harvest ends
            if (this.inventoryPollInterval) {
                clearInterval(this.inventoryPollInterval);
                this.inventoryPollInterval = null;
            }
        }
    }
    
    /**
     * Show the NPC widget with data
     */
    show(npc) {
        // CRITICAL: Set activeNPC FIRST, even if rootElement doesn't exist yet
        // This allows WidgetManager to check visibility and attach the widget
        const wasActive = this.activeNPC !== null;
        const isNewHarvest = !wasActive || (this.activeNPC && this.activeNPC.id !== npc.id) || 
                            (this.activeNPC && this.activeNPC.harvestStatus !== 'active' && npc.harvestStatus === 'active');
        
        this.activeNPC = npc;
        console.log('[NPCWidget] show() called, activeNPC set to:', npc?.name, 'isNewHarvest:', isNewHarvest);
        
        if (!this.rootElement) {
            console.log('[NPCWidget] show() called but rootElement is null (widget not attached yet) - activeNPC set for visibility check');
            return;
        }
        
        // If this is a new harvest, track starting stats
        // CRITICAL: Capture starting values IMMEDIATELY before first item drop
        if (isNewHarvest && npc.harvestStatus === 'active') {
            console.log('[NPCWidget] New harvest detected, initializing tracking immediately');
            this.trackHarvestStart();
            
            // Immediately capture current values if available (before first item drop)
            // This ensures we don't miss the first drop
            if (this.currentPulseEchoes !== null && this.currentPulseEchoes !== undefined) {
                if (this.harvestStartStats && this.harvestStartStats.pulseEchoes === null) {
                    this.harvestStartStats.pulseEchoes = this.currentPulseEchoes;
                    console.log('[NPCWidget] ✅ Captured starting pulse echoes immediately at harvest start:', this.currentPulseEchoes);
                }
            }
            if (this.currentPulseResin !== null && this.currentPulseResin !== undefined) {
                if (this.harvestStartStats && this.harvestStartStats.pulseResin === null) {
                    this.harvestStartStats.pulseResin = this.currentPulseResin;
                    console.log('[NPCWidget] ✅ Captured starting pulse resin immediately at harvest start:', this.currentPulseResin);
                }
            }
        }
        
        // Update widget content
        const nameEl = this.rootElement.querySelector('#npcWidgetName');
        const statusEl = this.rootElement.querySelector('#npcWidgetStatus');
        const progressBar = this.rootElement.querySelector('#npcWidgetProgressBar');
        
        // Get NPC name - try multiple possible fields
        const npcName = npc.name || npc.npcName || 'Unknown NPC';
        if (nameEl) {
            // CRITICAL: Use parseMarkup to support markup in NPC names
            nameEl.innerHTML = parseMarkup(npcName, '#00ffff');
        }
        
        // Determine status - server sends harvestStatus: 'active' or 'cooldown'
        const status = npc.harvestStatus || (npc.state?.harvest_active ? 'active' : 'cooldown');
        if (statusEl) {
            statusEl.textContent = status === 'active' ? 'Harvesting...' : 'Recharging...';
        }
        
        if (progressBar) {
            // Remove all status classes
            progressBar.classList.remove('harvesting', 'cooldown', 'standard');
            
            // Get progress from server (0-1 value)
            const serverProgress = npc.harvestProgress !== undefined ? npc.harvestProgress : (status === 'active' ? 1 : 0);
            this.lastProgressUpdate = serverProgress;
            
            // Set color based on status
            if (status === 'active') {
                // Green for harvest (decrementing from 100% to 0%)
                progressBar.classList.add('harvesting');
                progressBar.style.background = 'linear-gradient(90deg, #00ff00, #00cc00)';
                progressBar.style.boxShadow = '0 0 8px #00ff00 inset';
                
                // Store harvest timing for smooth animation - use server's actual timing
                if (npc.state && npc.state.harvest_start_time) {
                    this.harvestStartTime = npc.state.harvest_start_time;
                    this.harvestDuration = npc.effectiveHarvestableTime || npc.baseHarvestableTime || npc.harvestableTime || 60000;
                    
                    // ALWAYS store cooldown duration when harvest starts (needed for transition)
                    // Even if cooldown_until isn't set yet, we need the duration to estimate transition
                    this.cooldownDuration = npc.effectiveCooldownTime || npc.baseCooldownTime || npc.cooldownTime || 120000;
                    
                    console.log('[NPCWidget] Harvest timing stored:', {
                        harvestStartTime: this.harvestStartTime,
                        harvestDuration: this.harvestDuration,
                        cooldownDuration: this.cooldownDuration,
                        cooldown_until: npc.state.cooldown_until,
                        effectiveCooldownTime: npc.effectiveCooldownTime,
                        baseCooldownTime: npc.baseCooldownTime,
                        cooldownTime: npc.cooldownTime
                    });
                    
                    // Pre-store cooldown timing for immediate transition if available
                    if (npc.state.cooldown_until) {
                        this.cooldownStartTime = npc.state.cooldown_until - this.cooldownDuration;
                        console.log('[NPCWidget] Pre-stored cooldown timing:', {
                            cooldownStartTime: this.cooldownStartTime,
                            cooldown_until: npc.state.cooldown_until,
                            cooldownDuration: this.cooldownDuration
                        });
                    }
                }
                
                // Start smooth animation
                this.startProgressAnimation('harvest');
            } else if (status === 'cooldown') {
                // Blue for cooldown (incrementing from 0% to 100%)
                progressBar.classList.add('cooldown');
                progressBar.style.background = 'linear-gradient(90deg, #0066ff, #0099ff)';
                progressBar.style.boxShadow = '0 0 8px #0066ff inset';
                
                // Store cooldown timing for smooth animation - use server's actual timing
                if (npc.state && npc.state.cooldown_until) {
                    this.cooldownDuration = npc.effectiveCooldownTime || npc.baseCooldownTime || npc.cooldownTime || 120000;
                    // Calculate start time: cooldown_until - duration
                    this.cooldownStartTime = npc.state.cooldown_until - this.cooldownDuration;
                    console.log('[NPCWidget] Cooldown timing:', 'start:', this.cooldownStartTime, 'until:', npc.state.cooldown_until, 'duration:', this.cooldownDuration);
                }
                
                // Start smooth animation
                this.startProgressAnimation('cooldown');
            }
            
            // Update immediately with server value
            const progressPercent = Math.max(0, Math.min(100, serverProgress * 100));
            progressBar.style.width = `${progressPercent}%`;
            console.log('[NPCWidget] Progress bar updated:', progressPercent.toFixed(1) + '%', 'status:', status, 'serverProgress:', serverProgress);
        }
        
        // Update timing info
        this.updateTimingInfo(npc);
        
        // Update resource gains display
        if (this.harvestStartStats) {
            this.updateResourceGains();
        }
    }
    
    /**
     * Track starting stats when harvest begins
     * Extensible structure for future resource types
     */
    trackHarvestStart() {
        // Initialize tracking - will be populated when we receive stats/inventory
        this.harvestStartStats = {
            pulseEchoes: null,
            pulseResin: null,
            timestamp: Date.now()
        };
        console.log('[NPCWidget] Tracking harvest start - waiting for initial stats');
        
        // Request current stats and inventory to get baseline
        // Request stats immediately if we have current values
        if (this.currentPulseEchoes !== null && this.currentPulseEchoes !== undefined) {
            this.harvestStartStats.pulseEchoes = this.currentPulseEchoes;
            console.log('[NPCWidget] Using existing pulse echoes as starting value:', this.currentPulseEchoes);
        }
        if (this.currentPulseResin !== null && this.currentPulseResin !== undefined) {
            this.harvestStartStats.pulseResin = this.currentPulseResin;
            console.log('[NPCWidget] Using existing pulse resin as starting value:', this.currentPulseResin);
        }
        
        // Request inventory once at start if we don't have pulse resin yet
        // Use silent flag to prevent terminal display - widgets still receive it
        if (this.harvestStartStats.pulseResin === null && this.game && this.game.ws && this.game.ws.readyState === 1) {
            console.log('[NPCWidget] Requesting silent inventory to get baseline pulse resin');
            this.game.ws.send(JSON.stringify({ type: 'inventory', silent: true }));
        }
        
        // Note: We rely on server-sent inventory updates rather than polling
        // The server should send inventoryList messages when items are added during harvest
        // If inventory updates aren't being sent, we'll need to add that server-side
        
        // Update display if we have starting values
        if (this.rootElement && (this.harvestStartStats.pulseEchoes !== null || this.harvestStartStats.pulseResin !== null)) {
            this.updateResourceGains();
        }
    }
    
    /**
     * Handle inventory update messages
     * Extensible for future resource types
     */
    handleInventoryUpdate(msg) {
        // Track pulse resin from inventory
        const items = msg.items || (msg.data && msg.data.items) || [];
        console.log('[NPCWidget] Received inventory update, items count:', items.length, 'items:', items.map(i => i.item_name || i.name));
        
        // Find pulse resin item - try multiple name variations
        const pulseResinItem = items.find(item => {
            const itemName = (item.item_name || item.name || '').toLowerCase();
            return itemName.includes('pulse') && itemName.includes('resin');
        });
        
        const newResin = pulseResinItem ? (parseInt(pulseResinItem.quantity) || 0) : 0;
        
        console.log('[NPCWidget] Pulse resin in inventory:', newResin, 'previous:', this.currentPulseResin, 'found item:', !!pulseResinItem);
        
            // Initialize harvestStartStats if we have an active NPC but haven't started tracking yet
            if (this.activeNPC && !this.harvestStartStats) {
                console.log('[NPCWidget] ⚠️ Late initialization: Initializing harvest tracking from pulse resin update (may miss first drop)');
                this.trackHarvestStart();
            }
            
            // If we're tracking harvest and haven't set starting value yet, set it now
            // BUT: If this is the first update and we already have a value, it might be too late
            // Check if this value seems too high (might already include first drop)
            if (this.harvestStartStats && this.harvestStartStats.pulseResin === null && this.activeNPC) {
                // Check if harvest just started (less than 2 seconds ago) - if so, this is likely the baseline
                const harvestAge = this.harvestStartStats.timestamp ? (Date.now() - this.harvestStartStats.timestamp) : 0;
                if (harvestAge < 2000) {
                    this.harvestStartStats.pulseResin = newResin;
                    console.log('[NPCWidget] ✅ Recorded starting pulse resin (early capture):', newResin, 'harvestAge:', harvestAge + 'ms');
                } else {
                    // Harvest has been going for a while - this value might already include gains
                    // Use current value but log a warning
                    this.harvestStartStats.pulseResin = newResin;
                    console.log('[NPCWidget] ⚠️ Recorded starting pulse resin (late capture, may miss first drop):', newResin, 'harvestAge:', harvestAge + 'ms');
                }
            }
        
        const oldResin = this.currentPulseResin;
        this.currentPulseResin = newResin;
        
        // Update gains display - always try to update if we have rootElement
        if (this.rootElement) {
            this.updateResourceGains();
        } else {
            console.log('[NPCWidget] Cannot update gains - rootElement is null');
        }
        
        // Log if resin changed
        if (oldResin !== null && newResin !== oldResin) {
            console.log('[NPCWidget] Pulse resin changed:', oldResin, '->', newResin);
        }
    }
    
    /**
     * Handle direct resource gain messages from NPC cycle engine
     * This is the most accurate method - receives updates immediately when resources are produced
     */
    handleDirectResourceGain(msg) {
        if (!this.harvestStartStats && this.activeNPC) {
            // Initialize tracking if not already started
            this.trackHarvestStart();
        }
        
        if (msg.resourceType === 'pulseEchoes') {
            // Update current value
            if (msg.total !== undefined) {
                const oldEchoes = this.currentPulseEchoes;
                this.currentPulseEchoes = msg.total;
                
                // If starting value not set yet, set it to (current - amount) to account for this gain
                if (this.harvestStartStats && this.harvestStartStats.pulseEchoes === null) {
                    this.harvestStartStats.pulseEchoes = msg.total - msg.amount;
                    console.log('[NPCWidget] ✅ Set starting pulse echoes from direct gain:', this.harvestStartStats.pulseEchoes, '(current:', msg.total, 'gain:', msg.amount, ')');
                }
                
                console.log('[NPCWidget] Direct pulse echoes update:', {
                    amount: msg.amount,
                    total: msg.total,
                    old: oldEchoes,
                    new: this.currentPulseEchoes
                });
            }
        } else if (msg.resourceType === 'pulseResin') {
            // Update current value
            if (msg.total !== undefined) {
                const oldResin = this.currentPulseResin;
                this.currentPulseResin = msg.total;
                
                // If starting value not set yet, set it to (current - amount) to account for this gain
                if (this.harvestStartStats && this.harvestStartStats.pulseResin === null) {
                    this.harvestStartStats.pulseResin = msg.total - msg.amount;
                    console.log('[NPCWidget] ✅ Set starting pulse resin from direct gain:', this.harvestStartStats.pulseResin, '(current:', msg.total, 'gain:', msg.amount, ')');
                }
                
                console.log('[NPCWidget] Direct pulse resin update:', {
                    amount: msg.amount,
                    total: msg.total,
                    old: oldResin,
                    new: this.currentPulseResin
                });
            }
        }
        
        // Update gains display
        if (this.rootElement) {
            this.updateResourceGains();
        }
    }
    
    /**
     * Update resource gains display
     * Extensible structure - easy to add new resource types
     */
    updateResourceGains() {
        if (!this.rootElement) {
            console.log('[NPCWidget] updateResourceGains: no rootElement');
            return;
        }
        
        // Initialize harvestStartStats if it doesn't exist yet
        if (!this.harvestStartStats && this.activeNPC) {
            console.log('[NPCWidget] Initializing harvestStartStats on first update');
            this.trackHarvestStart();
        }
        
        if (!this.harvestStartStats) {
            console.log('[NPCWidget] updateResourceGains: harvestStartStats still null after init attempt');
            return;
        }
        
        const gainsSection = this.rootElement.querySelector('#npcWidgetGains');
        const resinGainEl = this.rootElement.querySelector('#npcWidgetResinGain');
        const echoGainEl = this.rootElement.querySelector('#npcWidgetEchoGain');
        
        if (!gainsSection || !resinGainEl || !echoGainEl) {
            console.log('[NPCWidget] updateResourceGains: missing DOM elements', {
                gainsSection: !!gainsSection,
                resinGainEl: !!resinGainEl,
                echoGainEl: !!echoGainEl
            });
            return;
        }
        
        // Update pulse echoes gain - always show, even if 0
        if (this.harvestStartStats.pulseEchoes !== null && 
            this.currentPulseEchoes !== null && 
            this.currentPulseEchoes !== undefined) {
            const echoGain = this.currentPulseEchoes - this.harvestStartStats.pulseEchoes;
            echoGainEl.textContent = `Pulse Echoes: ${echoGain >= 0 ? '+' : ''}${echoGain}`;
            echoGainEl.style.display = 'block';
            console.log('[NPCWidget] Updated echo display:', echoGain, '(current:', this.currentPulseEchoes, 'start:', this.harvestStartStats.pulseEchoes, ')');
        } else {
            // Show placeholder if tracking not complete
            if (this.currentPulseEchoes !== null && this.currentPulseEchoes !== undefined) {
                echoGainEl.textContent = `Pulse Echoes: +0 (tracking...)`;
            } else {
                echoGainEl.textContent = 'Pulse Echoes: ...';
            }
            echoGainEl.style.display = 'block';
            console.log('[NPCWidget] Echo tracking incomplete:', 'start:', this.harvestStartStats.pulseEchoes, 'current:', this.currentPulseEchoes);
        }
        
        // Update pulse resin gain - always show, even if 0
        if (this.harvestStartStats.pulseResin !== null && 
            this.currentPulseResin !== null && 
            this.currentPulseResin !== undefined) {
            const resinGain = this.currentPulseResin - this.harvestStartStats.pulseResin;
            resinGainEl.textContent = `Pulse Resin: ${resinGain >= 0 ? '+' : ''}${resinGain}`;
            resinGainEl.style.display = 'block';
            console.log('[NPCWidget] Updated resin display:', resinGain, '(current:', this.currentPulseResin, 'start:', this.harvestStartStats.pulseResin, ')');
        } else {
            // Show placeholder if tracking not complete
            if (this.currentPulseResin !== null && this.currentPulseResin !== undefined) {
                resinGainEl.textContent = `Pulse Resin: +0 (tracking...)`;
            } else {
                resinGainEl.textContent = 'Pulse Resin: ...';
            }
            resinGainEl.style.display = 'block';
            console.log('[NPCWidget] Resin tracking incomplete:', 'start:', this.harvestStartStats.pulseResin, 'current:', this.currentPulseResin);
        }
        
        // Always show gains section (it's part of the widget)
        gainsSection.style.display = 'block';
    }
    
    /**
     * Update timing information with stat buff indicators
     */
    updateTimingInfo(npc) {
        if (!this.rootElement) return;
        
        // Pulse timing
        const pulseEl = this.rootElement.querySelector('#npcWidgetPulse');
        const resonanceNotePulse = this.rootElement.querySelector('#npcWidgetResonanceNote');
        
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
        const hitRateEl = this.rootElement.querySelector('#npcWidgetHitRate');
        const resonanceNoteHitRate = this.rootElement.querySelector('#npcWidgetHitRateNote');
        
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
        const harvestEl = this.rootElement.querySelector('#npcWidgetHarvest');
        const harvestNote = this.rootElement.querySelector('#npcWidgetHarvestNote');
        
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
        const cooldownEl = this.rootElement.querySelector('#npcWidgetCooldown');
        const cooldownNote = this.rootElement.querySelector('#npcWidgetCooldownNote');
        
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
     * Transition from harvest to cooldown immediately
     */
    transitionToCooldown() {
        if (!this.activeNPC || !this.rootElement) {
            console.log('[NPCWidget] ❌ transitionToCooldown: Missing activeNPC or rootElement');
            return;
        }
        
        console.log('[NPCWidget] 🔄 TRANSITIONING TO COOLDOWN MODE', {
            activeNPC: this.activeNPC.name,
            currentStatus: this.activeNPC.harvestStatus,
            cooldown_until: this.activeNPC.state?.cooldown_until,
            cooldownDuration: this.cooldownDuration,
            cooldownStartTime: this.cooldownStartTime
        });
        
        // Update NPC status
        this.activeNPC.harvestStatus = 'cooldown';
        
        // Get cooldown timing
        if (this.activeNPC.state && this.activeNPC.state.cooldown_until) {
            if (!this.cooldownDuration) {
                this.cooldownDuration = this.activeNPC.effectiveCooldownTime || this.activeNPC.baseCooldownTime || this.activeNPC.cooldownTime || 120000;
            }
            if (!this.cooldownStartTime) {
                this.cooldownStartTime = this.activeNPC.state.cooldown_until - this.cooldownDuration;
            }
            
            console.log('[NPCWidget] ✅ Cooldown timing calculated', {
                cooldown_until: this.activeNPC.state.cooldown_until,
                cooldownDuration: this.cooldownDuration,
                cooldownStartTime: this.cooldownStartTime,
                now: Date.now(),
                timeSinceStart: Date.now() - this.cooldownStartTime
            });
            
            // Update status display
            const statusEl = this.rootElement.querySelector('#npcWidgetStatus');
            if (statusEl) {
                statusEl.textContent = 'Recharging...';
                console.log('[NPCWidget] ✅ Status text updated to "Recharging..."');
            } else {
                console.log('[NPCWidget] ❌ Status element not found');
            }
            
            // Update progress bar immediately
            const progressBar = this.rootElement.querySelector('#npcWidgetProgressBar');
            if (progressBar) {
                progressBar.classList.remove('harvesting', 'cooldown', 'standard');
                progressBar.classList.add('cooldown');
                progressBar.style.background = 'linear-gradient(90deg, #0066ff, #0099ff)';
                progressBar.style.boxShadow = '0 0 8px #0066ff inset';
                
                // Calculate initial cooldown progress
                const now = Date.now();
                const elapsed = now - this.cooldownStartTime;
                const initialProgress = Math.max(0, Math.min(1, elapsed / this.cooldownDuration));
                const progressPercent = Math.max(0, Math.min(100, initialProgress * 100));
                progressBar.style.width = `${progressPercent}%`;
                
                console.log('[NPCWidget] ✅ Progress bar updated for cooldown', {
                    initialProgress: initialProgress,
                    progressPercent: progressPercent.toFixed(1) + '%',
                    elapsed: elapsed,
                    cooldownDuration: this.cooldownDuration
                });
            } else {
                console.log('[NPCWidget] ❌ Progress bar element not found');
            }
            
            // Start cooldown animation
            console.log('[NPCWidget] 🚀 Starting cooldown animation');
            this.startProgressAnimation('cooldown');
        } else {
            console.log('[NPCWidget] ❌ Cannot transition - missing cooldown_until in state', {
                hasState: !!this.activeNPC.state,
                state: this.activeNPC.state
            });
        }
    }
    
    /**
     * Start smooth progress bar animation
     */
    startProgressAnimation(mode) {
        // Clear existing animation
        if (this.progressAnimationInterval) {
            clearInterval(this.progressAnimationInterval);
            this.progressAnimationInterval = null;
        }
        
        if (!this.rootElement) {
            console.log('[NPCWidget] startProgressAnimation: no rootElement');
            return;
        }
        
        const progressBar = this.rootElement.querySelector('#npcWidgetProgressBar');
        if (!progressBar) {
            console.log('[NPCWidget] startProgressAnimation: no progressBar element');
            return;
        }
        
        console.log('[NPCWidget] Starting progress animation, mode:', mode, 'harvestStartTime:', this.harvestStartTime, 'harvestDuration:', this.harvestDuration, 'cooldownStartTime:', this.cooldownStartTime, 'cooldownDuration:', this.cooldownDuration);
        
        // Animate every 50ms for smooth updates
        this.progressAnimationInterval = setInterval(() => {
            if (!this.rootElement || !this.activeNPC) {
                if (this.progressAnimationInterval) {
                    clearInterval(this.progressAnimationInterval);
                    this.progressAnimationInterval = null;
                }
                return;
            }
            
            const now = Date.now();
            let progress = 0;
            
            if (mode === 'harvest' && this.harvestStartTime && this.harvestDuration) {
                // Calculate progress based on elapsed time
                const elapsed = now - this.harvestStartTime;
                const remaining = Math.max(0, this.harvestDuration - elapsed);
                progress = Math.max(0, Math.min(1, remaining / this.harvestDuration));
                
                // Log transition check every second during harvest
                if (Math.floor(elapsed / 1000) !== Math.floor((elapsed - 50) / 1000)) {
                    console.log(`[NPCWidget] Harvest progress check: elapsed=${(elapsed/1000).toFixed(1)}s, remaining=${(remaining/1000).toFixed(1)}s, progress=${(progress*100).toFixed(1)}%, harvestDuration=${(this.harvestDuration/1000).toFixed(1)}s, cooldown_until=${this.activeNPC.state?.cooldown_until || 'null'}, cooldownDuration=${this.cooldownDuration ? (this.cooldownDuration/1000).toFixed(1) + 's' : 'null'}`);
                }
            } else if (mode === 'cooldown' && this.cooldownStartTime && this.cooldownDuration) {
                // Calculate progress based on elapsed time
                const elapsed = now - this.cooldownStartTime;
                progress = Math.max(0, Math.min(1, elapsed / this.cooldownDuration));
            } else {
                // Fallback to server value
                progress = this.lastProgressUpdate !== null ? this.lastProgressUpdate : 0;
            }
            
            const progressPercent = Math.max(0, Math.min(100, progress * 100));
            progressBar.style.width = `${progressPercent}%`;
            
            // Check for harvest->cooldown transition BEFORE stopping animation
            // This ensures smooth transition without delay
            if (mode === 'harvest' && progress <= 0 && this.activeNPC && this.activeNPC.state) {
                console.log('[NPCWidget] ⚠️ TRANSITION CHECK: Harvest progress reached 0!', {
                    mode: mode,
                    progress: progress,
                    progressPercent: progressPercent,
                    now: now,
                    harvestStartTime: this.harvestStartTime,
                    harvestDuration: this.harvestDuration,
                    elapsed: now - this.harvestStartTime,
                    cooldown_until: this.activeNPC.state.cooldown_until,
                    cooldownDuration: this.cooldownDuration,
                    cooldownStartTime: this.cooldownStartTime,
                    activeNPC_state: this.activeNPC.state,
                    activeNPC_harvestStatus: this.activeNPC.harvestStatus
                });
                
                // Check if cooldown should start - use cooldown_until if available
                if (this.activeNPC.state.cooldown_until && now < this.activeNPC.state.cooldown_until) {
                    console.log('[NPCWidget] ✅ TRANSITION: Harvest complete, cooldown_until exists, transitioning to cooldown immediately', {
                        cooldown_until: this.activeNPC.state.cooldown_until,
                        now: now,
                        timeUntilCooldownEnds: this.activeNPC.state.cooldown_until - now
                    });
                    // Clear harvest animation
                    if (this.progressAnimationInterval) {
                        clearInterval(this.progressAnimationInterval);
                        this.progressAnimationInterval = null;
                    }
                    // Transition to cooldown
                    this.transitionToCooldown();
                    return; // Exit early, transitionToCooldown will start new animation
                } else if (!this.activeNPC.state.cooldown_until && this.cooldownDuration) {
                    console.log('[NPCWidget] ⚠️ TRANSITION: Harvest complete, but cooldown_until not set yet. Estimating cooldown...', {
                        cooldownDuration: this.cooldownDuration,
                        estimatedCooldownUntil: now + this.cooldownDuration
                    });
                    // Cooldown_until not set yet, but we have cooldown duration - estimate
                    // Calculate when cooldown should have started based on current time
                    const estimatedCooldownUntil = now + this.cooldownDuration;
                    // Temporarily set cooldown_until for immediate transition
                    if (!this.activeNPC.state.cooldown_until) {
                        this.activeNPC.state.cooldown_until = estimatedCooldownUntil;
                        this.cooldownStartTime = now;
                        console.log('[NPCWidget] ✅ TRANSITION: Estimated cooldown, transitioning now', {
                            estimatedCooldownUntil: estimatedCooldownUntil,
                            cooldownStartTime: this.cooldownStartTime
                        });
                        // Clear harvest animation
                        if (this.progressAnimationInterval) {
                            clearInterval(this.progressAnimationInterval);
                            this.progressAnimationInterval = null;
                        }
                        // Transition to cooldown
                        this.transitionToCooldown();
                        return; // Exit early
                    }
                } else {
                    console.log('[NPCWidget] ❌ TRANSITION BLOCKED: Cannot transition - missing data', {
                        hasCooldownUntil: !!this.activeNPC.state.cooldown_until,
                        hasCooldownDuration: !!this.cooldownDuration,
                        cooldown_until: this.activeNPC.state.cooldown_until,
                        cooldownDuration: this.cooldownDuration
                    });
                }
            }
            
            // Stop animation if complete
            if ((mode === 'harvest' && progress <= 0) || (mode === 'cooldown' && progress >= 1)) {
                if (this.progressAnimationInterval) {
                    clearInterval(this.progressAnimationInterval);
                    this.progressAnimationInterval = null;
                }
            }
        }, 50); // Update every 50ms for smooth animation
    }
    
    /**
     * Get visibility state (for WidgetManager)
     * WidgetManager checks this.activeNPC to determine visibility
     */
    getVisibility() {
        return !!this.activeNPC;
    }
}

