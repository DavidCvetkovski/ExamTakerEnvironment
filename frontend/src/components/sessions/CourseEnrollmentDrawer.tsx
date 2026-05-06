'use client';

import { useState } from 'react';

import type { Course, Enrollment, StudentCandidate } from '@/stores/useCourseStore';
import { Button } from '@/components/ui';

interface CourseEnrollmentDrawerProps {
    course: Course | null;
    enrollments: Enrollment[];
    studentCandidates: StudentCandidate[];
    isBusy: boolean;
    isOpen: boolean;
    onClose: () => void;
    onAddEnrollment: (courseId: string, payload: { student_id?: string; student_email?: string }) => Promise<void>;
    onRemoveEnrollment: (courseId: string, studentId: string) => Promise<void>;
}

type BulkResult = { email: string; status: 'ok' | 'error'; message?: string };

export default function CourseEnrollmentDrawer({
    course,
    enrollments,
    studentCandidates,
    isBusy,
    isOpen,
    onClose,
    onAddEnrollment,
    onRemoveEnrollment,
}: CourseEnrollmentDrawerProps) {
    const [studentId, setStudentId] = useState('');
    const [enrollMode, setEnrollMode] = useState<'single' | 'bulk'>('single');
    const [bulkEmails, setBulkEmails] = useState('');
    const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
    const [bulkBusy, setBulkBusy] = useState(false);

    if (!isOpen || !course) {
        return null;
    }

    const handleBulkEnroll = async () => {
        const emails = bulkEmails
            .split(/[\n,;]+/)
            .map((e) => e.trim().toLowerCase())
            .filter((e) => e.includes('@'))
            .filter((e, i, arr) => arr.indexOf(e) === i);

        if (emails.length === 0) return;
        setBulkBusy(true);
        setBulkResults([]);

        const results = await Promise.allSettled(
            emails.map((email) =>
                onAddEnrollment(course.id, { student_email: email })
                    .then(() => ({ email, status: 'ok' as const }))
                    .catch((err: unknown) => ({
                        email,
                        status: 'error' as const,
                        message: (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Unknown error',
                    }))
            )
        );

        setBulkResults(results.map((r) => (r.status === 'fulfilled' ? r.value : { email: '?', status: 'error' })));
        setBulkBusy(false);
        setBulkEmails('');
    };

    return (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-sm">
            <div className="h-full w-full max-w-xl overflow-y-auto border-l border-shell-border bg-shell-panel-b p-6 shadow-2xl shadow-black/40">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Course Enrollments</p>
                        <h3 className="mt-2 text-3xl font-black text-foreground">{course.code}</h3>
                        <p className="mt-1 text-sm text-shell-muted-dim">{course.title}</p>
                    </div>
                    <Button variant="secondary" size="sm" onClick={onClose}>Close</Button>
                </div>

                {/* Mode tabs */}
                <div className="mt-6 flex gap-1 rounded-xl border border-shell-border bg-shell-input p-1">
                    {(['single', 'bulk'] as const).map((mode) => (
                        <button
                            key={mode}
                            type="button"
                            onClick={() => setEnrollMode(mode)}
                            className={[
                                'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
                                enrollMode === mode
                                    ? 'bg-shell-surface text-foreground shadow-sm'
                                    : 'text-shell-muted hover:text-foreground',
                            ].join(' ')}
                        >
                            {mode === 'single' ? 'Add one' : 'Add many'}
                        </button>
                    ))}
                </div>

                {enrollMode === 'single' ? (
                    <div className="mt-4 rounded-card border border-shell-border bg-shell-surface/30 p-5">
                        <p className="text-xs font-semibold uppercase tracking-medium text-shell-muted-dim">Add Student</p>
                        <div className="mt-3 flex flex-col gap-3 md:flex-row">
                            <select
                                aria-label="Student"
                                value={studentId}
                                onChange={(event) => setStudentId(event.target.value)}
                                className="flex-1 rounded-2xl border border-shell-border bg-shell-input px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand"
                            >
                                <option value="">Select a student</option>
                                {studentCandidates.map((student) => (
                                    <option key={student.id} value={student.id}>
                                        {student.email}
                                    </option>
                                ))}
                            </select>
                            <Button
                                variant="primary"
                                size="md"
                                disabled={!studentId || isBusy}
                                loading={isBusy}
                                onClick={async () => {
                                    await onAddEnrollment(course.id, { student_id: studentId });
                                    setStudentId('');
                                }}
                            >
                                Enroll
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="mt-4 rounded-card border border-shell-border bg-shell-surface/30 p-5 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-medium text-shell-muted-dim">Bulk Enroll</p>
                        <textarea
                            value={bulkEmails}
                            onChange={(e) => setBulkEmails(e.target.value)}
                            placeholder="Paste emails, one per line or comma-separated"
                            rows={6}
                            className="w-full rounded-xl border border-shell-border bg-shell-input px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand resize-none"
                        />
                        <Button
                            variant="primary"
                            size="md"
                            fullWidth
                            disabled={bulkBusy || !bulkEmails.trim()}
                            loading={bulkBusy}
                            onClick={handleBulkEnroll}
                        >
                            Enroll all
                        </Button>
                        {bulkResults.length > 0 && (
                            <div className="space-y-1.5 mt-2">
                                {bulkResults.map((r, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                        <span className={r.status === 'ok' ? 'text-[var(--color-success-fg)]' : 'text-danger'}>
                                            {r.status === 'ok' ? '✓' : '✗'}
                                        </span>
                                        <span className="text-foreground">{r.email}</span>
                                        {r.message && <span className="text-shell-muted-dim">— {r.message}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-6 rounded-card border border-shell-border bg-shell-surface/20 p-5">
                    <p className="text-xs font-semibold uppercase tracking-medium text-shell-muted-dim">Roster</p>
                    <div className="mt-4 space-y-3">
                        {enrollments.length === 0 ? (
                            <p className="text-sm text-shell-muted-dim">No students enrolled yet.</p>
                        ) : (
                            enrollments.map((enrollment) => (
                                <div key={enrollment.id} className="flex items-center justify-between rounded-2xl border border-shell-border bg-shell-input px-4 py-3">
                                    <div>
                                        <p className="font-medium text-foreground">{enrollment.student_email}</p>
                                        <p className="text-xs uppercase tracking-tight text-shell-muted-dim">
                                            {enrollment.is_active ? 'Active' : 'Inactive'}
                                        </p>
                                    </div>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        disabled={!enrollment.is_active || isBusy}
                                        onClick={() => onRemoveEnrollment(course.id, enrollment.student_id)}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
