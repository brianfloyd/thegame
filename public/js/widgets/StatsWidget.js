/**
 * StatsWidget
 * 
 * Handles player stats display and stat point assignment.
 */

import Widget from './Widget.js';

export default class StatsWidget extends Widget {
    constructor(game, id) {
        super(game, id);
        this.statsContent = null;
        this.currentStats = null;
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
        root.className = 'widget widget-stats';
        root.setAttribute('data-widget', 'stats');
        
        // Create header
        const header = document.createElement('div');
        header.className = 'widget-header';
        header.textContent = 'Player Stats';
        root.appendChild(header);
        
        // Create content container
        const content = document.createElement('div');
        content.className = 'widget-content';
        content.id = 'playerStatsContent';
        root.appendChild(content);
        
        return root;
    }
    
    /**
     * Called after widget is attached
     */
    onAttach() {
        this.statsContent = this.rootElement.querySelector('#playerStatsContent');
        
        // Update with current stats if available
        if (this.currentStats) {
            this.updateStats(this.currentStats);
        }
    }
    
    /**
     * Handle backend messages
     */
    onMessage(msg) {
        if (msg.type === 'playerStats' && msg.stats) {
            this.currentStats = msg.stats;
            this.updateStats(msg.stats);
        }
    }
    
    /**
     * Update player stats display
     */
    updateStats(stats) {
        if (!this.statsContent || !stats) return;
        
        this.statsContent.innerHTML = '';
        
        // Get assignable points first
        const assignablePoints = stats.assignablePoints?.value ?? 0;
        
        // Group stats by category
        const statsByCategory = {
            stats: [],
            abilities: [],
            resources: [],
            flags: []
        };
        
        // Organize stats by category
        Object.keys(stats).forEach(key => {
            const stat = stats[key];
            if (stat && stat.category && stat.value !== undefined) {
                if (key.startsWith('max')) return;
                if (key === 'assignablePoints') return;
                if (statsByCategory[stat.category]) {
                    statsByCategory[stat.category].push({
                        key: key,
                        displayName: stat.displayName,
                        value: stat.value
                    });
                }
            }
        });
        
        // Render Assignable Points if available
        if (stats.assignablePoints !== undefined) {
            const assignableSection = document.createElement('div');
            assignableSection.className = 'stats-section assignable-points-section';
            const assignableTitle = document.createElement('div');
            assignableTitle.className = 'stats-section-title';
            assignableTitle.textContent = 'Assignable Points';
            assignableSection.appendChild(assignableTitle);
            const assignableValue = document.createElement('div');
            assignableValue.className = 'widget-stat-row';
            assignableValue.innerHTML = `<span class="widget-stat-value">${assignablePoints}</span>`;
            assignableSection.appendChild(assignableValue);
            this.statsContent.appendChild(assignableSection);
        }
        
        // Render Attributes (stats) - with controls if assignable points > 0
        // Only show controls for top 4 attributes (the rest are abilities)
        if (statsByCategory.stats.length > 0) {
            // Limit to first 4 attributes for controls
            const top4Attributes = statsByCategory.stats.slice(0, 4);
            const statsSection = this.createStatSection('Attributes', top4Attributes, assignablePoints > 0, assignablePoints);
            this.statsContent.appendChild(statsSection);
        }
        
        // Render Abilities (no controls)
        if (statsByCategory.abilities.length > 0) {
            const abilitiesSection = this.createStatSection('Abilities', statsByCategory.abilities, false);
            this.statsContent.appendChild(abilitiesSection);
        }
        
        // Render Resources (Hit Points, Mana, etc.)
        if (statsByCategory.resources.length > 0) {
            const processedResources = new Set();
            
            statsByCategory.resources.forEach(resource => {
                if (resource.key.startsWith('max')) return;
                if (processedResources.has(resource.key)) return;
                
                const maxKey = `max${resource.key.charAt(0).toUpperCase() + resource.key.slice(1)}`;
                const maxStat = stats[maxKey];
                
                if (maxStat && maxStat.value !== undefined && maxStat.value > 0) {
                    const resourceSection = this.createResourceSection(resource.displayName, resource.value, maxStat.value, resource.key);
                    this.statsContent.appendChild(resourceSection);
                    processedResources.add(resource.key);
                    processedResources.add(maxKey);
                } else if (resource.value !== undefined) {
                    const resourceSection = this.createStatSection(resource.displayName, [resource]);
                    this.statsContent.appendChild(resourceSection);
                    processedResources.add(resource.key);
                }
            });
        }
        
        // Add Pulse Echo Progression display
        if (stats.pulseEchoes !== undefined || stats.pulseEchoTier !== undefined) {
            const progressionSection = this.createProgressionSection(
                stats.pulseEchoes?.value || 0,
                stats.pulseEchoTier?.value || 1
            );
            this.statsContent.appendChild(progressionSection);
        }
        
        // Add Encumbrance display
        if (stats.currentEncumbrance !== undefined) {
            const maxEncumbrance = stats.maxEncumbrance?.value || 100;
            const currentEncumbrance = stats.currentEncumbrance;
            const encumbranceSection = this.createEncumbranceSection(currentEncumbrance, maxEncumbrance);
            this.statsContent.appendChild(encumbranceSection);
        }
        
        this.statsContent.scrollTop = this.statsContent.scrollHeight;
    }
    
    /**
     * Create a stat section (Attributes or Abilities)
     */
    createStatSection(title, items, showControls = false, assignablePoints = 0) {
        const section = document.createElement('div');
        section.className = 'widget-section stats-section';
        
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'widget-section-title stats-section-title';
        sectionTitle.textContent = title;
        section.appendChild(sectionTitle);
        
        items.forEach(item => {
            const statItem = document.createElement('div');
            statItem.className = 'widget-stat-row';
            
            const label = document.createElement('span');
            label.className = 'widget-stat-label';
            label.textContent = item.displayName + ':';
            
            const valueContainer = document.createElement('div');
            valueContainer.style.display = 'flex';
            valueContainer.style.alignItems = 'center';
            valueContainer.style.gap = '8px';
            
            const value = document.createElement('span');
            value.className = 'widget-stat-value';
            value.textContent = item.value;
            value.setAttribute('data-stat-key', item.key);
            
            if (showControls) {
                const controlsGroup = document.createElement('div');
                controlsGroup.className = 'stat-controls';
                controlsGroup.setAttribute('data-stat-key', item.key);
                
                const decrementBtn = document.createElement('button');
                decrementBtn.className = 'widget-btn widget-btn-small stat-control-btn';
                decrementBtn.textContent = '−';
                decrementBtn.disabled = item.value <= 1;
                decrementBtn.setAttribute('data-action', 'decrement');
                decrementBtn.setAttribute('data-stat-key', item.key);
                
                const incrementBtn = document.createElement('button');
                incrementBtn.className = 'widget-btn widget-btn-small stat-control-btn';
                incrementBtn.textContent = '+';
                incrementBtn.disabled = assignablePoints <= 0;
                incrementBtn.setAttribute('data-action', 'increment');
                incrementBtn.setAttribute('data-stat-key', item.key);
                
                incrementBtn.addEventListener('click', () => {
                    this.handleAttributePointChange(item.key, 'increment');
                });
                
                decrementBtn.addEventListener('click', () => {
                    this.handleAttributePointChange(item.key, 'decrement');
                });
                
                controlsGroup.appendChild(decrementBtn);
                controlsGroup.appendChild(incrementBtn);
                
                valueContainer.appendChild(value);
                valueContainer.appendChild(controlsGroup);
            } else {
                valueContainer.appendChild(value);
            }
            
            statItem.appendChild(label);
            statItem.appendChild(valueContainer);
            section.appendChild(statItem);
        });
        
        return section;
    }
    
    /**
     * Handle attribute point assignment
     */
    handleAttributePointChange(statKey, action) {
        const ws = this.game.getWebSocket();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            // Use terminal if available
            if (window.terminal) {
                window.terminal.addMessage('Not connected to server. Please wait...', 'error');
            }
            return;
        }
        
        const dbColumnName = `stat_${statKey}`;
        this.game.send({
            type: 'assignAttributePoint',
            statKey: dbColumnName,
            action: action
        });
    }
    
    /**
     * Create resource section (HP, Mana with bars)
     */
    createResourceSection(title, current, max, resourceKey) {
        const section = document.createElement('div');
        section.className = 'widget-section stats-section';
        
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'widget-section-title stats-section-title';
        sectionTitle.textContent = title;
        section.appendChild(sectionTitle);
        
        const statItem = document.createElement('div');
        statItem.className = 'widget-stat-row';
        
        const label = document.createElement('span');
        label.className = 'widget-stat-label';
        label.textContent = `${current} / ${max}`;
        
        const barContainer = document.createElement('div');
        barContainer.className = 'stat-bar-container';
        
        const bar = document.createElement('div');
        bar.className = resourceKey === 'mana' ? 'stat-bar mana-bar' : 'stat-bar hp-bar';
        const percentage = max > 0 ? (current / max) * 100 : 0;
        bar.style.width = `${percentage}%`;
        
        barContainer.appendChild(bar);
        
        statItem.appendChild(label);
        statItem.appendChild(barContainer);
        section.appendChild(statItem);
        
        return section;
    }
    
    /**
     * Create encumbrance section
     */
    createEncumbranceSection(current, max) {
        const section = document.createElement('div');
        section.className = 'widget-section stats-section';
        
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'widget-section-title stats-section-title';
        sectionTitle.textContent = 'Encumbrance';
        section.appendChild(sectionTitle);
        
        const statItem = document.createElement('div');
        statItem.className = 'widget-stat-row';
        
        const label = document.createElement('span');
        label.className = 'widget-stat-label';
        label.textContent = `${current} / ${max}`;
        
        const barContainer = document.createElement('div');
        barContainer.className = 'stat-bar-container';
        
        const bar = document.createElement('div');
        bar.className = 'stat-bar encumbrance-bar';
        const percentage = max > 0 ? (current / max) * 100 : 0;
        bar.style.width = `${percentage}%`;
        
        barContainer.appendChild(bar);
        
        statItem.appendChild(label);
        statItem.appendChild(barContainer);
        section.appendChild(statItem);
        
        return section;
    }
    
    /**
     * Create pulse echo progression section
     */
    createProgressionSection(pulseEchoes, pulseEchoTier) {
        const section = document.createElement('div');
        section.className = 'widget-section stats-section';
        
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'widget-section-title stats-section-title';
        sectionTitle.textContent = 'Progression';
        section.appendChild(sectionTitle);
        
        // Pulse Echoes
        const echoItem = document.createElement('div');
        echoItem.className = 'widget-stat-row';
        
        const echoLabel = document.createElement('span');
        echoLabel.className = 'widget-stat-label';
        echoLabel.textContent = 'Pulse Echoes:';
        
        const echoValue = document.createElement('span');
        echoValue.className = 'widget-stat-value';
        echoValue.style.color = '#00ffff';
        echoValue.textContent = pulseEchoes.toLocaleString();
        
        echoItem.appendChild(echoLabel);
        echoItem.appendChild(echoValue);
        section.appendChild(echoItem);
        
        // Pulse Echo Tier
        const tierItem = document.createElement('div');
        tierItem.className = 'widget-stat-row';
        
        const tierLabel = document.createElement('span');
        tierLabel.className = 'widget-stat-label';
        tierLabel.textContent = 'Echo Tier:';
        
        const tierValue = document.createElement('span');
        tierValue.className = 'widget-stat-value';
        tierValue.style.color = '#ff00ff';
        tierValue.textContent = pulseEchoTier;
        
        tierItem.appendChild(tierLabel);
        tierItem.appendChild(tierValue);
        section.appendChild(tierItem);
        
        return section;
    }
}
