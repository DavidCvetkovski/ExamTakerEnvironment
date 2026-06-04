'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import StudentExamCard from '@/components/student/StudentExamCard';
import { useExamStore } from '@/stores/useExamStore';
import { useStudentSessionsStore, type StudentScheduledSession } from '@/stores/useStudentSessionsStore';
import { useLifecycleSync } from '@/hooks/useLifecycleSync';
import { EmptyState, PageHeader, SectionHeader } from '@/components/ui';

export default function MyExamsPage() {
    const router = useRouter();
    const { sessions, isLoading, error, fetchSessions } = useStudentSessionsStore();
    const joinScheduledSession = useExamStore((state) => state.joinScheduledSession);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    // Epoch 8.6 Stage 1 — replace the blunt 30s poll with a transition-aware
    // refetch. A card flips from "Upcoming" → "Joinable now" within ~500ms of
    // `starts_at`, instead of waiting up to 30 seconds.
    useLifecycleSync(sessions, fetchSessions);

    // A session the student has already submitted (or that expired on them)
    // belongs on /my-grades, not here. Without this guard a submitted session
    // lingers in "Upcoming" until `ends_at` passes, which reads as a bug.
    const isFinishedForStudent = (s: StudentScheduledSession) =>
        s.existing_attempt_status === 'SUBMITTED' ||
        s.existing_attempt_status === 'EXPIRED';

    // L-11: a STARTED attempt always has a clear path back regardless of can_join.
    // Pulled out into its own bucket so a student with an in-progress attempt is
    // never stranded (e.g. when can_join is false due to a clock edge case).
    const inProgressSessions = sessions.filter(
        (s) => s.existing_attempt_status === 'STARTED',
    );
    const inProgressIds = new Set(inProgressSessions.map((s) => s.id));
    const currentSessions = sessions.filter(
        (s) => s.can_join && !isFinishedForStudent(s) && !inProgressIds.has(s.id),
    );
    const upcomingSessions = sessions.filter(
        (s) => !s.can_join && !isFinishedForStudent(s) && !inProgressIds.has(s.id),
    );

    return (
        <ProtectedRoute allowedRoles={['STUDENT']}>
            <div className="min-h-full bg-shell-bg text-foreground">
                <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
                    <PageHeader
                        eyebrow="Student portal"
                        title="My Exams"
                        subtitle="Join live sessions, track upcoming windows, and review your results."
                    />

                    {error && (
                        <div className="mb-6 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] px-4 py-3 text-meta">
                            {error}
                        </div>
                    )}

                    {/* L-11: Resume bucket — always visible when an attempt is in progress. */}
                    {inProgressSessions.length > 0 && (
                        <section className="space-y-4 mb-10">
                            <SectionHeader eyebrow="In progress" title="Resume your exam" />
                            <div className="grid gap-5 lg:grid-cols-2">
                                {inProgressSessions.map((session) => (
                                    <StudentExamCard
                                        key={session.id}
                                        session={session}
                                        onJoin={async (selected) => {
                                            const attemptId = await joinScheduledSession(selected.id);
                                            router.push(`/exam/${attemptId}`);
                                        }}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    <section className="space-y-4 mb-10">
                        <SectionHeader
                            eyebrow="Current"
                            title="Joinable right now"
                            actions={isLoading ? <span className="text-meta text-shell-muted-dim">Refreshing…</span> : undefined}
                        />
                        <div className="grid gap-5 lg:grid-cols-2">
                            {currentSessions.length === 0 ? (
                                <EmptyState
                                    title="Nothing live"
                                    description="No current exam sessions are open for you right now."
                                    variant="compact"
                                    className="lg:col-span-2"
                                />
                            ) : (
                                currentSessions.map((session) => (
                                    <StudentExamCard
                                        key={session.id}
                                        session={session}
                                        onJoin={async (selected) => {
                                            const attemptId = await joinScheduledSession(selected.id);
                                            router.push(`/exam/${attemptId}`);
                                        }}
                                    />
                                ))
                            )}
                        </div>
                    </section>

                    <section className="space-y-4 mb-10">
                        <SectionHeader eyebrow="Upcoming" title="Scheduled later" />
                        <div className="grid gap-5 lg:grid-cols-2">
                            {upcomingSessions.length === 0 ? (
                                <EmptyState
                                    title="Nothing scheduled"
                                    description="No future exam sessions are scheduled for you."
                                    variant="compact"
                                    className="lg:col-span-2"
                                />
                            ) : (
                                upcomingSessions.map((session) => (
                                    <StudentExamCard
                                        key={session.id}
                                        session={session}
                                        onJoin={async () => Promise.resolve()}
                                    />
                                ))
                            )}
                        </div>
                    </section>

                    <div className="mt-4">
                        <Link
                            href="/my-grades"
                            className="inline-flex items-center gap-1.5 text-meta font-medium text-brand hover:underline"
                        >
                            Looking for past results? See My Grades →
                        </Link>
                    </div>
                </div>
            </div>
        </ProtectedRoute>
    );
}
