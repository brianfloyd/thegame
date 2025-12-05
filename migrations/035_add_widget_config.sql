-- Add widget_config column to players table
ALTER TABLE players ADD COLUMN IF NOT EXISTS widget_config TEXT DEFAULT '{"activeWidgets":[],"scriptingWidgetPosition":"top"}';

-- Update existing players to have default value if null
UPDATE players SET widget_config = '{"activeWidgets":[],"scriptingWidgetPosition":"top"}' WHERE widget_config IS NULL;













