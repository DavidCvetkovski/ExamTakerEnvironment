from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.core.dependencies import require_role
from app.models.user import User, UserRole
from app.schemas.course import (
    CourseCreate,
    CourseResponse,
    EnrollmentCreateRequest,
    EnrollmentResponse,
    StudentCandidateResponse,
)
from app.services.courses_service import (
    add_course_enrollment,
    create_course,
    list_course_enrollments,
    list_courses,
    list_student_candidates,
    remove_course_enrollment,
)

router = APIRouter(prefix="/courses", tags=["courses"])


@router.post("/", response_model=CourseResponse, status_code=status.HTTP_201_CREATED)
async def create_course_endpoint(
    payload: CourseCreate,
    current_user: User = Depends(require_role(UserRole.ADMIN)),
):
    """Create a new course."""
    return await create_course(payload, str(current_user.id))


@router.get("/", response_model=List[CourseResponse])
async def list_courses_endpoint(
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """List all courses."""
    return await list_courses()


@router.get("/student-candidates", response_model=List[StudentCandidateResponse])
async def list_student_candidates_endpoint(
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """List active students available for enrollment."""
    return await list_student_candidates()


@router.get("/{course_id}/enrollments", response_model=List[EnrollmentResponse])
async def list_course_enrollments_endpoint(
    course_id: UUID,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """List enrollments for a course."""
    return await list_course_enrollments(course_id)


@router.post("/{course_id}/enrollments", response_model=EnrollmentResponse, status_code=status.HTTP_201_CREATED)
async def add_course_enrollment_endpoint(
    course_id: UUID,
    payload: EnrollmentCreateRequest,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Enroll a student in a course."""
    return await add_course_enrollment(course_id, payload)


@router.delete("/{course_id}/enrollments/{student_id}")
async def remove_course_enrollment_endpoint(
    course_id: UUID,
    student_id: UUID,
    current_user: User = Depends(require_role(UserRole.CONSTRUCTOR, UserRole.ADMIN)),
):
    """Deactivate a student's enrollment for a course."""
    return await remove_course_enrollment(course_id, student_id)
