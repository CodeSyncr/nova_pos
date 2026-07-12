-- Add space_rental_amount to orders table
-- Lets staff add a flat "Space Rental" charge to an order (set when
-- completing the order) that is included in the order total and
-- reflected on the printed/sent bill.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS space_rental_amount numeric(10, 2) DEFAULT 0;
