'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import CourseEnrollmentDrawer from '@/components/sessions/CourseEnrollmentDrawer';
import ScheduledSessionsTable from '@/components/sessions/ScheduledSessionsTable';
import SessionCreateForm from '@/components/sessions/SessionCreateForm';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useCourseStore } from '@/stores/useCourseStore';
import { useSessionManagerStore } from '@/stores/useSessionManagerStore';

export default function SessionsPage() {
    const router = useRouter();
    const { user, isAuthenticated, isLoading: authLoading } = useAuthStore();
    const { blueprints, fetchBlueprints } = useBlueprintStore();
    const {
        courses,
        enrollmentsByCourse,
        studentCandidates,
        fetchCourses,
        createCourse,
        fetchEnrollments,
        addEnrollment,
        removeEnrollment,
        fetchStudentCandidates,
        isLoading: coursesLoading,
        error: coursesError,
    } = useCourseStore();
    const {
        scheduledSessions,
        fetchScheduledSessions,
        createScheduledSession,
        cancelScheduledSession,
        startPracticeSession,
        isLoading: sessionsLoading,
        error: sessionsError,
    } = useSessionManagerStore();

    const [drawerCourseId, setDrawerCourseId] = useState<string | null>(null);

    useEffect(() => {
        if (authLoading || !isAuthenticated || !user) {
            return;
        }

        if (user.role !== 'ADMIN' && user.role !== 'CONSTRUCTOR') {
            return;
        }

        fetchBlueprints();
        fetchCourses();
        fetchStudentCandidates();
        fetchScheduledSessions();
    }, [authLoading, fetchBlueprints, fetchCourses, fetchScheduledSessions, fetchStudentCandidates, isAuthenticated, user]);

    const selectedCourse = courses.find((course) => course.id === drawerCourseId) || null;

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-screen bg-[radial-gradient(circle_at_top,#17263e_0%,#09111d_50%,#04070d_100%)] px-4 py-8 text-white sm:px-6 lg:px-8">
                <div className="mx-auto max-w-7xl space-y-8">
                    <SessionCreateForm
                        courses={courses}
                        blueprints={blueprints}
                        isSubmitting={coursesLoading || sessionsLoading}
                        isAdmin={user?.role === 'ADMIN'}
                        onCreateCourse={createCourse}
                        onSubmit={createScheduledSession}
                    />

                    {(coursesError || sessionsError) && (
                        <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
                            {coursesError || sessionsError}
                        </div>
                    )}

                    <ScheduledSessionsTable
                        sessions={scheduledSessions}
                        isBusy={sessionsLoading}
                        onCancel={cancelScheduledSession}
                        onManageEnrollments={async (courseId) => {
                            setDrawerCourseId(courseId);
                            await fetchEnrollments(courseId);
                        }}
                        onPractice={async (testDefinitionId) => {
                            const sessionId = await startPracticeSession(testDefinitionId);
                            router.push(`/exam/${sessionId}`);
                        }}
                    />
                </div>

                <CourseEnrollmentDrawer
                    course={selectedCourse}
                    enrollments={drawerCourseId ? enrollmentsByCourse[drawerCourseId] || [] : []}
                    studentCandidates={studentCandidates}
                    isBusy={coursesLoading}
                    isOpen={Boolean(selectedCourse)}
                    onClose={() => setDrawerCourseId(null)}
                    onAddEnrollment={addEnrollment}
                    onRemoveEnrollment={removeEnrollment}
                />
            </div>
        </ProtectedRoute>
    );
}
