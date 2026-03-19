--packages/db/migrations/006_instructor_dashboard_foundation.sql
-- ============================================================================
-- MIGRATION 006: Instructor Dashboard Foundation
-- Canonical identity: public.user_profiles
-- Goal:
--   1) instructor <-> section ownership
--   2) lightweight read views for instructor dashboard
--   3) safe RLS on instructor_sections
-- ============================================================================

begin;

-- =========================================================
-- 1) Instructor -> Section ownership
-- =========================================================
create table if not exists public.instructor_sections (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.user_profiles(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (instructor_id, section_id)
);

create index if not exists idx_instructor_sections_instructor_id
  on public.instructor_sections(instructor_id);

create index if not exists idx_instructor_sections_section_id
  on public.instructor_sections(section_id);

create index if not exists idx_instructor_sections_instructor_section
  on public.instructor_sections(instructor_id, section_id);

comment on table public.instructor_sections is
'Maps instructor users to the sections they are allowed to manage.';

-- =========================================================
-- 2) Helper view: instructor -> visible sections
-- =========================================================
drop view if exists public.v_instructor_sections;

create view public.v_instructor_sections as
select
  isec.instructor_id,
  s.id as section_id,
  s.course_code,
  s.section_number,
  s.term,
  s.created_at
from public.instructor_sections isec
join public.sections s
  on s.id = isec.section_id;

comment on view public.v_instructor_sections is
'Lightweight section list for instructor dashboard.';

-- =========================================================
-- 3) Assignment summary per section
-- =========================================================
drop view if exists public.v_instructor_assignment_summary;

create view public.v_instructor_assignment_summary as
select
  a.id as assignment_id,
  a.section_id,
  a.title,
  a.assignment_type,
  a.week_number,
  a.class_date,
  a.open_at,
  a.due_at,
  a.close_at,
  a.end_of_friday_at,
  count(sub.id)::int as submission_count,
  count(*) filter (where sub.status = 'needs_review')::int as needs_review_count,
  count(*) filter (where sub.status = 'graded')::int as graded_count,
  count(*) filter (where sub.status = 'uploaded')::int as uploaded_count,
  count(*) filter (where sub.status = 'ocr_pending')::int as ocr_pending_count,
  count(*) filter (where sub.status = 'extract_pending')::int as extract_pending_count,
  count(*) filter (where sub.status = 'grade_pending')::int as grade_pending_count,
  coalesce(avg(sub.total_score), 0)::numeric as avg_total_score
from public.assignments a
left join public.submissions sub
  on sub.assignment_id = a.id
group by
  a.id,
  a.section_id,
  a.title,
  a.assignment_type,
  a.week_number,
  a.class_date,
  a.open_at,
  a.due_at,
  a.close_at,
  a.end_of_friday_at;

comment on view public.v_instructor_assignment_summary is
'Pre-aggregated assignment summary for instructor dashboard.';

-- =========================================================
-- 4) Student list per section
-- =========================================================
drop view if exists public.v_instructor_section_student_summary;

create view public.v_instructor_section_student_summary as
select
  ss.section_id,
  up.id as student_id,
  up.student_id_number,
  up.full_name,
  up.email,
  up.registration_status,
  ss.linked_at
from public.student_sections ss
join public.user_profiles up
  on up.id = ss.student_id;

comment on view public.v_instructor_section_student_summary is
'Student list for instructor section detail pages.';

-- =========================================================
-- 5) Attendance summary per section/session
-- =========================================================
drop view if exists public.v_instructor_attendance_summary;

create view public.v_instructor_attendance_summary as
select
  cs.section_id,
  cs.id as session_id,
  cs.class_date,
  cs.starts_at,
  cs.ends_at,
  count(ac.id)::int as checked_in_count,
  count(*) filter (where ac.is_on_time = true)::int as on_time_count
from public.class_sessions cs
left join public.attendance_checkins ac
  on ac.session_id = cs.id
group by
  cs.section_id,
  cs.id,
  cs.class_date,
  cs.starts_at,
  cs.ends_at;

comment on view public.v_instructor_attendance_summary is
'Attendance summary for instructor dashboard.';

-- =========================================================
-- 6) RLS for instructor_sections
-- =========================================================
alter table public.instructor_sections enable row level security;

drop policy if exists instructor_sections_select_own on public.instructor_sections;
drop policy if exists instructor_sections_manage_admin on public.instructor_sections;
drop policy if exists instructor_sections_manage_instructor on public.instructor_sections;

create policy instructor_sections_select_own
on public.instructor_sections
for select
using (
  instructor_id = auth.uid()
  or public.get_my_role() = 'admin'::user_role
);

create policy instructor_sections_manage_admin
on public.instructor_sections
for all
using (public.get_my_role() = 'admin'::user_role)
with check (public.get_my_role() = 'admin'::user_role);

create policy instructor_sections_manage_instructor
on public.instructor_sections
for select
using (
  instructor_id = auth.uid()
);

commit;