'use client';

import { useEffect, useMemo, useState } from 'react';
import { useServerNow } from '@/hooks/useServerNow';
import { getClientSkewMs } from '@/lib/serverTime';

import type { TestDefinition } from '@/stores/useBlueprintStore';
import type { Course } from '@/stores/useCourseStore';
import { Button, DatePicker, Field, TimePicker, useToast } from '@/components/ui';
import { formatScheduled } from '@/lib/relativeTime';

interface SessionCreateFormProps {
    courses: Course[];
    blueprints: TestDefinition[];
    isSubmitting: boolean;
    onCreateCourse: (payload: { code: string; title: string }) => Promise<unknown>;
    onSubmit: (payload: {
        course_id: string;
        test_definition_id: string;
        starts_at: string;
    }) => Promise<unknown>;
    isAdmin?: boolean;
}

function defaultStartsAt(): Date {
    return new Date(Date.now() + getClientSkewMs() + 60_000);
}

function isToday(date: Date, now: Date): boolean {
    return date.getFullYear() === now.getFullYear()
        && date.getMonth() === now.getMonth()
        && date.getDate() === now.getDate();
}

export default function SessionCreateForm({
    courses,
    blueprints,
    isSubmitting,
    isAdmin,
    onCreateCourse,
    onSubmit,
}: SessionCreateFormProps) {
    const serverNow = useServerNow(60_000);
    const [courseId, setCourseId] = useState('');
    const [testDefinitionId, setTestDefinitionId] = useState('');
    const [startsAt, setStartsAt] = useState<Date>(defaultStartsAt);
    const [timeZone, setTimeZone] = useState('');
    const [courseCode, setCourseCode] = useState('');
    const [courseTitle, setCourseTitle] = useState('');
    const [courseBusy, setCourseBusy] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    }, []);

    // F3 (Epoch 8.9.1): a blueprint is selectable for a course only when it is
    // assigned to that course or unassigned. Backend enforces this too.
    const availableBlueprints = useMemo(() => {
        if (!courseId) return [];
        return blueprints.filter((bp) => !bp.course_id || bp.course_id === courseId);
    }, [blueprints, courseId]);

    // Reset a now-invalid blueprint selection when the course changes.
    useEffect(() => {
        if (testDefinitionId && !availableBlueprints.some((bp) => bp.id === testDefinitionId)) {
            setTestDefinitionId('');
        }
    }, [availableBlueprints, testDefinitionId]);

    const handleCreateCourse = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!courseCode.trim() || !courseTitle.trim()) return;
        setCourseBusy(true);
        const title = courseTitle.trim();
        try {
            await onCreateCourse({ code: courseCode.trim(), title });
            setCourseCode('');
            setCourseTitle('');
            toast({ tone: 'success', title: 'Course created', description: title });
        } catch (err) {
            toast({ tone: 'danger', title: 'Failed to create course',
                    description: err instanceof Error ? err.message : 'Check your connection.' });
        } finally {
            setCourseBusy(false);
        }
    };

    // M-15: compute the window close time from the selected blueprint + start time
    // so constructors can catch scheduling mistakes before they submit.
    const selectedBp = availableBlueprints.find((bp) => bp.id === testDefinitionId) ?? null;
    const endsAtPreview = selectedBp && startsAt
        ? new Date(startsAt.getTime() + selectedBp.duration_minutes * 60_000)
        : null;

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!courseId || !testDefinitionId || !startsAt) return;
        // L-18: validate against serverNow to handle client clock skew.
        const currentServerTime = new Date(Date.now() + getClientSkewMs());
        if (startsAt.getTime() <= currentServerTime.getTime()) {
            toast({ tone: 'danger', title: 'Pick a future time', description: 'The session must start later than now.' });
            return;
        }
        await onSubmit({
            course_id: courseId,
            test_definition_id: testDefinitionId,
            starts_at: startsAt.toISOString(),
        });
        setStartsAt(defaultStartsAt());
    };

    return (
        <div className={isAdmin ? 'grid gap-6 xl:grid-cols-[1.2fr_0.8fr]' : 'mx-auto max-w-3xl'}>
            <form onSubmit={handleSubmit} className="rounded-2xl border border-shell-border bg-shell-surface-deep p-6 shadow-card">
                <div className="mb-6">
                    <h2 className="text-3xl font-black text-foreground">Schedule an Exam Window</h2>
                    <p className="mt-2 max-w-xl text-sm text-shell-muted-dim">
                        Choose the course, lock a blueprint, and define the exact exam start time. Students only see sessions for courses they are enrolled in.
                    </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-medium text-shell-muted-dim">Course</span>
                        <select
                            aria-label="Course"
                            value={courseId}
                            onChange={(event) => setCourseId(event.target.value)}
                            className="w-full rounded-2xl border border-shell-border bg-shell-input px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand"
                            required
                        >
                            <option value="">Select a course</option>
                            {courses.map((course) => (
                                <option key={course.id} value={course.id}>
                                    {course.title}
                                </option>
                            ))}
                        </select>
                    </label>

                    <label className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-medium text-shell-muted-dim">Blueprint</span>
                        <select
                            aria-label="Blueprint"
                            value={testDefinitionId}
                            onChange={(event) => setTestDefinitionId(event.target.value)}
                            disabled={!courseId}
                            className="w-full rounded-2xl border border-shell-border bg-shell-input px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand disabled:cursor-not-allowed disabled:opacity-50"
                            required
                        >
                            <option value="">{courseId ? 'Select a blueprint' : 'Select a course first'}</option>
                            {availableBlueprints.map((blueprint) => (
                                <option key={blueprint.id} value={blueprint.id}>
                                    {blueprint.title}{!blueprint.course_id ? ' (Unassigned)' : ''}
                                </option>
                            ))}
                        </select>
                    </label>
                </div>

                <div className="mt-4 space-y-3">
                    <div>
                        <span className="text-xs font-semibold uppercase tracking-medium text-shell-muted-dim">Start date and time</span>
                        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-2">
                            <Field label="" className="min-w-0">
                                <DatePicker
                                    value={startsAt}
                                    onChange={(d) => setStartsAt((prev) => {
                                        const next = new Date(d);
                                        next.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
                                        return next;
                                    })}
                                    min={serverNow}
                                />
                            </Field>
                            <Field label="" className="min-w-0">
                                <TimePicker
                                    value={startsAt}
                                    onChange={setStartsAt}
                                    min={isToday(startsAt, serverNow) ? serverNow : undefined}
                                />
                            </Field>
                        </div>
                        {timeZone && (
                            <p className="mt-1.5 text-xs text-shell-muted italic">
                                ↳ Scheduled in your timezone ({timeZone})
                            </p>
                        )}
                        {/* M-15: show the computed window close time. */}
                        {endsAtPreview && (
                            <p className="mt-1 text-xs text-shell-muted-dim">
                                Window closes at approximately{' '}
                                <strong className="text-foreground">{formatScheduled(endsAtPreview.toISOString())}</strong>
                                {' '}({selectedBp!.duration_minutes} min)
                            </p>
                        )}
                    </div>
                </div>

                <div className="mt-6">
                    <Button type="submit" variant="primary" size="lg" fullWidth disabled={isSubmitting} loading={isSubmitting}>
                        {isSubmitting ? 'Scheduling...' : 'Schedule Session'}
                    </Button>
                </div>
            </form>

            {isAdmin && (
                <form onSubmit={handleCreateCourse} className="rounded-2xl border border-shell-border-deep bg-shell-panel-c p-6 shadow-card">
                    <h3 className="text-2xl font-black text-foreground">Create a New Course</h3>
                    <p className="mt-2 text-sm text-shell-muted-dim">
                        Courses gate exam visibility. Enrollments are managed separately once the course exists.
                    </p>

                    <div className="mt-6 space-y-4">
                        <label className="space-y-2 block">
                            <span className="text-xs font-semibold uppercase tracking-medium text-shell-muted-dim">Course code</span>
                            <input
                                aria-label="Course code"
                                value={courseCode}
                                onChange={(event) => setCourseCode(event.target.value)}
                                placeholder="e.g. BIO101"
                                className="w-full rounded-2xl border border-shell-border bg-shell-input-alt px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand"
                            />
                        </label>
                        <label className="space-y-2 block">
                            <span className="text-xs font-semibold uppercase tracking-medium text-shell-muted-dim">Course title</span>
                            <input
                                aria-label="Course title"
                                value={courseTitle}
                                onChange={(event) => setCourseTitle(event.target.value)}
                                placeholder="Introductory Biology"
                                className="w-full rounded-2xl border border-shell-border bg-shell-input-alt px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand"
                            />
                        </label>
                    </div>

                    <div className="mt-6">
                        <Button type="submit" variant="secondary" size="lg" fullWidth disabled={courseBusy} loading={courseBusy}>
                            {courseBusy ? 'Creating...' : 'Create Course'}
                        </Button>
                    </div>
                </form>
            )}
        </div>
    );
}
