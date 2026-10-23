-- ==============================================================================
-- PROPOSED MIGRATION (DEPLOYMENT-READY & HARDENED)
-- Migration: 20261022_student_profile_and_course_access.sql
-- Target System: Supabase PostgreSQL (PUB AttendEye)
-- Idempotent: Safe to execute multiple times in Supabase SQL Editor.
-- ==============================================================================
-- SUMMARY OF REVIEWED & HARDENED CHANGES:
--   1. Real Student Profile & Course Synchronization
--   2. RLS policy update for active instructor assignment visibility
--   3. Strict self-provisioning policies & tamper guards on public.students
--      (allows admin/SQL Editor updates and biometric sync while blocking student tampering)
--   4. Storage bucket 'avatars' creation and user-scoped storage policies
--   5. Robust handle_new_user() trigger with ON CONFLICT & unique handling
--   6. Robust promote_to_admin() supporting auth.users synchronization
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- STEP 1: Enable Authenticated Users to View Active Course Assignments
-- ------------------------------------------------------------------------------
-- Allows students to display assigned faculty names on course enrollment cards
drop policy if exists "Teachers view own course assignments" on public.teacher_course_assignments;
drop policy if exists "Authenticated view active teacher course assignments" on public.teacher_course_assignments;

create policy "Authenticated view active teacher course assignments"
  on public.teacher_course_assignments for select
  to authenticated
  using (is_active = true or public.is_teacher() or public.is_admin());

-- ------------------------------------------------------------------------------
-- STEP 2: Strict Student Self-Provisioning & Tamper-Proof Trigger Guard
-- ------------------------------------------------------------------------------
-- Allow students to maintain non-sensitive profile details (section, semester, department)
-- while strictly forbidding student tampering with account_status, face_registered, or profile ownership.
drop policy if exists "Students insert own record" on public.students;
create policy "Students insert own record"
  on public.students for insert
  to authenticated
  with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists "Students update own non-sensitive record" on public.students;
create policy "Students update own non-sensitive record"
  on public.students for update
  to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- Hardened Trigger Guard:
-- 1. Permits SQL Editor / migration updates (session_user in ('postgres', 'supabase_admin'))
-- 2. Permits backend service_role updates
-- 3. Permits authenticated admin updates
-- 4. Permits internal biometric sync trigger updates (pg_trigger_depth() > 1)
-- 5. Reverts student attempts to modify account_status, face_registered, or profile_id
create or replace function public.check_student_record_update()
returns trigger as $$
begin
  -- Allow superuser, migrations, and SQL Editor
  if session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  -- Allow backend service_role operations
  if coalesce(auth.jwt()->>'role', '') = 'service_role' then
    return new;
  end if;

  -- Allow authenticated administrators
  if public.is_admin() then
    return new;
  end if;

  -- Allow nested triggers (such as tr_sync_student_face_registered on face_enrollments)
  -- to update face_registered flag while keeping account_status and profile_id locked
  if pg_trigger_depth() > 1 then
    new.account_status := old.account_status;
    new.profile_id := old.profile_id;
    return new;
  end if;

  -- Ordinary students cannot alter account status, face registration, or profile ownership
  new.account_status := old.account_status;
  new.face_registered := old.face_registered;
  new.profile_id := old.profile_id;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists tr_protect_student_record on public.students;
create trigger tr_protect_student_record
  before update on public.students
  for each row execute function public.check_student_record_update();

-- ------------------------------------------------------------------------------
-- STEP 3: Setup Supabase Storage Bucket for Profile Photos / Avatars
-- ------------------------------------------------------------------------------
-- Avatars bucket with user-scoped folders (auth.uid()).
-- Note: 'public = true' enables direct CDN image loading in standard <img> tags.
-- If private storage is strictly required by institutional policy, set public to false
-- and use supabase.storage.from('avatars').createSignedUrl() in the frontend client.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Public access to avatar images" on storage.objects;
create policy "Public access to avatar images"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Authenticated users upload own avatars" on storage.objects;
create policy "Authenticated users upload own avatars"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Authenticated users update own avatars" on storage.objects;
create policy "Authenticated users update own avatars"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Authenticated users delete own avatars" on storage.objects;
create policy "Authenticated users delete own avatars"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars' 
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------------------------
-- STEP 4: Robust handle_new_user() Trigger Synchronization
-- ------------------------------------------------------------------------------
-- Ensures accurate student metadata mapping (batch, semester, section),
-- prevents admin privilege self-assignment, and guarantees registration never crashes
-- due to unique constraint violations on student_id_number or teacher_id_number.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  raw_role text;
  assigned_role text;
  user_full_name text;
begin
  raw_role := lower(coalesce(new.raw_user_meta_data->>'role', 'student'));
  
  -- Harden role assignment: Only 'student' or 'teacher' can be self-requested
  if raw_role in ('student', 'teacher') then
    assigned_role := raw_role;
  else
    assigned_role := 'student';
  end if;

  user_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(new.email, '@', 1)
  );

  -- Upsert profile row (idempotent, preserves existing role if already promoted)
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, user_full_name, assigned_role)
  on conflict (id) do update set
    full_name = excluded.full_name,
    email = excluded.email;

  -- Student initialization
  if assigned_role = 'student' then
    begin
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
        coalesce(
          nullif(trim(new.raw_user_meta_data->>'student_id_number'), ''),
          'PUB-STU-' || substr(replace(new.id::text, '-', ''), 1, 10)
        ),
        coalesce(
          nullif(trim(new.raw_user_meta_data->>'program'), ''),
          'B.Sc. in Computer Science & Engineering'
        ),
        coalesce(
          nullif(trim(new.raw_user_meta_data->>'department'), ''),
          'Computer Science & Engineering'
        ),
        coalesce(
          nullif(trim(new.raw_user_meta_data->>'academic_year'), ''),
          '3rd Year'
        ),
        coalesce(
          nullif(trim(new.raw_user_meta_data->>'semester'), ''),
          '1st Semester'
        ),
        coalesce(
          nullif(trim(new.raw_user_meta_data->>'section_or_batch'), ''),
          nullif(trim(new.raw_user_meta_data->>'batch'), ''),
          nullif(trim(new.raw_user_meta_data->>'section'), ''),
          'Section A'
        )
      )
      on conflict (profile_id) do update set
        student_id_number = coalesce(nullif(trim(excluded.student_id_number), ''), public.students.student_id_number),
        semester = coalesce(nullif(trim(excluded.semester), ''), public.students.semester),
        section_or_batch = coalesce(nullif(trim(excluded.section_or_batch), ''), public.students.section_or_batch);
    exception
      when unique_violation then
        -- If student_id_number collided with an existing record, fall back to unique UUID-based identifier
        begin
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
            'PUB-STU-' || substr(replace(new.id::text, '-', ''), 1, 10),
            coalesce(nullif(trim(new.raw_user_meta_data->>'program'), ''), 'B.Sc. in Computer Science & Engineering'),
            coalesce(nullif(trim(new.raw_user_meta_data->>'department'), ''), 'Computer Science & Engineering'),
            coalesce(nullif(trim(new.raw_user_meta_data->>'academic_year'), ''), '3rd Year'),
            coalesce(nullif(trim(new.raw_user_meta_data->>'semester'), ''), '1st Semester'),
            coalesce(
              nullif(trim(new.raw_user_meta_data->>'section_or_batch'), ''),
              nullif(trim(new.raw_user_meta_data->>'batch'), ''),
              nullif(trim(new.raw_user_meta_data->>'section'), ''),
              'Section A'
            )
          )
          on conflict (profile_id) do nothing;
        exception
          when others then null;
        end;
    end;
  end if;

  -- Teacher initialization: Default to 'pending' approval
  if assigned_role = 'teacher' then
    begin
      insert into public.teachers (
        profile_id,
        teacher_id_number,
        department,
        designation,
        approval_status
      ) values (
        new.id,
        coalesce(
          nullif(trim(new.raw_user_meta_data->>'teacher_id_number'), ''),
          'PUB-FAC-' || substr(replace(new.id::text, '-', ''), 1, 10)
        ),
        coalesce(
          nullif(trim(new.raw_user_meta_data->>'department'), ''),
          'Computer Science & Engineering'
        ),
        coalesce(
          nullif(trim(new.raw_user_meta_data->>'designation'), ''),
          'Lecturer'
        ),
        'pending'
      )
      on conflict (profile_id) do nothing;
    exception
      when unique_violation then
        begin
          insert into public.teachers (
            profile_id,
            teacher_id_number,
            department,
            designation,
            approval_status
          ) values (
            new.id,
            'PUB-FAC-' || substr(replace(new.id::text, '-', ''), 1, 10),
            coalesce(nullif(trim(new.raw_user_meta_data->>'department'), ''), 'Computer Science & Engineering'),
            coalesce(nullif(trim(new.raw_user_meta_data->>'designation'), ''), 'Lecturer'),
            'pending'
          )
          on conflict (profile_id) do nothing;
        exception
          when others then null;
        end;
    end;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------------------
-- STEP 5: Robust Administrator Provisioning Function
-- ------------------------------------------------------------------------------
-- Support promoting an Auth user even if their public.profiles row was not yet
-- initialized, with case-insensitive email lookup and strict privilege checks.
create or replace function public.promote_to_admin(target_email text)
returns text as $$
declare
  target_user_id uuid;
  clean_email text;
begin
  -- Enforce execution boundaries: Only superuser/postgres, service_role, or existing admin
  if session_user not in ('postgres', 'supabase_admin') 
     and (coalesce(auth.jwt()->>'role', '') <> 'service_role')
     and not public.is_admin() then
    raise exception 'Unauthorized: Administrator privileges or SQL Editor access required.';
  end if;

  clean_email := lower(trim(target_email));

  -- Find user ID from profiles first, then auth.users as fallback
  select id into target_user_id from public.profiles where lower(email) = clean_email;
  
  if target_user_id is null then
    select id into target_user_id from auth.users where lower(email) = clean_email;
    if target_user_id is null then
      return 'Error: No registered user found in auth.users or public.profiles for email ' || target_email;
    end if;

    -- Create profile if missing
    insert into public.profiles (id, email, full_name, role)
    values (target_user_id, clean_email, split_part(clean_email, '@', 1), 'admin')
    on conflict (id) do update set role = 'admin', updated_at = now();
  else
    update public.profiles set role = 'admin', updated_at = now() where id = target_user_id;
  end if;

  return 'Success: User ' || target_email || ' has been securely granted Administrator privileges.';
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function public.promote_to_admin(text) from public, anon, authenticated;
grant execute on function public.promote_to_admin(text) to service_role;
