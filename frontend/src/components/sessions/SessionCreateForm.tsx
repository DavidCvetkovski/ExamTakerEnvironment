'use client';

import { useEffect, useState } from 'react';

import type { TestDefinition } from '@/stores/useBlueprintStore';
import type { Course } from '@/stores/useCourseStore';
import { Button, DatePicker, Field, TimePicker } from '@/components/ui';

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
    return new Date(Date.now() + 60_000);
}

export default function SessionCreateForm({
    courses,
    blueprints,
    isSubmitting,
    isAdmin,
    onCreateCourse,
    onSubmit,
}: SessionCreateFormProps) {
    const [courseId, setCourseId] = useState('');
    const [testDefinitionId, setTestDefinitionId] = useState('');
    const [startsAt, setStartsAt] = useState<Date>(defaultStartsAt);
    const [timeZone, setTimeZone] = useState('');
    const [courseCode, setCourseCode] = useState('');
    const [courseTitle, setCourseTitle] = useState('');
    const [courseBusy, setCourseBusy] = useState(false);

    useEffect(() => {
        setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    }, []);

    const handleCreateCourse = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!courseCode.trim() || !courseTitle.trim()) return;
        setCourseBusy(true);
        try {
            await onCreateCourse({ code: courseCode.trim(), title: courseTitle.trim() });
            setCourseCode('');
            setCourseTitle('');
        } finally {
            setCourseBusy(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!courseId || !testDefinitionId || !startsAt) return;
        await onSubmit({
            course_id: courseId,
            test_definition_id: testDefinitionId,
            starts_at: startsAt.toISOString(),
        });
        setStartsAt(defaultStartsAt());
    };

    return (
        <div className={isAdmin ? 'grid gap-6 xl:grid-cols-[1.2fr_0.8fr]' : 'mx-auto max-w-3xl'}>
            <form onSubmit={handleSubmit} className="rounded-card-md border border-shell-border bg-shell-surface-deep p-6 shadow-card">
                <div className="mb-6">
                    <p className="text-xs font-semibold uppercase tracking-wide text-shell-muted-dim">Session Manager</p>
                    <h2 className="mt-2 text-3xl font-black text-foreground">Schedule an Exam Window</h2>
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
                                    {course.code} - {course.title}
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
                            className="w-full rounded-2xl border border-shell-border bg-shell-input px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand"
                            required
                        >
                            <option value="">Select a blueprint</option>
                            {blueprints.map((blueprint) => (
                                <option key={blueprint.id} value={blueprint.id}>
                                    {blueprint.title}
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
                                    min={new Date()}
                                />
                            </Field>
                            <Field label="" className="min-w-0">
                                <TimePicker
                                    value={startsAt}
                                    onChange={setStartsAt}
                                    step={5}
                                />
                            </Field>
                        </div>
                        {timeZone && (
                            <p className="mt-1.5 text-xs text-shell-muted italic">
                                ↳ Scheduled in your timezone ({timeZone})
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
                <form onSubmit={handleCreateCourse} className="rounded-card-md border border-shell-border-deep bg-shell-panel-c p-6 shadow-card">
                    <p className="text-xs font-semibold uppercase tracking-wide text-shell-muted-dim">Course Setup</p>
                    <h3 className="mt-2 text-2xl font-black text-foreground">Create a New Course</h3>
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
