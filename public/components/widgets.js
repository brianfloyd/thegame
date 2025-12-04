/**
 * Widget Components
 * 
 * Alpine.js components for game widgets.
 * Each widget is isolated and subscribes to GameBus events for updates.
 */

(function() {
  'use strict';
  
  // Widget components will be registered here
  // For now, this is a placeholder that ensures widgets.js loads
  // Individual widgets will be migrated to Alpine components in Phase 3
  
  // Subscribe to widget-related events
  GameBus.on('widget:update', (data) => {
    const { widget, state } = data;
    if (GameStore.widgets[widget]) {
      GameStore.setWidgetData(widget, state);
    }
  });
  
  GameBus.on('widget:show', (data) => {
    const { widget } = data;
    GameStore.setWidgetVisible(widget, true);
  });
  
  GameBus.on('widget:hide', (data) => {
    const { widget } = data;
    GameStore.setWidgetVisible(widget, false);
  });
  
  console.log('[Widgets] Widget component system initialized');
  
})();

