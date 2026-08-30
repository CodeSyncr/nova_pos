-- Track whether an expense skipped the review queue.
--
-- When the person who wrote the message is already allowed to approve
-- expenses, there is nobody above them to ask, so the entry goes straight to
-- the books. The card then needs to say "logged" rather than "awaiting
-- approval", and needs to offer an undo.
alter table public.message_ai_analysis
  add column if not exists auto_approved boolean not null default false;
