-- packages/db/migrations/002_grading_events.sql
-- Audit trail for reviewer actions (append-only)

CREATE TABLE IF NOT EXISTS public.grading_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id UUID NOT NULL REFERENCES public.submissions(id) ON DELETE CASCADE,
    roi_id TEXT NOT NULL,
    page_number INT NOT NULL DEFAULT 1,
    layout_spec_version INT NOT NULL DEFAULT 1,

    actor_id UUID NOT NULL REFERENCES auth.users(id),
    action_type TEXT NOT NULL CHECK (action_type IN ('confirm','override')),

    before_data JSONB,
    after_data JSONB,
    before_hash TEXT,
    after_hash TEXT,

    manual_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grading_events_submission_roi
ON public.grading_events (submission_id, roi_id, page_number);

CREATE INDEX IF NOT EXISTS idx_grading_events_actor_time
ON public.grading_events (actor_id, created_at DESC);

-- -------------------------
-- RLS: strict
-- Only reviewer/instructor/admin can SELECT/INSERT
-- No UPDATE/DELETE (append-only)
-- -------------------------
ALTER TABLE public.grading_events ENABLE ROW LEVEL SECURITY;

-- Helper: assume profiles(role) exists: 'reviewer' | 'instructor' | 'admin'
-- You can adjust roles to your naming.
CREATE POLICY "reviewer_can_select_events" ON public.grading_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('reviewer','instructor','admin')
  )
);

CREATE POLICY "reviewer_can_insert_events" ON public.grading_events
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role IN ('reviewer','instructor','admin')
  )
);

-- Explicitly block UPDATE/DELETE for everyone (even reviewers)
CREATE POLICY "no_update_events" ON public.grading_events
FOR UPDATE
USING (false);

CREATE POLICY "no_delete_events" ON public.grading_events
FOR DELETE
USING (false);

-- Optional hard guard: prevent update/delete via trigger too (defense in depth)
CREATE OR REPLACE FUNCTION public.block_grading_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'grading_events is append-only';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_grading_events_update ON public.grading_events;
CREATE TRIGGER trg_block_grading_events_update
BEFORE UPDATE ON public.grading_events
FOR EACH ROW EXECUTE FUNCTION public.block_grading_events_mutation();

DROP TRIGGER IF EXISTS trg_block_grading_events_delete ON public.grading_events;
CREATE TRIGGER trg_block_grading_events_delete
BEFORE DELETE ON public.grading_events
FOR EACH ROW EXECUTE FUNCTION public.block_grading_events_mutation();