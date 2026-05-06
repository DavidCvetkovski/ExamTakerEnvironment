'use client';

import { useEffect, useState } from 'react';

import type { TestDefinition } from '@/stores/useBlueprintStore';
import type { Course } from '@/stores/useCourseStore';
import { Button } from '@/components/ui';

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

function toDateTimeLocalValue(date: Date): string {
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return localDate.toISOString().slice(0, 16);
}

function getNextQuarterHourLocalValue(reference = new Date()): string {
    const nextSlot = new Date(reference);
    nextSlot.setSeconds(0, 0);

    const currentMinutes = nextSlot.getMinutes();
    const remainder = currentMinutes % 15;
    if (remainder !== 0) {
        nextSlot.setMinutes(currentMinutes + (15 - remainder));
    }

    return toDateTimeLocalValue(nextSlot);
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
    const [startsAt, setStartsAt] = useState('');
    const [timeZone, setTimeZone] = useState('');
    const [courseCode, setCourseCode] = useState('');
    const [courseTitle, setCourseTitle] = useState('');
    const [courseBusy, setCourseBusy] = useState(false);

    useEffect(() => {
        setStartsAt((currentValue) => currentValue || getNextQuarterHourLocalValue());
        setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    }, []);

    const handleCreateCourse = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!courseCode.trim() || !courseTitle.trim()) {
            return;
        }

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
        if (!courseId || !testDefinitionId || !startsAt) {
            return;
        }

        await onSubmit({
            course_id: courseId,
            test_definition_id: testDefinitionId,
            starts_at: new Date(startsAt).toISOString(),
        });
        setStartsAt(getNextQuarterHourLocalValue());
    };

    return (
        <div className={isAdmin ? 'grid gap-6 xl:grid-cols-[1.2fr_0.8fr]' : 'mx-auto max-w-3xl'}>
            <form onSubmit={handleSubmit} className="rounded-card-md border border-white/10 bg-shell-surface-deep p-6 shadow-2xl shadow-black/30">
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
                            className="w-full rounded-2xl border border-white/10 bg-shell-input px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand"
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
                            className="w-full rounded-2xl border border-white/10 bg-shell-input px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand"
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

                <label className="mt-4 block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-medium text-shell-muted-dim">Start date and time</span>
                    <input
                        aria-label="Start date and time"
                        type="datetime-local"
                        value={startsAt}
                        onChange={(event) => setStartsAt(event.target.value)}
                        step={900}
                        className="w-full rounded-2xl border border-white/10 bg-shell-input px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand"
                        required
                    />
                    <p className="text-xs text-shell-muted mt-1 italic">
                        ↳ All times are scheduled based on your timezone{timeZone ? ` (Current: ${timeZone})` : ''}
                    </p>
                </label>

                <div className="mt-6">
                    <Button type="submit" variant="primary" size="lg" fullWidth disabled={isSubmitting} loading={isSubmitting}>
                        {isSubmitting ? 'Scheduling...' : 'Schedule Session'}
                    </Button>
                </div>
            </form>

            {isAdmin && (
                <form onSubmit={handleCreateCourse} className="rounded-card-md border border-shell-border-deep bg-shell-panel-c p-6 shadow-xl shadow-black/20">
                    <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Course Setup</p>
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
                                className="w-full rounded-2xl border border-white/10 bg-shell-input-alt px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand"
                            />
                        </label>
                        <label className="space-y-2 block">
                            <span className="text-xs font-semibold uppercase tracking-medium text-shell-muted-dim">Course title</span>
                            <input
                                aria-label="Course title"
                                value={courseTitle}
                                onChange={(event) => setCourseTitle(event.target.value)}
                                placeholder="Introductory Biology"
                                className="w-full rounded-2xl border border-white/10 bg-shell-input-alt px-4 py-3 text-sm text-foreground outline-none transition focus:border-brand"
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
