-- Merchant Pricing and Configuration Fields
-- Add price, buyable, sellable, and config_json fields to merchant_items table

-- Add price field (integer, default 0)
ALTER TABLE merchant_items ADD COLUMN IF NOT EXISTS price INTEGER NOT NULL DEFAULT 0;

-- Add buyable field (boolean, default TRUE - items can be bought by players)
ALTER TABLE merchant_items ADD COLUMN IF NOT EXISTS buyable BOOLEAN NOT NULL DEFAULT TRUE;

-- Add sellable field (boolean, default FALSE - merchant doesn't buy this item by default)
ALTER TABLE merchant_items ADD COLUMN IF NOT EXISTS sellable BOOLEAN NOT NULL DEFAULT FALSE;

-- Add config_json field (flexible JSON configuration for future extensions)
ALTER TABLE merchant_items ADD COLUMN IF NOT EXISTS config_json TEXT DEFAULT '{}';


















