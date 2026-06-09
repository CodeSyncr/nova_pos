-- Migration: Add reminder_start_time text field to tasks table
ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS reminder_start_time TEXT;
