-- ============================================================================
-- MIGRATION 008: Assignment Source Files
-- Goal:
--   1) track source PDF for each assignment
--   2) support replacement/version metadata
--   3) prepare for future AI answer-key generation pipeline
-- ============================================================================

begin;

create table if not exists public.assignment_source_files (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  file_kind text not null default 'source_pdf',
  storage_path text not null,
  original_filename text,
  mime_type text,
  file_size_bytes bigint,
  uploaded_by uuid references public.user_profiles(id),
  is_active boolean not null default true,
  uploaded_at timestamptz not null default now(),
  replaced_at timestamptz
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'assignment_source_files_file_kind_check'
  ) then
    alter table public.assignment_source_files
      add constraint assignment_source_files_file_kind_check
      check (file_kind in ('source_pdf', 'answer_key_pdf', 'supporting_doc'));
  end if;
end $$;

create index if not exists idx_assignment_source_files_assignment_id
  on public.assignment_source_files(assignment_id);

create index if not exists idx_assignment_source_files_assignment_active
  on public.assignment_source_files(assignment_id, is_active);

create index if not exists idx_assignment_source_files_uploaded_by
  on public.assignment_source_files(uploaded_by);

create unique index if not exists uq_assignment_source_active_pdf
  on public.assignment_source_files(assignment_id, file_kind)
  where is_active = true and file_kind = 'source_pdf';

alter table public.assignment_source_files enable row level security;

drop policy if exists assignment_source_files_select_staff on public.assignment_source_files;
drop policy if exists assignment_source_files_insert_staff on public.assignment_source_files;
drop policy if exists assignment_source_files_update_staff on public.assignment_source_files;
drop policy if exists assignment_source_files_delete_staff on public.assignment_source_files;

create policy assignment_source_files_select_staff
on public.assignment_source_files
for select
using (public.get_my_role() in ('instructor'::user_role, 'reviewer'::user_role, 'admin'::user_role));

create policy assignment_source_files_insert_staff
on public.assignment_source_files
for insert
with check (public.get_my_role() in ('instructor'::user_role, 'admin'::user_role));

create policy assignment_source_files_update_staff
on public.assignment_source_files
for update
using (public.get_my_role() in ('instructor'::user_role, 'admin'::user_role))
with check (public.get_my_role() in ('instructor'::user_role, 'admin'::user_role));

create policy assignment_source_files_delete_staff
on public.assignment_source_files
for delete
using (public.get_my_role() in ('instructor'::user_role, 'admin'::user_role));

commit;