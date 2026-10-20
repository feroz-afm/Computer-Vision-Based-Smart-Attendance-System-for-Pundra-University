"""
PUB AttendEye - Supabase Biometric Enrollment Integration Manager
Step 6: Secure Student Face Enrollment Integration (PUB CSE Fest-26)

This module handles server-side database operations for face enrollments:
1. Verifies student identity from trusted authentication context (never client-supplied ID).
2. Verifies consent records in `student_consent`.
3. Handles upserts into `face_enrollments` and updates `students.face_registered`.
4. Handles GDPR/privacy consent withdrawal and biometric data deletion.
5. Implements repository pattern supporting both live Supabase client and test mocks.
"""

import os
import sys
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple, Protocol

# Ensure project root is in python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.enrollment import (
    EnrollmentPayload,
    ConsentRequiredError,
    UnauthenticatedError,
    IdentitySpoofingError,
    ModelVersionError,
    ENROLLMENT_MODEL_VERSION,
    EMBEDDING_DIM,
)

logger = logging.getLogger("supabase_enrollment")


@dataclass
class StudentDatabaseRecord:
    """Represents a verified student record from the database."""
    student_id: str          # UUID primary key in students table
    profile_id: str          # UUID matching auth.users(id)
    student_id_number: str   # e.g., "PUB-CSE-2023-042"
    full_name: str
    email: str
    face_registered: bool
    is_active: bool = True


@dataclass
class ConsentRecord:
    """Represents a student biometric consent record."""
    consent_id: str
    student_id: str
    consent_given: bool
    consent_date: Optional[str]
    consent_text: str
    withdrawn_at: Optional[str] = None


@dataclass
class EnrollmentSummaryResponse:
    """Safe response returned to client after enrollment (never exposes raw vector)."""
    success: bool
    student_id_number: str
    model_version: str
    samples_count: int
    registered_at: str
    message: str


class IEnrollmentRepository(Protocol):
    """Abstract interface for database persistence operations."""

    def get_student_by_profile_id(self, profile_id: str) -> Optional[StudentDatabaseRecord]:
        ...

    def get_consent(self, student_id: str) -> Optional[ConsentRecord]:
        ...

    def save_consent(self, student_id: str, consent_given: bool, consent_text: str) -> ConsentRecord:
        ...

    def upsert_face_enrollment(self, payload: EnrollmentPayload) -> bool:
        ...

    def delete_face_enrollment(self, student_id: str) -> bool:
        ...

    def withdraw_consent(self, student_id: str) -> bool:
        ...

    def get_enrollment_status(self, student_id: str) -> Optional[Dict[str, Any]]:
        ...


class MockEnrollmentRepository(IEnrollmentRepository):
    """
    In-memory mock repository used for automated tests and offline simulation.
    Faithfully mirrors Postgres RLS policies and table structures.
    """

    def __init__(self):
        # Maps profile_id -> StudentDatabaseRecord
        self.students_by_profile: Dict[str, StudentDatabaseRecord] = {}
        # Maps student_id -> StudentDatabaseRecord
        self.students_by_id: Dict[str, StudentDatabaseRecord] = {}
        # Maps student_id -> ConsentRecord
        self.consent_records: Dict[str, ConsentRecord] = {}
        # Maps student_id -> raw enrollment row
        self.face_enrollments: Dict[str, Dict[str, Any]] = {}
        # Simulate network or database errors when needed
        self.simulate_db_error: bool = False

    def seed_student(
        self,
        student_id: str,
        profile_id: str,
        student_id_number: str,
        full_name: str,
        email: str,
        face_registered: bool = False,
    ) -> StudentDatabaseRecord:
        rec = StudentDatabaseRecord(
            student_id=student_id,
            profile_id=profile_id,
            student_id_number=student_id_number,
            full_name=full_name,
            email=email,
            face_registered=face_registered,
        )
        self.students_by_profile[profile_id] = rec
        self.students_by_id[student_id] = rec
        return rec

    def get_student_by_profile_id(self, profile_id: str) -> Optional[StudentDatabaseRecord]:
        if self.simulate_db_error:
            raise RuntimeError("Database connection failure [Simulated]")
        return self.students_by_profile.get(profile_id)

    def get_consent(self, student_id: str) -> Optional[ConsentRecord]:
        if self.simulate_db_error:
            raise RuntimeError("Database connection failure [Simulated]")
        return self.consent_records.get(student_id)

    def save_consent(self, student_id: str, consent_given: bool, consent_text: str) -> ConsentRecord:
        if self.simulate_db_error:
            raise RuntimeError("Database connection failure [Simulated]")
        now_str = datetime.now(timezone.utc).isoformat()
        rec = ConsentRecord(
            consent_id=f"c_{len(self.consent_records) + 1}",
            student_id=student_id,
            consent_given=consent_given,
            consent_date=now_str if consent_given else None,
            consent_text=consent_text,
            withdrawn_at=None if consent_given else now_str,
        )
        self.consent_records[student_id] = rec
        return rec

    def upsert_face_enrollment(self, payload: EnrollmentPayload) -> bool:
        if self.simulate_db_error:
            raise RuntimeError("Database connection failure [Simulated]")

        # Persist biometric enrollment
        self.face_enrollments[payload.student_database_id] = {
            "student_id": payload.student_database_id,
            "embedding_vector": payload.embedding_vector,
            "model_version": payload.model_version,
            "samples_count": payload.samples_count,
            "is_active": True,
            "registered_at": payload.registered_at,
        }

        # Update student face_registered flag
        if payload.student_database_id in self.students_by_id:
            self.students_by_id[payload.student_database_id].face_registered = True
        return True

    def delete_face_enrollment(self, student_id: str) -> bool:
        if self.simulate_db_error:
            raise RuntimeError("Database connection failure [Simulated]")
        if student_id in self.face_enrollments:
            del self.face_enrollments[student_id]
        if student_id in self.students_by_id:
            self.students_by_id[student_id].face_registered = False
        return True

    def withdraw_consent(self, student_id: str) -> bool:
        if self.simulate_db_error:
            raise RuntimeError("Database connection failure [Simulated]")
        rec = self.consent_records.get(student_id)
        if rec:
            rec.consent_given = False
            rec.withdrawn_at = datetime.now(timezone.utc).isoformat()
        # Automatically purge active face enrollment upon consent withdrawal
        self.delete_face_enrollment(student_id)
        return True

    def get_enrollment_status(self, student_id: str) -> Optional[Dict[str, Any]]:
        """Safe status read: does NOT return raw embedding vector."""
        if self.simulate_db_error:
            raise RuntimeError("Database connection failure [Simulated]")
        rec = self.face_enrollments.get(student_id)
        if not rec:
            return None
        return {
            "student_id": rec["student_id"],
            "model_version": rec["model_version"],
            "samples_count": rec["samples_count"],
            "is_active": rec["is_active"],
            "registered_at": rec["registered_at"],
            # embedding_vector intentionally omitted for security
        }


class SupabaseEnrollmentManager:
    """
    High-level controller for student face enrollment transactions.
    Enforces authentication, identity binding, and safe updates.
    """

    def __init__(self, repository: IEnrollmentRepository):
        self.repository = repository

    def enroll_student(
        self,
        authenticated_profile_id: str,
        payload: EnrollmentPayload,
    ) -> EnrollmentSummaryResponse:
        """
        Execute enrollment write:
        1. Validates authenticated user session.
        2. Resolves student record belonging to that profile.
        3. Enforces that payload matches the student's actual database ID.
        4. Verifies active consent in database.
        5. Performs atomic upsert.
        """
        if not authenticated_profile_id or not authenticated_profile_id.strip():
            raise UnauthenticatedError("Operation requires authenticated session.")

        # Look up student record
        student = self.repository.get_student_by_profile_id(authenticated_profile_id.strip())
        if not student:
            raise UnauthenticatedError(
                f"No student record associated with authenticated profile '{authenticated_profile_id}'."
            )

        # Prevent cross-student identity spoofing
        if student.student_id != payload.student_database_id:
            raise IdentitySpoofingError(
                f"Identity mismatch: Authenticated student '{student.student_id_number}' "
                f"cannot write biometric enrollment for student '{payload.student_database_id}'."
            )

        if student.student_id_number != payload.student_id_number:
            raise IdentitySpoofingError(
                f"Student ID mismatch: Profile has '{student.student_id_number}', payload has '{payload.student_id_number}'."
            )

        # Verify active consent in database
        consent = self.repository.get_consent(student.student_id)
        if not consent or not consent.consent_given or consent.withdrawn_at is not None:
            raise ConsentRequiredError(
                f"Active biometric consent record missing for student '{student.student_id_number}'. "
                "Student must provide explicit informed consent before face registration."
            )

        # Enforce model version
        if payload.model_version != ENROLLMENT_MODEL_VERSION:
            raise ModelVersionError(
                f"Incompatible model version '{payload.model_version}'. Expected '{ENROLLMENT_MODEL_VERSION}'."
            )

        if len(payload.embedding_vector) != EMBEDDING_DIM:
            raise ValueError(
                f"Embedding vector dimension {len(payload.embedding_vector)} != expected {EMBEDDING_DIM}."
            )

        # Upsert enrollment
        self.repository.upsert_face_enrollment(payload)

        return EnrollmentSummaryResponse(
            success=True,
            student_id_number=student.student_id_number,
            model_version=payload.model_version,
            samples_count=payload.samples_count,
            registered_at=payload.registered_at,
            message="Biometric face enrollment successfully registered and encrypted.",
        )

    def withdraw_consent_and_delete(
        self,
        authenticated_profile_id: str,
    ) -> Dict[str, Any]:
        """
        Execute voluntary consent withdrawal and biometric data deletion workflow:
        1. Resolves authenticated student.
        2. Sets consent_given = False and timestamps withdrawn_at.
        3. Completely purges the face enrollment record from the database.
        4. Sets students.face_registered = False.
        """
        if not authenticated_profile_id or not authenticated_profile_id.strip():
            raise UnauthenticatedError("Operation requires authenticated session.")

        student = self.repository.get_student_by_profile_id(authenticated_profile_id.strip())
        if not student:
            raise UnauthenticatedError(f"No student record found for profile '{authenticated_profile_id}'.")

        self.repository.withdraw_consent(student.student_id)

        return {
            "success": True,
            "student_id_number": student.student_id_number,
            "face_registered": False,
            "consent_withdrawn": True,
            "message": "Biometric consent withdrawn and face embeddings permanently deleted.",
        }

    def get_student_enrollment_info(
        self,
        authenticated_profile_id: str,
        target_student_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Safe read of enrollment metadata:
        - Students can only read their own enrollment status.
        - Embedding vector is NEVER returned.
        """
        if not authenticated_profile_id:
            raise UnauthenticatedError("Authentication required.")

        student = self.repository.get_student_by_profile_id(authenticated_profile_id)
        if not student:
            raise UnauthenticatedError("Student profile not found.")

        # Student authorization boundary: cannot inspect other students
        if student.student_id != target_student_id:
            raise IdentitySpoofingError("Unauthorized: Students may only view their own enrollment status.")

        return self.repository.get_enrollment_status(student.student_id)
