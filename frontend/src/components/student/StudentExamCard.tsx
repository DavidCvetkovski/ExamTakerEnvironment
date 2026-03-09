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
        <article className="rounded-[28px] border border-[#d8c7aa] bg-white p-6 shadow-[0_24px_60px_rgba(83,65,35,0.12)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[#8a6c3e]">{session.course_code}</p>
                    <h3 className="mt-2 text-2xl font-black text-slate-900">{session.test_title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{session.course_title}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${session.can_join ? 'bg-[#dff2e5] text-[#156341]' : 'bg-[#eef0f7] text-slate-600'}`}>
                    {session.can_join ? 'Joinable now' : 'Upcoming'}
                </span>
            </div>

            <div className="mt-5 grid gap-4 rounded-[22px] bg-[#f8f3ea] p-4 text-sm text-slate-700 md:grid-cols-2">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Starts</p>
                    <p className="mt-1 font-semibold">{startsAt.toLocaleString()}</p>
                </div>
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Ends</p>
                    <p className="mt-1 font-semibold">{endsAt.toLocaleString()}</p>
                </div>
            </div>

            <button
                type="button"
                disabled={!session.can_join}
                onClick={() => onJoin(session)}
                aria-label={`${canResume ? 'Resume' : 'Join'} ${session.test_title}`}
                className="mt-6 inline-flex items-center justify-center rounded-2xl bg-[#1055cc] px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-white transition hover:bg-[#0d47ae] disabled:cursor-not-allowed disabled:bg-[#c7d6f5] disabled:text-[#5e77aa]"
            >
                {canResume ? 'Resume Exam' : 'Join Exam'}
            </button>
        </article>
    );
}
