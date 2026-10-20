-- ==============================================================================
-- PUB-AttendEye Enterprise Database Architecture & Security Engine
-- Pundra University of Science & Technology (PUB), Bogra, Bangladesh
-- CSE Fest-26 Hackathon Core Database Definition
-- ==============================================================================
-- Idempotent script: Safe to run multiple times in Supabase SQL Editor.
-- Covers: Roles, Students, Teachers, 10 CSE Courses, Teacher Assignments,
-- Enrollments, Class Sessions, Anti-Duplicate Attendance, Biometric Consent,
-- Face Embeddings, Review Queue, Mandatory Audit Logs, and Threshold Settings.
-- ==============================================================================

-- 1. EXTENSIONS
create extension if not exists "uuid-ossp";

-- ------------------------------------------------------------------------------
-- 2. USER PROFILES & INSTITUTIONAL ROLES
-- ------------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('student', 'teacher', 'admin')),
  avatar_url text,
  phone text,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_profiles_role on public.profiles(role);
create index if not exists idx_profiles_email on public.profiles(email);

-- ------------------------------------------------------------------------------
-- 3. STUDENTS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade not null unique,
  student_id_number text not null unique, -- e.g. "PUB-CSE-2023-042"
  program text not null default 'B.Sc. in Computer Science & Engineering',
  department text not null default 'Computer Science & Engineering',
  academic_year text not null default '3rd Year',
  semester text not null default '1st Semester',
  section_or_batch text not null default 'Section A',
  account_status text not null check (account_status in ('active', 'suspended', 'pending')) default 'active',
  face_registered boolean default false,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_students_id_number on public.students(student_id_number);
create index if not exists idx_students_profile_id on public.students(profile_id);

-- ------------------------------------------------------------------------------
-- 4. TEACHERS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade not null unique,
  teacher_id_number text not null unique, -- e.g. "PUB-FAC-014"
  department text not null default 'Computer Science & Engineering',
  designation text not null default 'Lecturer',
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_teachers_id_number on public.teachers(teacher_id_number);
create index if not exists idx_teachers_profile_id on public.teachers(profile_id);

-- ------------------------------------------------------------------------------
-- 5. SEMESTERS & ACADEMIC SECTIONS
-- ------------------------------------------------------------------------------
create table if not exists public.semesters (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- e.g. "Summer 2026"
  code text not null unique, -- e.g. "SUMMER-2026"
  is_current boolean default true,
  start_date date,
  end_date date,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  name text not null, -- "Section A", "Section B"
  semester_code text references public.semesters(code) on delete cascade,
  unique (name, semester_code)
);

-- ------------------------------------------------------------------------------
-- 6. COURSES TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  course_code text not null unique, -- e.g. "CSE 2205"
  title text not null,
  department text not null default 'Computer Science & Engineering',
  credits numeric(3,1) not null default 3.0,
  is_sessional boolean default false,
  semester_info text default '3rd Year, 1st Semester',
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_courses_code on public.courses(course_code);

-- ------------------------------------------------------------------------------
-- 7. TEACHER-COURSE-SECTION ASSIGNMENTS (STRICT AUTHORIZATION BOUNDARY)
-- ------------------------------------------------------------------------------
-- Requirement #5: A teacher can only manage courses and sections explicitly
-- assigned to them by an Administrator.
create table if not exists public.teacher_course_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references public.teachers(id) on delete cascade not null,
  course_id uuid references public.courses(id) on delete cascade not null,
  section_name text not null default 'Section A',
  room_number text default 'Room 402',
  assigned_by uuid references public.profiles(id) on delete set null,
  is_active boolean default true,
  assigned_at timestamptz default timezone('utc'::text, now()) not null,
  unique (teacher_id, course_id, section_name)
);

create index if not exists idx_tca_teacher on public.teacher_course_assignments(teacher_id);
create index if not exists idx_tca_course on public.teacher_course_assignments(course_id);

-- ------------------------------------------------------------------------------
-- 8. ENROLLMENTS TABLE (Students enrolled in specific courses)
-- ------------------------------------------------------------------------------
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade not null,
  course_id uuid references public.courses(id) on delete cascade not null,
  section_name text not null default 'Section A',
  enrollment_status text not null check (enrollment_status in ('enrolled', 'dropped', 'completed')) default 'enrolled',
  enrolled_at timestamptz default timezone('utc'::text, now()) not null,
  unique (student_id, course_id)
);

create index if not exists idx_enrollments_student on public.enrollments(student_id);
create index if not exists idx_enrollments_course on public.enrollments(course_id);

-- ------------------------------------------------------------------------------
-- 9. CLASS SESSIONS TABLE
-- ------------------------------------------------------------------------------
create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references public.courses(id) on delete cascade not null,
  teacher_id uuid references public.teachers(id) on delete cascade not null,
  section_name text not null default 'Section A',
  room_number text default 'Room 402',
  session_date date not null default current_date,
  start_time time not null default '10:00:00',
  end_time time not null default '11:00:00',
  topic text not null default 'Lecture Session',
  status text not null check (status in ('draft', 'active', 'completed', 'cancelled')) default 'completed',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_class_sessions_course on public.class_sessions(course_id);
create index if not exists idx_class_sessions_teacher on public.class_sessions(teacher_id);
create index if not exists idx_class_sessions_date on public.class_sessions(session_date);

-- ------------------------------------------------------------------------------
-- 10. ATTENDANCE RECORDS (DUPLICATE-PROTECTED)
-- ------------------------------------------------------------------------------
create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.class_sessions(id) on delete cascade not null,
  student_id uuid references public.students(id) on delete cascade not null,
  status text not null check (status in ('present', 'absent', 'late', 'excused')) default 'present',
  verification_method text not null check (verification_method in ('face_recognition', 'manual_teacher', 'rfid_card')) default 'face_recognition',
  confidence_score numeric(4,3), -- e.g. 0.985
  timestamp timestamptz default timezone('utc'::text, now()) not null,
  unique (session_id, student_id) -- PREVENTS DUPLICATE ATTENDANCE FOR SAME STUDENT & SESSION
);

create index if not exists idx_attendance_session on public.attendance_records(session_id);
create index if not exists idx_attendance_student on public.attendance_records(student_id);

-- ------------------------------------------------------------------------------
-- 11. STUDENT BIOMETRIC CONSENT RECORDS
-- ------------------------------------------------------------------------------
-- Requirement #9: Explicit student consent before face enrollment.
create table if not exists public.student_consent (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade not null unique,
  consent_given boolean default false,
  consent_date timestamptz,
  consent_text text not null,
  withdrawn_at timestamptz,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 12. FACE ENROLLMENT & BIOMETRIC EMBEDDINGS
-- ------------------------------------------------------------------------------
create table if not exists public.face_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references public.students(id) on delete cascade not null unique,
  embedding_vector float8[] not null, -- 128D or 512D biometric vector
  model_version text not null default 'v1.0-facenet',
  samples_count int not null default 1,
  is_active boolean default true,
  registered_at timestamptz default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 13. RECOGNITION REVIEW QUEUE (UNCERTAIN MATCHES)
-- ------------------------------------------------------------------------------
-- Requirement #9: Low-confidence or uncertain matches routed for human review.
create table if not exists public.attendance_review_queue (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.class_sessions(id) on delete cascade not null,
  student_id uuid references public.students(id) on delete set null,
  captured_face_label text not null,
  confidence_score numeric(4,3) not null,
  status text not null check (status in ('pending', 'approved', 'rejected')) default 'pending',
  reviewed_by uuid references public.teachers(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- ------------------------------------------------------------------------------
-- 14. ATTENDANCE AUDIT LOGS (MANDATORY CORRECTION HISTORY)
-- ------------------------------------------------------------------------------
-- Requirement #10: Every manual correction requires a mandatory reason and log.
create table if not exists public.attendance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  attendance_id uuid references public.attendance_records(id) on delete cascade not null,
  session_id uuid references public.class_sessions(id) on delete cascade not null,
  student_id uuid references public.students(id) on delete cascade not null,
  previous_status text not null,
  new_status text not null,
  changed_by uuid references public.profiles(id) on delete set null not null,
  reason text not null, -- MANDATORY CORRECTION REASON
  changed_at timestamptz default timezone('utc'::text, now()) not null
);

create index if not exists idx_audit_attendance on public.attendance_audit_logs(attendance_id);
create index if not exists idx_audit_session on public.attendance_audit_logs(session_id);

-- ------------------------------------------------------------------------------
-- 15. ATTENDANCE SETTINGS & ALERTS
-- ------------------------------------------------------------------------------
-- Requirement #11: Configurable attendance warning and critical thresholds.
create table if not exists public.attendance_settings (
  id uuid primary key default gen_random_uuid(),
  semester text not null default 'Summer 2026',
  warning_threshold numeric(4,1) not null default 75.0,  -- Below 75% -> Warning
  critical_threshold numeric(4,1) not null default 60.0, -- Below 60% -> Disqualified
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

-- ==============================================================================
-- 16. ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.teachers enable row level security;
alter table public.semesters enable row level security;
alter table public.sections enable row level security;
alter table public.courses enable row level security;
alter table public.teacher_course_assignments enable row level security;
alter table public.enrollments enable row level security;
alter table public.class_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.student_consent enable row level security;
alter table public.face_enrollments enable row level security;
alter table public.attendance_review_queue enable row level security;
alter table public.attendance_audit_logs enable row level security;
alter table public.attendance_settings enable row level security;

-- Helper security functions
create or replace function public.is_admin()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

create or replace function public.is_teacher()
returns boolean as $$
begin
  return exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Profiles Policies
drop policy if exists "Users can view own profile or admin view all" on public.profiles;
create policy "Users can view own profile or admin view all"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id or public.is_admin());

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Admins full access to profiles" on public.profiles;
create policy "Admins full access to profiles"
  on public.profiles for all
  to authenticated
  using (public.is_admin());

-- Role escalation guard: ordinary users cannot change their own or other users' roles
-- NOTE: Because this function is SECURITY DEFINER, current_user is always 'postgres'.
-- We use session_user to detect the real connection identity:
--   SQL Editor / migrations:  session_user = 'postgres' or 'supabase_admin'
--   PostgREST (anon/auth):    session_user = 'authenticator'
--   Service-role requests:    session_user = 'authenticator', JWT role = 'service_role'
create or replace function public.check_profile_role_update()
returns trigger as $$
begin
  -- If role is not being modified, allow immediately
  if new.role is not distinct from old.role then
    return new;
  end if;

  -- Allow if executed by PostgreSQL superuser / SQL Editor / migrations
  if session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  -- Allow if invoked via service_role (trusted server-side backend)
  if coalesce(auth.jwt()->>'role', '') = 'service_role' then
    return new;
  end if;

  -- Otherwise, only an authenticated administrator can modify user roles
  if not public.is_admin() then
    raise exception 'Unauthorized: Only administrators can modify user roles.';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists tr_protect_profile_role on public.profiles;
create trigger tr_protect_profile_role
  before update on public.profiles
  for each row execute function public.check_profile_role_update();

-- Students Policies
drop policy if exists "Students view own record or teachers/admins view" on public.students;
create policy "Students view own record or teachers/admins view"
  on public.students for select
  to authenticated
  using (profile_id = auth.uid() or public.is_teacher() or public.is_admin());

drop policy if exists "Admins manage student records" on public.students;
create policy "Admins manage student records"
  on public.students for all
  to authenticated
  using (public.is_admin());

-- Teachers Policies
drop policy if exists "Authenticated users view teachers" on public.teachers;
create policy "Authenticated users view teachers"
  on public.teachers for select
  to authenticated
  using (true);

drop policy if exists "Admins manage teachers" on public.teachers;
create policy "Admins manage teachers"
  on public.teachers for all
  to authenticated
  using (public.is_admin());

-- Courses & Semesters Policies
drop policy if exists "Authenticated users view courses" on public.courses;
create policy "Authenticated users view courses"
  on public.courses for select
  to authenticated
  using (true);

drop policy if exists "Admins manage courses" on public.courses;
create policy "Admins manage courses"
  on public.courses for all
  to authenticated
  using (public.is_admin());

drop policy if exists "View semesters and sections" on public.semesters;
create policy "View semesters and sections"
  on public.semesters for select
  to authenticated
  using (true);

drop policy if exists "View sections" on public.sections;
create policy "View sections"
  on public.sections for select
  to authenticated
  using (true);

-- Teacher-Course Assignments Policies (CRITICAL REQUIREMENT #5)
drop policy if exists "Teachers view own course assignments" on public.teacher_course_assignments;
create policy "Teachers view own course assignments"
  on public.teacher_course_assignments for select
  to authenticated
  using (
    teacher_id in (select id from public.teachers where profile_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "Admins manage teacher course assignments" on public.teacher_course_assignments;
create policy "Admins manage teacher course assignments"
  on public.teacher_course_assignments for all
  to authenticated
  using (public.is_admin());

-- Enrollments Policies
drop policy if exists "Students view own enrollments" on public.enrollments;
create policy "Students view own enrollments"
  on public.enrollments for select
  to authenticated
  using (
    student_id in (select id from public.students where profile_id = auth.uid())
    or public.is_teacher()
    or public.is_admin()
  );

drop policy if exists "Admins manage enrollments" on public.enrollments;
create policy "Admins manage enrollments"
  on public.enrollments for all
  to authenticated
  using (public.is_admin());

-- Class Sessions Policies (STRICT REQUIREMENT #5)
-- Teacher can only create/update sessions for courses they are assigned to!
drop policy if exists "View class sessions" on public.class_sessions;
create policy "View class sessions"
  on public.class_sessions for select
  to authenticated
  using (true);

drop policy if exists "Teachers create sessions only for assigned courses" on public.class_sessions;
create policy "Teachers create sessions only for assigned courses"
  on public.class_sessions for insert
  to authenticated
  with check (
    public.is_admin()
    or (
      public.is_teacher()
      and teacher_id in (select id from public.teachers where profile_id = auth.uid())
      and exists (
        select 1 from public.teacher_course_assignments tca
        join public.teachers t on tca.teacher_id = t.id
        where t.profile_id = auth.uid()
        and tca.course_id = class_sessions.course_id
        and tca.is_active = true
      )
    )
  );

drop policy if exists "Teachers update own assigned sessions" on public.class_sessions;
create policy "Teachers update own assigned sessions"
  on public.class_sessions for update
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_teacher()
      and teacher_id in (select id from public.teachers where profile_id = auth.uid())
    )
  );

-- Attendance Records Policies
drop policy if exists "Students view own attendance" on public.attendance_records;
create policy "Students view own attendance"
  on public.attendance_records for select
  to authenticated
  using (
    student_id in (select id from public.students where profile_id = auth.uid())
    or public.is_teacher()
    or public.is_admin()
  );

drop policy if exists "Teachers mark attendance only for own sessions" on public.attendance_records;
create policy "Teachers mark attendance only for own sessions"
  on public.attendance_records for insert
  to authenticated
  with check (
    public.is_admin()
    or exists (
      select 1 from public.class_sessions cs
      join public.teachers t on cs.teacher_id = t.id
      where cs.id = attendance_records.session_id
      and t.profile_id = auth.uid()
    )
  );

drop policy if exists "Teachers update attendance only for own sessions" on public.attendance_records;
create policy "Teachers update attendance only for own sessions"
  on public.attendance_records for update
  to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.class_sessions cs
      join public.teachers t on cs.teacher_id = t.id
      where cs.id = attendance_records.session_id
      and t.profile_id = auth.uid()
    )
  );

-- Attendance Audit Logs Policies
drop policy if exists "View audit logs" on public.attendance_audit_logs;
create policy "View audit logs"
  on public.attendance_audit_logs for select
  to authenticated
  using (public.is_teacher() or public.is_admin());

drop policy if exists "Insert audit logs on correction" on public.attendance_audit_logs;
create policy "Insert audit logs on correction"
  on public.attendance_audit_logs for insert
  to authenticated
  with check (auth.uid() = changed_by or public.is_admin());

-- Settings Policies
drop policy if exists "Anyone authenticated can view settings" on public.attendance_settings;
create policy "Anyone authenticated can view settings"
  on public.attendance_settings for select
  to authenticated
  using (true);

drop policy if exists "Admins manage settings" on public.attendance_settings;
create policy "Admins manage settings"
  on public.attendance_settings for all
  to authenticated
  using (public.is_admin());

-- ==============================================================================
-- 17. SECURE USER CREATION TRIGGER & ROLE HARDENING
-- ==============================================================================
-- CRITICAL SECURITY RULE: Users registering via Supabase Auth can only become
-- 'student' or 'teacher'. The 'admin' role CANNOT be self-assigned.
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

  -- Teacher initialization
  if assigned_role = 'teacher' then
    insert into public.teachers (
      profile_id,
      teacher_id_number,
      department,
      designation
    ) values (
      new.id,
      coalesce(new.raw_user_meta_data->>'teacher_id_number', 'PUB-FAC-' || substr(new.id::text, 1, 8)),
      coalesce(new.raw_user_meta_data->>'department', 'Computer Science & Engineering'),
      coalesce(new.raw_user_meta_data->>'designation', 'Lecturer')
    );
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==============================================================================
-- 18. SECURE ADMINISTRATOR PROVISIONING FUNCTION
-- ==============================================================================
-- Execute in Supabase SQL Editor to promote a verified account to Administrator:
-- SELECT public.promote_to_admin('admin@pundra.edu.bd');
create or replace function public.promote_to_admin(target_email text)
returns text as $$
declare
  target_user_id uuid;
begin
  -- Restrict execution: Only superuser/postgres, service_role, or existing admin can execute
  -- NOTE: session_user (not current_user) is used because this function is SECURITY DEFINER
  if session_user not in ('postgres', 'supabase_admin') 
     and (coalesce(auth.jwt()->>'role', '') <> 'service_role')
     and not public.is_admin() then
    raise exception 'Unauthorized: Administrator privileges or SQL Editor access required.';
  end if;

  select id into target_user_id from public.profiles where email = target_email;
  
  if target_user_id is null then
    return 'Error: No profile found for email ' || target_email;
  end if;

  update public.profiles set role = 'admin', updated_at = now() where id = target_user_id;
  return 'Success: User ' || target_email || ' has been securely granted Administrator privileges.';
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Revoke public API / RPC execution; grant only to service_role and postgres
revoke execute on function public.promote_to_admin(text) from public, anon, authenticated;
grant execute on function public.promote_to_admin(text) to service_role;

-- ==============================================================================
-- 19. IDEMPOTENT ACADEMIC SEED DATA (CSE 3rd Year, 1st Semester)
-- ==============================================================================
-- Requirement #6: Exact 10 courses, 21 credits total for Pundra University.

insert into public.semesters (name, code, is_current)
values ('Summer 2026', 'SUMMER-2026', true)
on conflict (code) do nothing;

insert into public.sections (name, semester_code)
values 
  ('Section A', 'SUMMER-2026'),
  ('Section B', 'SUMMER-2026')
on conflict (name, semester_code) do nothing;

insert into public.courses (course_code, title, department, credits, is_sessional, semester_info)
values
  ('CSE 2205', 'Computer Architecture and Organization', 'Computer Science & Engineering', 3.0, false, '3rd Year, 1st Semester'),
  ('CSE 2206', 'Computer Architecture and Organization Sessional', 'Computer Science & Engineering', 1.0, true, '3rd Year, 1st Semester'),
  ('CSE 3103', 'Operating Systems', 'Computer Science & Engineering', 3.0, false, '3rd Year, 1st Semester'),
  ('CSE 3104', 'Operating Systems Sessional', 'Computer Science & Engineering', 1.0, true, '3rd Year, 1st Semester'),
  ('CSE 2201', 'Web Engineering', 'Computer Science & Engineering', 3.0, false, '3rd Year, 1st Semester'),
  ('CSE 2202', 'Web Engineering Sessional', 'Computer Science & Engineering', 1.0, true, '3rd Year, 1st Semester'),
  ('CSE 3205', 'Computer Networking', 'Computer Science & Engineering', 3.0, false, '3rd Year, 1st Semester'),
  ('CSE 3206', 'Computer Networking Sessional', 'Computer Science & Engineering', 1.0, true, '3rd Year, 1st Semester'),
  ('LAW 3201', 'Cyber and Intellectual Property Law', 'Computer Science & Engineering', 2.0, false, '3rd Year, 1st Semester'),
  ('BUS 3101', 'Technology Entrepreneurship for Business', 'Computer Science & Engineering', 3.0, false, '3rd Year, 1st Semester')
on conflict (course_code) do update set
  title = excluded.title,
  credits = excluded.credits,
  is_sessional = excluded.is_sessional;

-- Initialize default settings
insert into public.attendance_settings (semester, warning_threshold, critical_threshold)
values ('Summer 2026', 75.0, 60.0)
on conflict do nothing;
