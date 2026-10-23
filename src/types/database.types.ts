export type UserRole = 'student' | 'teacher' | 'admin';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url?: string | null;
  phone?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  profile_id: string;
  student_id_number: string;
  program: string;
  department: string;
  academic_year: string;
  semester: string;
  section_or_batch: string;
  account_status: 'active' | 'suspended' | 'pending';
  face_registered: boolean;
  created_at: string;
  profile?: Profile;
}

export interface Teacher {
  id: string;
  profile_id: string;
  teacher_id_number: string;
  department: string;
  designation: string;
  approval_status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  profile?: Profile;
}

export interface Semester {
  id: string;
  name: string;
  code: string;
  is_current: boolean;
  start_date?: string | null;
  end_date?: string | null;
}

export interface Course {
  id: string;
  course_code: string;
  title: string;
  department: string;
  credits: number;
  is_sessional: boolean;
  semester_info: string;
  created_at: string;
}

export interface TeacherCourseAssignment {
  id: string;
  teacher_id: string;
  course_id: string;
  section_name: string;
  room_number?: string | null;
  assigned_by?: string | null;
  is_active: boolean;
  assigned_at: string;
  course?: Course;
  teacher?: Teacher;
}

export interface Enrollment {
  id: string;
  student_id: string;
  course_id: string;
  section_name: string;
  enrollment_status: 'enrolled' | 'dropped' | 'completed';
  enrolled_at: string;
  course?: Course;
  student?: Student;
}

export interface ClassSession {
  id: string;
  course_id: string;
  teacher_id: string;
  section_name: string;
  room_number?: string | null;
  session_date: string;
  start_time: string;
  end_time: string;
  topic: string;
  status: 'draft' | 'active' | 'completed' | 'cancelled';
  started_at?: string | null;
  ended_at?: string | null;
  created_at: string;
  course?: Course;
  teacher?: Teacher;
}

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  verification_method: 'face_recognition' | 'manual_teacher' | 'rfid_card';
  confidence_score?: number | null;
  timestamp: string;
  student?: Student;
  session?: ClassSession;
}

export interface StudentConsent {
  id: string;
  student_id: string;
  consent_given: boolean;
  consent_date?: string | null;
  consent_text: string;
  withdrawn_at?: string | null;
}

export interface FaceEnrollment {
  id: string;
  student_id: string;
  embedding_vector: number[];
  model_version: string;
  samples_count: number;
  is_active: boolean;
  registered_at: string;
}

export interface AttendanceReviewItem {
  id: string;
  session_id: string;
  student_id?: string | null;
  captured_face_label: string;
  confidence_score: number;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at: string;
  student?: Student;
}

export interface AttendanceAuditLog {
  id: string;
  attendance_id: string;
  session_id: string;
  student_id: string;
  previous_status: string;
  new_status: string;
  changed_by: string;
  reason: string;
  changed_at: string;
  user_profile?: Profile;
}

export interface AttendanceSetting {
  id: string;
  semester: string;
  warning_threshold: number;
  critical_threshold: number;
  updated_at: string;
}
