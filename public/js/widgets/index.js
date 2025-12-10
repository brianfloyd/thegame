/**
 * Widget System Index
 * 
 * Central export point for all widget-related modules.
 */

// Widget Registry
export {
    WIDGETS,
    getWidgetById,
    getToggleableWidgets,
    getAutoManagedWidgets,
    getAvailableWidgets,
    getDefaultActiveWidgets,
    isWidgetAvailable
} from './widget_registry.js';

// Widget Manager
export { widgetManager } from './widget_manager.js';

// Widget Shared Utilities
export {
    widgetShared,
    debounce,
    throttle,
    isGodMode,
    hasWarehouseDeed,
    getCurrentRoomType,
    isInFactoryRoom,
    isInWarehouseRoom,
    WIDGET_CLASSES
} from './widget_shared.js';

// Re-export default objects
import widgetRegistry from './widget_registry.js';
import widgetManagerFn from './widget_manager.js';
import widgetSharedUtils from './widget_shared.js';

export default {
    registry: widgetRegistry,
    manager: widgetManagerFn,
    shared: widgetSharedUtils
};


