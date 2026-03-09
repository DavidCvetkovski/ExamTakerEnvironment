'use client';

import { useState } from 'react';

import type { TestDefinition } from '@/stores/useBlueprintStore';
import type { Course } from '@/stores/useCourseStore';

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
}

export default function SessionCreateForm({
    courses,
    blueprints,
    isSubmitting,
    onCreateCourse,
    onSubmit,
}: SessionCreateFormProps) {
    const [courseId, setCourseId] = useState('');
    const [testDefinitionId, setTestDefinitionId] = useState('');
    const [startsAt, setStartsAt] = useState('');
    const [courseCode, setCourseCode] = useState('');
    const [courseTitle, setCourseTitle] = useState('');
    const [courseBusy, setCourseBusy] = useState(false);

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
        setStartsAt('');
    };

    return (
        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <form onSubmit={handleSubmit} className="rounded-[28px] border border-white/10 bg-[#111827] p-6 shadow-2xl shadow-black/30">
                <div className="mb-6">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Session Manager</p>
                    <h2 className="mt-2 text-3xl font-black text-white">Schedule an Exam Window</h2>
                    <p className="mt-2 max-w-xl text-sm text-slate-400">
                        Choose the course, lock a blueprint, and define the exact exam start time. Students only see sessions for courses they are enrolled in.
                    </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Course</span>
                        <select
                            aria-label="Course"
                            value={courseId}
                            onChange={(event) => setCourseId(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400"
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
                        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Blueprint</span>
                        <select
                            aria-label="Blueprint"
                            value={testDefinitionId}
                            onChange={(event) => setTestDefinitionId(event.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400"
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
                    <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Start date and time</span>
                    <input
                        aria-label="Start date and time"
                        type="datetime-local"
                        value={startsAt}
                        onChange={(event) => setStartsAt(event.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-[#0b1220] px-4 py-3 text-sm text-white outline-none transition focus:border-cyan-400"
                        required
                    />
                </label>

                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="mt-6 inline-flex items-center justify-center rounded-2xl bg-cyan-400 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {isSubmitting ? 'Scheduling...' : 'Schedule Session'}
                </button>
            </form>

            <form onSubmit={handleCreateCourse} className="rounded-[28px] border border-[#223149] bg-[#0c1628] p-6 shadow-xl shadow-black/20">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Course Setup</p>
                <h3 className="mt-2 text-2xl font-black text-white">Create a New Course</h3>
                <p className="mt-2 text-sm text-slate-400">
                    Courses gate exam visibility. Enrollments are managed separately once the course exists.
                </p>

                <div className="mt-6 space-y-4">
                    <label className="space-y-2 block">
                        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Course code</span>
                        <input
                            aria-label="Course code"
                            value={courseCode}
                            onChange={(event) => setCourseCode(event.target.value)}
                            placeholder="e.g. BIO101"
                            className="w-full rounded-2xl border border-white/10 bg-[#08111d] px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400"
                        />
                    </label>
                    <label className="space-y-2 block">
                        <span className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Course title</span>
                        <input
                            aria-label="Course title"
                            value={courseTitle}
                            onChange={(event) => setCourseTitle(event.target.value)}
                            placeholder="Introductory Biology"
                            className="w-full rounded-2xl border border-white/10 bg-[#08111d] px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400"
                        />
                    </label>
                </div>

                <button
                    type="submit"
                    disabled={courseBusy}
                    className="mt-6 inline-flex items-center justify-center rounded-2xl border border-amber-300/40 bg-amber-200/10 px-5 py-3 text-sm font-black uppercase tracking-[0.2em] text-amber-200 transition hover:bg-amber-200/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    {courseBusy ? 'Creating...' : 'Create Course'}
                </button>
            </form>
        </div>
    );
}
