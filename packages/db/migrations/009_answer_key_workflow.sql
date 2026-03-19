-- ============================================================================
-- MIGRATION 009: Answer Key Workflow
-- Goal:
--   1) AI-assisted answer-key generation lifecycle
--   2) approval workflow
--   3) manual override support
-- ============================================================================

begin;

alter table public.assignment_answer_keys
  add column if not exists source_file_id uuid references public.assignment_source_files(id),
  add column if not exists generation_status text not null default 'not_started',
  add column if not exists generated_by_ai boolean not null default false,
  add column if not exists ai_model text,
  add column if not exists approval_status text not null default 'draft',
  add column if not exists approved_by uuid references public.user_profiles(id),
  add column if not exists approved_at timestamptz,
  add column if not exists generation_notes text,
  add column if not exists last_generation_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assignment_answer_keys_generation_status_check'
  ) then
    alter table public.assignment_answer_keys
      add constraint assignment_answer_keys_generation_status_check
      check (generation_status in ('not_started','running','generated','failed'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'assignment_answer_keys_approval_status_check'
  ) then
    alter table public.assignment_answer_keys
      add constraint assignment_answer_keys_approval_status_check
      check (approval_status in ('draft','ai_generated','approved','rejected','manual_uploaded'));
  end if;
end $$;

create index if not exists idx_assignment_answer_keys_generation_status
  on public.assignment_answer_keys(generation_status);

create index if not exists idx_assignment_answer_keys_approval_status
  on public.assignment_answer_keys(approval_status);

create index if not exists idx_assignment_answer_keys_approved_by
  on public.assignment_answer_keys(approved_by);

commit;