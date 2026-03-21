begin;

alter table public.assignments
  add column if not exists is_archived boolean not null default false;

create index if not exists idx_assignments_section_archived
  on public.assignments(section_id, is_archived);

commit;