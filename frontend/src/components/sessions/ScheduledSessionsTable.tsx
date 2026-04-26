'use client';

import type { ScheduledSession } from '@/stores/useSessionManagerStore';

interface ScheduledSessionsTableProps {
    sessions: ScheduledSession[];
    isBusy: boolean;
    onCancel: (sessionId: string) => Promise<void>;
    onPractice: (testDefinitionId: string) => Promise<void>;
    onManageEnrollments: (courseId: string) => void;
}

const statusClasses: Record<ScheduledSession['status'], string> = {
    SCHEDULED: 'bg-cyan-500/15 text-cyan-200 border-cyan-400/30',
    ACTIVE: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
    CLOSED: 'bg-slate-500/15 text-slate-300 border-slate-400/20',
    CANCELED: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
};

export default function ScheduledSessionsTable({
    sessions,
    isBusy,
    onCancel,
    onPractice,
    onManageEnrollments,
}: ScheduledSessionsTableProps) {
    return (
        <div className="rounded-[28px] border border-white/10 bg-[#0d1321] p-6 shadow-2xl shadow-black/20">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Scheduled Sessions</p>
                    <h3 className="mt-2 text-2xl font-black text-white">Exam Windows by Course</h3>
                </div>
                <p className="text-sm text-slate-500">
                    Active and upcoming sessions are updated from their real time window.
                </p>
            </div>

            {sessions.length === 0 ? (
                <div className="rounded-[24px] border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center text-sm text-slate-500">
                    No scheduled sessions yet.
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead className="text-xs uppercase tracking-[0.24em] text-slate-500">
                            <tr>
                                <th className="pb-3 pr-4">Course</th>
                                <th className="pb-3 pr-4">Blueprint</th>
                                <th className="pb-3 pr-4">Starts</th>
                                <th className="pb-3 pr-4">Ends</th>
                                <th className="pb-3 pr-4">Status</th>
                                <th className="pb-3">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sessions.map((session) => (
                                <tr key={session.id} className="border-t border-white/6">
                                    <td className="py-4 pr-4">
                                        <p className="font-semibold text-white">{session.course_code}</p>
                                        <p className="text-slate-500">{session.course_title}</p>
                                    </td>
                                    <td className="py-4 pr-4 text-slate-200">{session.test_title}</td>
                                    <td className="py-4 pr-4 text-slate-300">{new Date(session.starts_at).toLocaleString()}</td>
                                    <td className="py-4 pr-4 text-slate-400">{new Date(session.ends_at).toLocaleString()}</td>
                                    <td className="py-4 pr-4">
                                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses[session.status]}`}>
                                            {session.status}
                                        </span>
                                    </td>
                                    <td className="py-4">
                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() => onManageEnrollments(session.course_id)}
                                                className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/5"
                                            >
                                                Enrollments
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onPractice(session.test_definition_id)}
                                                className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
                                            >
                                                Practice
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onCancel(session.id)}
                                                disabled={isBusy || session.status === 'CLOSED' || session.status === 'CANCELED'}
                                                className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
