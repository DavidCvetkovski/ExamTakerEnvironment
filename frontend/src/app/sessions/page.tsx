'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import CancelSessionModal from '@/components/sessions/CancelSessionModal';
import CourseEnrollmentDrawer from '@/components/sessions/CourseEnrollmentDrawer';
import ScheduledSessionsTable from '@/components/sessions/ScheduledSessionsTable';
import SessionCreateForm from '@/components/sessions/SessionCreateForm';
import { useToast } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useCourseStore } from '@/stores/useCourseStore';
import { useSessionManagerStore } from '@/stores/useSessionManagerStore';

export default function SessionsPage() {
    const router = useRouter();
    const { toast } = useToast();
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
    const [cancelTarget, setCancelTarget] = useState<string | null>(null);

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

    const handleSchedule = async (payload: {
        course_id: string;
        test_definition_id: string;
        starts_at: string;
    }) => {
        await createScheduledSession(payload);
        toast({ tone: 'success', title: 'Session scheduled', description: 'Students can join at the set start time.' });
    };

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-full bg-shell-bg text-foreground">
                <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
                    <SessionCreateForm
                        courses={courses}
                        blueprints={blueprints}
                        isSubmitting={coursesLoading || sessionsLoading}
                        isAdmin={user?.role === 'ADMIN'}
                        onCreateCourse={createCourse}
                        onSubmit={handleSchedule}
                    />

                    {(coursesError || sessionsError) && (
                        <div className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-meta text-[var(--color-danger-fg)]">
                            {coursesError || sessionsError}
                        </div>
                    )}

                    <ScheduledSessionsTable
                        sessions={scheduledSessions}
                        isBusy={sessionsLoading}
                        onRequestCancel={(id) => setCancelTarget(id)}
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

                <CancelSessionModal
                    sessionId={cancelTarget}
                    onConfirm={async (id) => {
                        await cancelScheduledSession(id);
                        setCancelTarget(null);
                        toast({ tone: 'success', title: 'Session cancelled' });
                    }}
                    onClose={() => setCancelTarget(null)}
                    isBusy={sessionsLoading}
                />
            </div>
        </ProtectedRoute>
    );
}
