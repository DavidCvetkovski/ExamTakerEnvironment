'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import StudentExamCard from '@/components/student/StudentExamCard';
import { useExamStore } from '@/stores/useExamStore';
import { useStudentSessionsStore } from '@/stores/useStudentSessionsStore';

export default function MyExamsPage() {
    const router = useRouter();
    const { sessions, isLoading, error, fetchSessions } = useStudentSessionsStore();
    const joinScheduledSession = useExamStore((state) => state.joinScheduledSession);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    const currentSessions = sessions.filter((session) => session.can_join);
    const upcomingSessions = sessions.filter((session) => !session.can_join);

    return (
        <ProtectedRoute allowedRoles={['STUDENT']}>
            <div className="min-h-screen bg-[linear-gradient(180deg,#fff6e8_0%,#f9fcff_40%,#eef4ff_100%)] px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-6xl space-y-10">
                    <section className="rounded-[34px] border border-[#e8dcc7] bg-[linear-gradient(135deg,#fffdf9_0%,#f4f8ff_100%)] p-8 shadow-[0_35px_80px_rgba(72,52,24,0.12)]">
                        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#8a6c3e]">Student Portal</p>
                        <h1 className="mt-3 text-5xl font-black tracking-tight text-slate-900">My Exams</h1>
                        <p className="mt-4 max-w-2xl text-base text-slate-600">
                            This space only shows the exams you can take. Join live sessions, track upcoming windows, and return here after submission.
                        </p>
                    </section>

                    {error && (
                        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                            {error}
                        </div>
                    )}

                    <section className="space-y-4">
                        <div className="flex items-end justify-between gap-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1055cc]">Current</p>
                                <h2 className="mt-2 text-3xl font-black">Joinable right now</h2>
                            </div>
                            {isLoading && <p className="text-sm text-slate-500">Refreshing...</p>}
                        </div>
                        <div className="grid gap-5 lg:grid-cols-2">
                            {currentSessions.length === 0 ? (
                                <div className="rounded-[28px] border border-dashed border-[#d8c7aa] bg-white/70 px-6 py-10 text-sm text-slate-500">
                                    No current exam sessions are open for you right now.
                                </div>
                            ) : (
                                currentSessions.map((session) => (
                                    <StudentExamCard
                                        key={session.id}
                                        session={session}
                                        onJoin={async (selectedSession) => {
                                            const attemptId = await joinScheduledSession(selectedSession.id);
                                            router.push(`/exam/${attemptId}`);
                                        }}
                                    />
                                ))
                            )}
                        </div>
                    </section>

                    <section className="space-y-4">
                        <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#8a6c3e]">Upcoming</p>
                            <h2 className="mt-2 text-3xl font-black">Scheduled later</h2>
                        </div>
                        <div className="grid gap-5 lg:grid-cols-2">
                            {upcomingSessions.length === 0 ? (
                                <div className="rounded-[28px] border border-dashed border-[#d8c7aa] bg-white/70 px-6 py-10 text-sm text-slate-500">
                                    No future exam sessions are scheduled for you.
                                </div>
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
                </div>
            </div>
        </ProtectedRoute>
    );
}
