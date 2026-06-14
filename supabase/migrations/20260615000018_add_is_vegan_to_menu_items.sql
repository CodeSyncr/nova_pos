-- Add is_vegan boolean flag to menu_items table
-- Allows POS users to mark menu items as vegan, which is then
-- surfaced on the public-facing menu (e.g. pizzeriada.cafe)

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS is_vegan boolean DEFAULT false;
