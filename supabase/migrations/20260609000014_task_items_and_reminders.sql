-- Migration: Add sub-items checklist and reminder settings to tasks table
ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reminder_interval INTEGER, -- in minutes (e.g., 5)
  ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMP WITH TIME ZONE;
