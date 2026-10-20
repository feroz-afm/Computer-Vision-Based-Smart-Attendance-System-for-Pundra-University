-- ==============================================================================
-- PROPOSED MIGRATION (NOT YET EXECUTED - AWAITING USER APPROVAL)
-- Migration: 20261020_secure_face_enrollment_rls.sql
-- Purpose: Harden Biometric Face Enrollment Model Version and Add RLS Policies
-- Target System: Supabase PostgreSQL (PUB AttendEye)
-- ==============================================================================
-- RATIONALE & JUSTIFICATION:
-- 1. In the initial schema.sql, face_enrollments was created with default 'v1.0-facenet'.
--    However, PUB AttendEye's active vision engine uses OpenCV SFace ('v1.0-sface', 128D).
--    Treating FaceNet and SFace embeddings interchangeably is mathematically invalid.
--    This migration updates the default and adds a CHECK constraint to enforce 'v1.0-sface'.
--
-- 2. In schema.sql, row level security was enabled on student_consent and face_enrollments,
--    but no explicit RLS policies were created. Under PostgreSQL defaults, this results in
--    complete denial of all operations for authenticated students.
--
-- 3. This migration establishes least-privilege RLS policies allowing students to:
--    - View and manage their own biometric consent.
--    - View their own face enrollment registration status.
--    - Delete / withdraw their own biometric embeddings without administrative assistance.
--    - Protect raw 128D embedding vectors from being viewed or modified by other students.
-- ==============================================================================

-- STEP 1: Align model_version default and add strict constraint
alter table if exists public.face_enrollments 
  alter column model_version set default 'v1.0-sface';

-- Add check constraint ensuring only supported SFace model embeddings can be stored
alter table if exists public.face_enrollments
  drop constraint if exists check_face_model_version;

alter table if exists public.face_enrollments
  add constraint check_face_model_version
  check (model_version = 'v1.0-sface');

-- STEP 2: Explicit RLS Policies for student_consent
-- ------------------------------------------------------------------------------
drop policy if exists "Students view own consent record" on public.student_consent;
create policy "Students view own consent record"
  on public.student_consent for select
  to authenticated
  using (
    student_id in (select id from public.students where profile_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "Students insert or update own consent record" on public.student_consent;
create policy "Students insert or update own consent record"
  on public.student_consent for insert
  to authenticated
  with check (
    student_id in (select id from public.students where profile_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "Students modify own consent record" on public.student_consent;
create policy "Students modify own consent record"
  on public.student_consent for update
  to authenticated
  using (
    student_id in (select id from public.students where profile_id = auth.uid())
    or public.is_admin()
  )
  with check (
    student_id in (select id from public.students where profile_id = auth.uid())
    or public.is_admin()
  );

-- STEP 3: Explicit RLS Policies for face_enrollments
-- ------------------------------------------------------------------------------
-- Students can check whether they are enrolled
drop policy if exists "Students view own face enrollment status" on public.face_enrollments;
create policy "Students view own face enrollment status"
  on public.face_enrollments for select
  to authenticated
  using (
    student_id in (select id from public.students where profile_id = auth.uid())
    or public.is_admin()
  );

-- Students can insert/upsert their own verified embedding ONLY if active consent exists
drop policy if exists "Students insert own face enrollment with consent" on public.face_enrollments;
create policy "Students insert own face enrollment with consent"
  on public.face_enrollments for insert
  to authenticated
  with check (
    (
      student_id in (select id from public.students where profile_id = auth.uid())
      and exists (
        select 1 from public.student_consent sc
        where sc.student_id = face_enrollments.student_id
        and sc.consent_given = true
        and sc.withdrawn_at is null
      )
    )
    or public.is_admin()
  );

-- Students can update their own embedding (re-enrollment) ONLY with active consent
drop policy if exists "Students update own face enrollment with consent" on public.face_enrollments;
create policy "Students update own face enrollment with consent"
  on public.face_enrollments for update
  to authenticated
  using (
    student_id in (select id from public.students where profile_id = auth.uid())
    or public.is_admin()
  )
  with check (
    (
      student_id in (select id from public.students where profile_id = auth.uid())
      and exists (
        select 1 from public.student_consent sc
        where sc.student_id = face_enrollments.student_id
        and sc.consent_given = true
        and sc.withdrawn_at is null
      )
    )
    or public.is_admin()
  );

-- Voluntary GDPR/Privacy consent-withdrawal & biometric deletion policy
-- Students can delete their own stored embedding at any time
drop policy if exists "Students delete own face enrollment upon withdrawal" on public.face_enrollments;
create policy "Students delete own face enrollment upon withdrawal"
  on public.face_enrollments for delete
  to authenticated
  using (
    student_id in (select id from public.students where profile_id = auth.uid())
    or public.is_admin()
  );

-- STEP 4: Trigger to automatically sync students.face_registered flag
-- ------------------------------------------------------------------------------
create or replace function public.sync_student_face_registered_flag()
returns trigger as $$
begin
  if (TG_OP = 'INSERT' or TG_OP = 'UPDATE') then
    update public.students
    set face_registered = (new.is_active = true)
    where id = new.student_id;
    return new;
  elsif (TG_OP = 'DELETE') then
    update public.students
    set face_registered = false
    where id = old.student_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists tr_sync_student_face_registered on public.face_enrollments;
create trigger tr_sync_student_face_registered
  after insert or update or delete on public.face_enrollments
  for each row execute function public.sync_student_face_registered_flag();

-- ==============================================================================
-- END OF PROPOSED MIGRATION
-- ==============================================================================
