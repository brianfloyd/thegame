-- Migration 074: Seed default markup conventions (< >, [], ! !)
-- These were previously "built-in" but are now treated as regular conventions in the database

-- Insert angle brackets convention (<text>)
INSERT INTO markup_conventions (syntax, opening, closing, description, example, color, effects, created_at, updated_at)
SELECT '<text>', '<', '>', 'Glows with keyword/NPC color (default purple/cyan)', 'The <ancient artifact> glows brightly.', 'keyword', '{"glow": true}'::jsonb, EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000
WHERE NOT EXISTS (
    SELECT 1 FROM markup_conventions WHERE opening = '<' AND closing = '>'
);

-- Insert square brackets convention ([text])
INSERT INTO markup_conventions (syntax, opening, closing, description, example, color, effects, created_at, updated_at)
SELECT '[text]', '[', ']', 'Glows with same color (preserved/inherited)', 'You see [something mysterious] in the distance.', 'inherit', '{"glow": true}'::jsonb, EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000
WHERE NOT EXISTS (
    SELECT 1 FROM markup_conventions WHERE opening = '[' AND closing = ']'
);

-- Insert exclamation marks convention (!text!)
INSERT INTO markup_conventions (syntax, opening, closing, description, example, color, effects, created_at, updated_at)
SELECT '!text!', '!', '!', 'Glows red (emphasis/warning)', '!Danger! The path ahead is treacherous.', '#ff0000', '{"glow": true}'::jsonb, EXTRACT(EPOCH FROM NOW()) * 1000, EXTRACT(EPOCH FROM NOW()) * 1000
WHERE NOT EXISTS (
    SELECT 1 FROM markup_conventions WHERE opening = '!' AND closing = '!'
);















