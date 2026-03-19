-- ============================================================================
-- MIGRATION 007: Layout Spec V2
-- Goal:
--   1) support multi-page ROI specs
--   2) support staff-defined answer/identity/table regions
--   3) approval workflow for layout spec
-- ============================================================================

begin;

alter table public.assignment_layout_specs
  add column if not exists schema_version int not null default 2,
  add column if not exists spec_name text,
  add column if not exists page_count int,
  add column if not exists layout_status text not null default 'draft',
  add column if not exists approved_by uuid references public.user_profiles(id),
  add column if not exists approved_at timestamptz,
  add column if not exists notes text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignment_layout_specs_layout_status_check'
  ) then
    alter table public.assignment_layout_specs
      add constraint assignment_layout_specs_layout_status_check
      check (layout_status in ('draft','staff_defined','approved','archived'));
  end if;
end $$;

create index if not exists idx_assignment_layout_specs_assignment_version
  on public.assignment_layout_specs(assignment_id, version desc);

create index if not exists idx_assignment_layout_specs_assignment_status
  on public.assignment_layout_specs(assignment_id, layout_status);

create index if not exists idx_assignment_layout_specs_approved_by
  on public.assignment_layout_specs(approved_by);

-- กัน active spec ซ้อนหลายตัว
create unique index if not exists uq_assignment_layout_specs_active
  on public.assignment_layout_specs(assignment_id)
  where is_active = true;

commit;