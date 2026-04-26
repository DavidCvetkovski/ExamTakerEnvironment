'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import StudentExamCard from '@/components/student/StudentExamCard';
import { useExamStore } from '@/stores/useExamStore';
import { useStudentSessionsStore } from '@/stores/useStudentSessionsStore';
import { useResultsStore } from '@/stores/useResultsStore';

export default function MyExamsPage() {
    const router = useRouter();
    const { sessions, isLoading, error, fetchSessions } = useStudentSessionsStore();
    const joinScheduledSession = useExamStore((state) => state.joinScheduledSession);
    const { myResults, myResultsLoading, fetchMyResults } = useResultsStore();

    useEffect(() => {
        fetchSessions();
        fetchMyResults();
    }, [fetchSessions, fetchMyResults]);

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
                    {/* ── My Results section ── */}
                    {(myResults.length > 0 || myResultsLoading) && (
                        <section className="space-y-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1055cc]">Results</p>
                                <h2 className="mt-2 text-3xl font-black">My Grades</h2>
                            </div>
                            {myResultsLoading ? (
                                <div className="text-sm text-slate-500">Loading results…</div>
                            ) : (
                                <div className="grid gap-4 lg:grid-cols-2">
                                    {myResults.map(result => (
                                        <Link
                                            key={result.session_id}
                                            href={`/my-results/${result.session_id}`}
                                            className="block rounded-[24px] border border-[#e8dcc7] bg-white/80 p-5 shadow-sm hover:shadow-md hover:border-[#1055cc]/40 transition-all"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="font-bold text-slate-900 text-sm">
                                                        {result.test_title ?? 'Exam Result'}
                                                    </p>
                                                    {result.submitted_at && (
                                                        <p className="text-xs text-slate-500 mt-0.5">
                                                            Submitted {new Date(result.submitted_at).toLocaleDateString()}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-lg font-black text-slate-900">{result.percentage.toFixed(1)}%</p>
                                                    <p className="text-xs text-slate-500">
                                                        {result.total_points} / {result.max_points} pts
                                                    </p>
                                                </div>
                                            </div>
                                            {result.letter_grade && (
                                                <div className="mt-3 flex items-center gap-2">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                                        result.passed
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-rose-100 text-rose-700'
                                                    }`}>
                                                        {result.letter_grade}
                                                    </span>
                                                    <span className="text-xs text-[#1055cc] font-medium">View Details →</span>
                                                </div>
                                            )}
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}
