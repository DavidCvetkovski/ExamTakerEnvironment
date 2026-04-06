'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useGradingStore, GradingStatus } from '@/stores/useGradingStore';
import { useBlueprintStore } from '@/stores/useBlueprintStore';
import { useAuthStore } from '@/stores/useAuthStore';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusBadge(status: GradingStatus) {
    const map: Record<GradingStatus, { label: string; cls: string }> = {
        UNGRADED:         { label: 'Ungraded',         cls: 'bg-gray-700 text-gray-300' },
        AUTO_GRADED:      { label: 'Auto-graded',      cls: 'bg-blue-900/60 text-blue-300' },
        PARTIALLY_GRADED: { label: 'Partial',          cls: 'bg-amber-900/60 text-amber-300' },
        FULLY_GRADED:     { label: 'Fully graded',     cls: 'bg-emerald-900/60 text-emerald-300' },
    };
    const { label, cls } = map[status] ?? { label: status, cls: 'bg-gray-700 text-gray-300' };
    return (
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${cls}`}>
            {label}
        </span>
    );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-700 rounded-full h-1.5">
                <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-xs text-gray-400 w-14 text-right">{done}/{total}</span>
        </div>
    );
}

function formatStudentLabel(email: string | null): string {
    if (!email) {
        return 'Student Submission';
    }

    const localPart = email.split('@')[0] ?? email;
    return localPart
        .split(/[._-]+/)
        .filter(Boolean)
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
        .join(' ');
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function GradingDashboard() {
    const router = useRouter();
    const { user } = useAuthStore();
    const {
        selectedTestId, gradingOverview, overviewLoading,
        blindMode, publishStatus, error,
        setSelectedTestId,
        fetchGradingOverview, publishResults, unpublishResults,
        exportCsv, toggleBlindMode, clearError,
    } = useGradingStore();
    const { blueprints, fetchBlueprints } = useBlueprintStore();

    const [filterStatus, setFilterStatus] = useState<GradingStatus | 'ALL'>('ALL');
    const [sortKey, setSortKey] = useState<'student' | 'status' | 'percentage'>('student');

    useEffect(() => {
        fetchBlueprints();
    }, [fetchBlueprints]);

    useEffect(() => {
        if (selectedTestId) fetchGradingOverview(selectedTestId);
    }, [selectedTestId, fetchGradingOverview]);

    useEffect(() => {
        if (selectedTestId || blueprints.length === 0) {
            return;
        }

        const defaultBlueprint = blueprints.find(
            (blueprint) => blueprint.title === 'Shuffle Lab: Numbers in Motion'
        ) ?? blueprints[0];

        setSelectedTestId(defaultBlueprint.id);
    }, [blueprints, selectedTestId, setSelectedTestId]);

    // Redirect if not instructor
    if (user?.role === 'STUDENT') {
        router.replace('/my-exams');
        return null;
    }

    const isAdmin = user?.role === 'ADMIN';
    const allFullyGraded = gradingOverview.length > 0 &&
        gradingOverview.every(s => s.grading_status === 'FULLY_GRADED');
    const allPublished = gradingOverview.length > 0 &&
        gradingOverview.every(s => s.is_published);

    const filtered = gradingOverview
        .filter(s => filterStatus === 'ALL' || s.grading_status === filterStatus)
        .sort((a, b) => {
            if (sortKey === 'status') return a.grading_status.localeCompare(b.grading_status);
            if (sortKey === 'percentage') return b.percentage - a.percentage;
            const ae = formatStudentLabel(a.student_email);
            const be = formatStudentLabel(b.student_email);
            return ae.localeCompare(be);
        });

    const stats = {
        total: gradingOverview.length,
        fullyGraded: gradingOverview.filter(s => s.grading_status === 'FULLY_GRADED').length,
        published: gradingOverview.filter(s => s.is_published).length,
        avgPct: gradingOverview.length
            ? Math.round(gradingOverview.reduce((a, s) => a + s.percentage, 0) / gradingOverview.length)
            : 0,
    };

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100">
            {/* ── Header bar ── */}
            <div className="bg-gray-900 border-b border-gray-800 px-6 py-4">
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1">
                        <h1 className="text-xl font-bold text-white">Grading Dashboard</h1>
                        <p className="text-sm text-gray-400 mt-0.5">Review exam submissions and manage result publication</p>
                    </div>

                    {/* Test selector */}
                    <select
                        id="test-selector"
                        value={selectedTestId ?? ''}
                        onChange={e => {
                            setSelectedTestId(e.target.value);
                        }}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 min-w-[240px]"
                    >
                        <option value="">— Select a test —</option>
                        {blueprints.map(b => (
                            <option key={b.id} value={b.id}>{b.title}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
                {/* Error banner */}
                {error && (
                    <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 flex justify-between items-start text-sm">
                        <span>{error}</span>
                        <button onClick={clearError} className="ml-4 text-red-400 hover:text-red-200">✕</button>
                    </div>
                )}

                {!selectedTestId ? (
                    <div className="flex flex-col items-center justify-center py-24 text-gray-500">
                        <div className="text-5xl mb-4">📋</div>
                        <p className="text-lg font-medium">Loading grading queue…</p>
                    </div>
                ) : (
                    <>
                        {/* ── Stats bar ── */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {[
                                { label: 'Total Submissions', value: stats.total, color: 'text-white' },
                                { label: 'Fully Graded', value: `${stats.fullyGraded} / ${stats.total}`, color: 'text-emerald-400' },
                                { label: 'Published', value: stats.published, color: 'text-blue-400' },
                                { label: 'Average Score', value: `${stats.avgPct}%`, color: 'text-amber-400' },
                            ].map(({ label, value, color }) => (
                                <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                                    <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
                                    <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                                </div>
                            ))}
                        </div>

                        {/* ── Action bar ── */}
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Filter */}
                            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-lg p-1">
                                {(['ALL', 'UNGRADED', 'PARTIALLY_GRADED', 'FULLY_GRADED'] as const).map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setFilterStatus(s)}
                                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                            filterStatus === s
                                                ? 'bg-blue-600 text-white'
                                                : 'text-gray-400 hover:text-white'
                                        }`}
                                    >
                                        {s === 'ALL' ? 'All' : s.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>

                            {/* Sort */}
                            <select
                                value={sortKey}
                                onChange={e => setSortKey(e.target.value as typeof sortKey)}
                                className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-gray-300 focus:outline-none focus:border-blue-500"
                            >
                                <option value="student">Sort: Student</option>
                                <option value="status">Sort: Status</option>
                                <option value="percentage">Sort: Score</option>
                            </select>

                            <div className="flex-1" />

                            {/* Blind mode toggle */}
                            <button
                                onClick={toggleBlindMode}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-colors ${
                                    blindMode
                                        ? 'bg-purple-900/40 border-purple-700 text-purple-300'
                                        : 'bg-gray-900 border-gray-700 text-gray-400 hover:text-white'
                                }`}
                            >
                                🕶 {blindMode ? 'Blind ON' : 'Blind Mode'}
                            </button>

                            {/* CSV export (admin only) */}
                            {isAdmin && (
                                <button
                                    onClick={() => selectedTestId && exportCsv(selectedTestId)}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-gray-900 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600 transition-colors"
                                >
                                    ↓ Export CSV
                                </button>
                            )}

                            {/* Publish / unpublish (admin only) */}
                            {isAdmin && (
                                allPublished ? (
                                    <button
                                        onClick={() => selectedTestId && unpublishResults(selectedTestId)}
                                        disabled={publishStatus === 'publishing'}
                                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-amber-700 hover:bg-amber-600 text-white disabled:opacity-50 transition-colors"
                                    >
                                        {publishStatus === 'publishing' ? 'Working…' : 'Unpublish Results'}
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => selectedTestId && publishResults(selectedTestId)}
                                        disabled={!allFullyGraded || publishStatus === 'publishing'}
                                        title={!allFullyGraded ? 'All sessions must be fully graded before publishing' : ''}
                                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {publishStatus === 'publishing' ? 'Publishing…' : 'Publish Results'}
                                    </button>
                                )
                            )}
                        </div>

                        {/* ── Overview table ── */}
                        {overviewLoading ? (
                            <div className="flex items-center justify-center py-16 text-gray-500">
                                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
                                Loading sessions…
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="text-center py-16 text-gray-500">
                                No sessions match the current filter.
                            </div>
                        ) : (
                            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                                <table className="min-w-full text-sm">
                                    <thead className="bg-gray-800/60 text-gray-400 text-xs uppercase tracking-wide">
                                        <tr>
                                            <th className="px-5 py-3 text-left">Student</th>
                                            <th className="px-5 py-3 text-left">Status</th>
                                            <th className="px-5 py-3 text-left">Progress</th>
                                            <th className="px-5 py-3 text-right">Score</th>
                                            <th className="px-5 py-3 text-center">Published</th>
                                            <th className="px-5 py-3 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-800">
                                        {filtered.map((session, index) => (
                                            <tr
                                                key={session.session_id}
                                                className="hover:bg-gray-800/40 transition-colors"
                                            >
                                                <td className="px-5 py-4">
                                                    {blindMode ? (
                                                        <span className="text-purple-400 text-xs font-semibold uppercase tracking-[0.18em]">
                                                            Submission {String(index + 1).padStart(2, '0')}
                                                        </span>
                                                    ) : (
                                                        <div>
                                                            <p className="text-white font-medium text-sm">
                                                                {formatStudentLabel(session.student_email)}
                                                            </p>
                                                            {session.submitted_at && (
                                                                <p className="text-gray-500 text-xs">
                                                                    Submitted {new Date(session.submitted_at).toLocaleString()}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4">
                                                    {statusBadge(session.grading_status)}
                                                </td>
                                                <td className="px-5 py-4 min-w-[160px]">
                                                    <ProgressBar
                                                        done={session.questions_graded}
                                                        total={session.questions_total}
                                                    />
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    <div className="text-white font-semibold">
                                                        {session.percentage.toFixed(1)}%
                                                    </div>
                                                    <div className="text-gray-500 text-xs">
                                                        {session.total_points} / {session.max_points} pts
                                                    </div>
                                                </td>
                                                <td className="px-5 py-4 text-center">
                                                    {session.is_published ? (
                                                        <span className="text-emerald-400 text-lg">✓</span>
                                                    ) : (
                                                        <span className="text-gray-600">–</span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-4 text-right">
                                                    <button
                                                        onClick={() => router.push(`/grading/${session.session_id}`)}
                                                        className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs font-medium rounded-lg transition-colors"
                                                    >
                                                        Grade →
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
