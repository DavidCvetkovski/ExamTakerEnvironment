'use client';

import type { StudentScheduledSession } from '@/stores/useStudentSessionsStore';

interface StudentExamCardProps {
    session: StudentScheduledSession;
    onJoin: (session: StudentScheduledSession) => Promise<void>;
}

export default function StudentExamCard({ session, onJoin }: StudentExamCardProps) {
    const startsAt = new Date(session.starts_at);
    const endsAt = new Date(session.ends_at);
    const canResume = Boolean(session.existing_attempt_id) && session.can_join;

    return (
        <article className="rounded-card-md border border-student-border-alt bg-white p-6 shadow-warm-card">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-snug text-student-accent">{session.course_code}</p>
                    <h3 className="mt-2 text-2xl font-black text-slate-900">{session.test_title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{session.course_title}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${session.can_join ? 'bg-student-success-bg text-student-success-text' : 'bg-student-neutral-badge text-slate-600'}`}>
                    {session.can_join ? 'Joinable now' : 'Upcoming'}
                </span>
            </div>

            <div className="mt-5 grid gap-4 rounded-card-sm bg-student-wash p-4 text-sm text-slate-700 md:grid-cols-2">
                <div>
                    <p className="text-xs uppercase tracking-tight text-slate-500">Starts</p>
                    <p className="mt-1 font-semibold">{startsAt.toLocaleString()}</p>
                </div>
                <div>
                    <p className="text-xs uppercase tracking-tight text-slate-500">Ends</p>
                    <p className="mt-1 font-semibold">{endsAt.toLocaleString()}</p>
                </div>
            </div>

            <button
                type="button"
                disabled={!session.can_join}
                onClick={() => onJoin(session)}
                aria-label={`${canResume ? 'Resume' : 'Join'} ${session.test_title}`}
                className="mt-6 inline-flex items-center justify-center rounded-2xl bg-student-primary px-5 py-3 text-sm font-black uppercase tracking-tight text-white transition hover:bg-student-primary-dark disabled:cursor-not-allowed disabled:bg-student-disabled-bg disabled:text-student-disabled-text"
            >
                {canResume ? 'Resume Exam' : 'Join Exam'}
            </button>
        </article>
    );
}
