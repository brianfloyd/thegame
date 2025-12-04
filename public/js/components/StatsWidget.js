/**
 * StatsWidget Component
 * 
 * Handles player stats display and stat point assignment.
 */

import Component from '../core/Component.js';

export default class StatsWidget extends Component {
    constructor(game) {
        super(game);
        this.statsContent = null;
    }
    
    init() {
        super.init();
        
        this.statsContent = document.getElementById('playerStatsContent');
        if (!this.statsContent) {
            console.error('[StatsWidget] playerStatsContent element not found');
            return;
        }
        
        // Subscribe to player stats events
        this.subscribe('player:stats', (data) => this.updateStats(data.stats));
    }
    
    /**
     * Update player stats display
     */
    updateStats(stats) {
        if (!this.statsContent || !stats) return;
        
        this.statsContent.innerHTML = '';
        
        // Get assignable points first
        const assignablePoints = stats.assignablePoints?.value || 0;
        
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
            assignableValue.className = 'stat-item';
            assignableValue.innerHTML = `<span class="stat-value">${assignablePoints}</span>`;
            assignableSection.appendChild(assignableValue);
            this.statsContent.appendChild(assignableSection);
        }
        
        // Render Attributes (stats) - with controls if assignable points > 0
        if (statsByCategory.stats.length > 0) {
            const statsSection = this.createStatSection('Attributes', statsByCategory.stats, assignablePoints > 0, assignablePoints);
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
        section.className = 'stats-section';
        
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'stats-section-title';
        sectionTitle.textContent = title;
        section.appendChild(sectionTitle);
        
        items.forEach(item => {
            const statItem = document.createElement('div');
            statItem.className = 'stat-item';
            
            const label = document.createElement('span');
            label.className = 'stat-label';
            label.textContent = item.displayName + ':';
            
            const valueContainer = document.createElement('div');
            valueContainer.style.display = 'flex';
            valueContainer.style.alignItems = 'center';
            valueContainer.style.gap = '8px';
            
            const value = document.createElement('span');
            value.className = 'stat-value';
            value.textContent = item.value;
            value.setAttribute('data-stat-key', item.key);
            
            if (showControls) {
                const controlsGroup = document.createElement('div');
                controlsGroup.className = 'stat-controls';
                controlsGroup.setAttribute('data-stat-key', item.key);
                
                const decrementBtn = document.createElement('button');
                decrementBtn.className = 'stat-control-btn';
                decrementBtn.textContent = '−';
                decrementBtn.disabled = item.value <= 1;
                decrementBtn.setAttribute('data-action', 'decrement');
                decrementBtn.setAttribute('data-stat-key', item.key);
                
                const incrementBtn = document.createElement('button');
                incrementBtn.className = 'stat-control-btn';
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
            this.emit('terminal:message', { message: 'Not connected to server. Please wait...', type: 'error' });
            return;
        }
        
        const dbColumnName = `stat_${statKey}`;
        this.game.send({
            type: 'assignStatPoint',
            statColumn: dbColumnName,
            action: action
        });
    }
    
    /**
     * Create resource section (HP, Mana with bars)
     */
    createResourceSection(title, current, max, resourceKey) {
        const section = document.createElement('div');
        section.className = 'stats-section';
        
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'stats-section-title';
        sectionTitle.textContent = title;
        section.appendChild(sectionTitle);
        
        const statItem = document.createElement('div');
        statItem.className = 'stat-item';
        
        const label = document.createElement('span');
        label.className = 'stat-label';
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
        section.className = 'stats-section';
        
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'stats-section-title';
        sectionTitle.textContent = 'Encumbrance';
        section.appendChild(sectionTitle);
        
        const statItem = document.createElement('div');
        statItem.className = 'stat-item';
        
        const label = document.createElement('span');
        label.className = 'stat-label';
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
}


