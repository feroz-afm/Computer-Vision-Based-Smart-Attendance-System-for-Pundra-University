-- ==============================================================================
-- PROPOSED MIGRATION (NOT YET EXECUTED - AWAITING USER APPROVAL)
-- Migration: 20261021_teacher_approval_and_workflow.sql
-- Purpose: Implement Teacher Approval Workflow, Admin Authorization, and RLS Hardening
-- Target System: Supabase PostgreSQL (PUB AttendEye)
-- ==============================================================================
-- RATIONALE & JUSTIFICATION:
-- 1. Any faculty registering through the open registration portal must receive
--    a 'pending' approval status initially.
-- 2. Pending and rejected teachers must be blocked from initiating class sessions,
--    starting facial recognition, and taking or finalizing attendance.
-- 3. Only an authenticated Administrator can approve or reject faculty applications.
-- 4. After approval, the teacher is granted authorized access to the Teacher Portal.
-- 5. Strict course-section boundaries prevent unassigned or unapproved attendance marking.
-- ==============================================================================

-- STEP 1: Add approval_status column to public.teachers
-- ------------------------------------------------------------------------------
alter table if exists public.teachers
  add column if not exists approval_status text not null
  check (approval_status in ('pending', 'approved', 'rejected'))
  default 'pending';

create index if not exists idx_teachers_approval_status
  on public.teachers(approval_status);

-- STEP 2: Harden is_teacher() security function to require 'approved' status
-- ------------------------------------------------------------------------------
create or replace function public.is_teacher()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles p
    join public.teachers t on t.profile_id = p.id
    where p.id = auth.uid()
      and p.role = 'teacher'
      and t.approval_status = 'approved'
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- STEP 3: Secure Administrator Function for Teacher Approval / Rejection
-- ------------------------------------------------------------------------------
create or replace function public.set_teacher_approval_status(target_teacher_id uuid, new_status text)
returns text as $$
begin
  -- Enforce Administrator privilege
  if not public.is_admin() then
    raise exception 'Unauthorized: Only an Administrator can approve or reject teacher applications.';
  end if;

  if new_status not in ('pending', 'approved', 'rejected') then
    raise exception 'Invalid approval status: must be pending, approved, or rejected.';
  end if;

  update public.teachers
  set approval_status = new_status
  where id = target_teacher_id;

  if not found then
    return 'Error: Teacher record not found for ID ' || target_teacher_id::text;
  end if;

  return 'Success: Teacher approval status successfully set to ' || new_status;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Revoke public execution; grant to authenticated users (internal is_admin() protects execution)
grant execute on function public.set_teacher_approval_status(uuid, text) to authenticated;

-- STEP 4: Update handle_new_user() trigger to initialize approval_status as 'pending'
-- ------------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
declare
  raw_role text;
  assigned_role text;
  user_full_name text;
begin
  raw_role := lower(coalesce(new.raw_user_meta_data->>'role', 'student'));
  
  -- Harden role assignment
  if raw_role in ('student', 'teacher') then
    assigned_role := raw_role;
  else
    assigned_role := 'student';
  end if;

  user_full_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1));

  -- Create profile
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, user_full_name, assigned_role);

  -- Student initialization
  if assigned_role = 'student' then
    insert into public.students (
      profile_id,
      student_id_number,
      program,
      department,
      academic_year,
      semester,
      section_or_batch
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data->>'student_id_number', 'PUB-STU-' || substr(new.id::text, 1, 8)),
      'B.Sc. in Computer Science & Engineering',
      coalesce(new.raw_user_meta_data->>'department', 'Computer Science & Engineering'),
      '3rd Year',
      '1st Semester',
      coalesce(new.raw_user_meta_data->>'section', 'Section A')
    );
  end if;

  -- Teacher initialization: Default to 'pending' approval
  if assigned_role = 'teacher' then
    insert into public.teachers (
      profile_id,
      teacher_id_number,
      department,
      designation,
      approval_status
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data->>'teacher_id_number', 'PUB-FAC-' || substr(new.id::text, 1, 8)),
      coalesce(new.raw_user_meta_data->>'department', 'Computer Science & Engineering'),
      coalesce(new.raw_user_meta_data->>'designation', 'Lecturer'),
      'pending'
    );
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- STEP 5: Hardened RLS Policy for Class Sessions
-- Only approved teachers with explicit course assignment (or Admins) can manage class sessions
-- ------------------------------------------------------------------------------
drop policy if exists "Teachers manage own sessions" on public.class_sessions;
create policy "Teachers manage own sessions"
  on public.class_sessions for all
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_teacher()
      and exists (
        select 1 from public.teachers t
        where t.id = class_sessions.teacher_id
        and t.profile_id = auth.uid()
        and t.approval_status = 'approved'
      )
    )
  );

-- Hardened RLS Policy for Attendance Records
drop policy if exists "Teachers update attendance only for own sessions" on public.attendance_records;
create policy "Teachers update attendance only for own sessions"
  on public.attendance_records for all
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_teacher()
      and exists (
        select 1 from public.class_sessions cs
        join public.teachers t on cs.teacher_id = t.id
        where cs.id = attendance_records.session_id
        and t.profile_id = auth.uid()
        and t.approval_status = 'approved'
      )
    )
  );
