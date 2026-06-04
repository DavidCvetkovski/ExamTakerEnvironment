'use client';

import { useMemo, useState } from 'react';

import type { Course, Enrollment, RosterLock, StudentCandidate } from '@/stores/useCourseStore';
import { Button, Drawer, CheckIcon, XIcon, useConfirm, useToast } from '@/components/ui';
import StudentSearchSelect from './StudentSearchSelect';

interface CourseEnrollmentDrawerProps {
    course: Course | null;
    enrollments: Enrollment[];
    studentCandidates: StudentCandidate[];
    rosterLock: RosterLock;
    isBusy: boolean;
    isOpen: boolean;
    onClose: () => void;
    onAddEnrollment: (courseId: string, payload: { student_id?: string; student_email?: string }) => Promise<void>;
    onRemoveEnrollment: (courseId: string, studentId: string) => Promise<void>;
}

type BulkResult = { email: string; status: 'ok' | 'error'; message?: string };

function errorDetail(err: unknown): string {
    return (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Unknown error';
}

export default function CourseEnrollmentDrawer({
    course,
    enrollments,
    studentCandidates,
    rosterLock,
    isBusy,
    isOpen,
    onClose,
    onAddEnrollment,
    onRemoveEnrollment,
}: CourseEnrollmentDrawerProps) {
    const { canEnroll, canRemove, reason } = rosterLock;
    const [enrollMode, setEnrollMode] = useState<'single' | 'bulk'>('single');
    const [bulkEmails, setBulkEmails] = useState('');
    const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);
    const [bulkBusy, setBulkBusy] = useState(false);

    // M-14: parse the email list live so the button shows the exact count before firing.
    const parsedEmails = useMemo(() => {
        return bulkEmails
            .split(/[\n,;]+/)
            .map((e) => e.trim().toLowerCase())
            .filter((e) => e.includes('@'))
            .filter((e, i, arr) => arr.indexOf(e) === i);
    }, [bulkEmails]);
    const { confirm, ConfirmDialog } = useConfirm();
    const { toast } = useToast();

    // Only suggest registered students who are not already on the roster.
    const enrolledIds = useMemo(() => new Set(enrollments.map((e) => e.student_id)), [enrollments]);
    const selectableCandidates = useMemo(
        () => studentCandidates.filter((student) => !enrolledIds.has(student.id)),
        [studentCandidates, enrolledIds],
    );

    if (!course) {
        return null;
    }

    const handleSingleEnroll = async (studentId: string) => {
        try {
            await onAddEnrollment(course.id, { student_id: studentId });
            toast({ tone: 'success', title: 'Student enrolled' });
        } catch (err: unknown) {
            toast({ tone: 'danger', title: 'Could not enroll', description: errorDetail(err) });
        }
    };

    const handleRemove = async (enrollment: Enrollment) => {
        const ok = await confirm({
            title: 'Remove this student?',
            message: `${enrollment.student_email} will lose access to this course's exams. You can re-enroll them later.`,
            confirmLabel: 'Yes, remove',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            await onRemoveEnrollment(course.id, enrollment.student_id);
            toast({ tone: 'success', title: 'Student removed' });
        } catch (err: unknown) {
            toast({ tone: 'danger', title: 'Could not remove', description: errorDetail(err) });
        }
    };

    const handleBulkEnroll = async () => {
        if (parsedEmails.length === 0) return;
        setBulkBusy(true);
        setBulkResults([]);

        const results = await Promise.allSettled(
            parsedEmails.map((email) =>
                onAddEnrollment(course.id, { student_email: email })
                    .then(() => ({ email, status: 'ok' as const }))
                    .catch((err: unknown) => ({ email, status: 'error' as const, message: errorDetail(err) }))
            )
        );

        setBulkResults(results.map((r) => (r.status === 'fulfilled' ? r.value : { email: '?', status: 'error' })));
        setBulkBusy(false);
        setBulkEmails('');
    };

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={course.code}
            side="right"
            widthClassName="w-full max-w-xl"
        >
            <div className="space-y-6">
                <div>
                    <p className="text-eyebrow font-semibold uppercase tracking-wide text-shell-muted-dim">Course</p>
                    <p className="mt-1 text-body text-foreground">{course.title}</p>
                </div>

                {!canEnroll && (
                    <div className="rounded-xl border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-4 py-3">
                        <p className="text-sm font-semibold text-[var(--color-warning-fg)]">Roster locked</p>
                        <p className="mt-1 text-sm text-shell-muted">
                            {reason === 'COMPLETED'
                                ? 'This course has a completed exam, so its roster is final and can no longer change.'
                                : 'This course has an active exam window. Enrollments are locked until the window closes.'}
                        </p>
                    </div>
                )}

                {canEnroll && (
                    <>
                        {reason === 'ONGOING' && (
                            <p className="text-sm text-shell-muted">
                                An exam is in progress. You can still add a late arrival, but students can&apos;t be removed until it ends.
                            </p>
                        )}
                        {/* Mode tabs */}
                        <div className="flex gap-1 rounded-xl border border-shell-border bg-shell-input p-1">
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
                            <div className="rounded-xl border border-shell-border bg-shell-surface/30 p-5">
                                <p className="text-xs font-semibold uppercase tracking-medium text-shell-muted-dim">Add Student</p>
                                <p className="mt-1 text-meta text-shell-muted-dim">Only registered students appear. Pick one to enroll.</p>
                                <div className="mt-3">
                                    <StudentSearchSelect
                                        candidates={selectableCandidates}
                                        onSelect={handleSingleEnroll}
                                        disabled={isBusy}
                                    />
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-xl border border-shell-border bg-shell-surface/30 p-5 space-y-3">
                                <p className="text-xs font-semibold uppercase tracking-medium text-shell-muted-dim">Bulk Enroll</p>
                                <textarea
                                    value={bulkEmails}
                                    onChange={(e) => setBulkEmails(e.target.value)}
                                    placeholder="Paste emails, one per line or comma-separated"
                                    rows={6}
                                    className="w-full rounded-xl border border-shell-border bg-shell-input px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand resize-none"
                                />
                                {/* M-14: live count so the user knows how many addresses were parsed. */}
                                {bulkEmails.trim() && (
                                    <p className="text-xs text-shell-muted-dim">
                                        {parsedEmails.length === 0
                                            ? 'No valid email addresses detected'
                                            : `${parsedEmails.length} valid email address${parsedEmails.length === 1 ? '' : 'es'} detected`}
                                    </p>
                                )}
                                <Button
                                    variant="primary"
                                    size="md"
                                    fullWidth
                                    disabled={bulkBusy || parsedEmails.length === 0}
                                    loading={bulkBusy}
                                    onClick={handleBulkEnroll}
                                >
                                    {parsedEmails.length > 0 ? `Enroll ${parsedEmails.length} student${parsedEmails.length === 1 ? '' : 's'}` : 'Enroll all'}
                                </Button>
                                {bulkResults.length > 0 && (
                                    <div className="space-y-1.5 mt-2">
                                        {bulkResults.map((r, i) => (
                                            <div key={i} className="flex items-center gap-2 text-xs">
                                                <span className={`inline-flex items-center ${r.status === 'ok' ? 'text-[var(--color-success-fg)]' : 'text-danger'}`}>
                                                    {r.status === 'ok' ? <CheckIcon size={12} /> : <XIcon size={12} />}
                                                </span>
                                                <span className="text-foreground">{r.email}</span>
                                                {r.message && <span className="text-shell-muted-dim">— {r.message}</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}

                <div className="rounded-xl border border-shell-border bg-shell-surface/20 p-5">
                    <p className="text-eyebrow font-semibold uppercase tracking-medium text-shell-muted-dim">Roster</p>
                    <div className="mt-4 space-y-3">
                        {enrollments.length === 0 ? (
                            <p className="text-sm text-shell-muted-dim">No students enrolled yet.</p>
                        ) : (
                            enrollments.map((enrollment) => (
                                <div key={enrollment.id} className="flex items-center justify-between rounded-xl border border-shell-border bg-shell-input px-4 py-3">
                                    <p className="font-medium text-foreground">{enrollment.student_email}</p>
                                    {canRemove && (
                                        <Button
                                            variant="destructive"
                                            size="sm"
                                            disabled={isBusy}
                                            onClick={() => handleRemove(enrollment)}
                                        >
                                            Remove
                                        </Button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
            {ConfirmDialog}
        </Drawer>
    );
}
