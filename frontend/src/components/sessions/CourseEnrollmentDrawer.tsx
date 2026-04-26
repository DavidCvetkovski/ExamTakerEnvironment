'use client';

import { useState } from 'react';

import type { Course, Enrollment, StudentCandidate } from '@/stores/useCourseStore';

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

    if (!isOpen || !course) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-sm">
            <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#08101b] p-6 shadow-2xl shadow-black/40">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-300">Course Enrollments</p>
                        <h3 className="mt-2 text-3xl font-black text-white">{course.code}</h3>
                        <p className="mt-1 text-sm text-slate-400">{course.title}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full border border-white/10 px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5"
                    >
                        Close
                    </button>
                </div>

                <div className="mt-8 rounded-[24px] border border-white/10 bg-white/[0.03] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Add Student</p>
                    <div className="mt-3 flex flex-col gap-3 md:flex-row">
                        <select
                            aria-label="Student"
                            value={studentId}
                            onChange={(event) => setStudentId(event.target.value)}
                            className="flex-1 rounded-2xl border border-white/10 bg-[#050b13] px-4 py-3 text-sm text-white outline-none transition focus:border-amber-300"
                        >
                            <option value="">Select a student</option>
                            {studentCandidates.map((student) => (
                                <option key={student.id} value={student.id}>
                                    {student.email}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            disabled={!studentId || isBusy}
                            onClick={async () => {
                                await onAddEnrollment(course.id, { student_id: studentId });
                                setStudentId('');
                            }}
                            className="rounded-2xl bg-amber-300 px-4 py-3 text-sm font-black uppercase tracking-[0.2em] text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            Enroll
                        </button>
                    </div>
                </div>

                <div className="mt-6 rounded-[24px] border border-white/10 bg-white/[0.02] p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Roster</p>
                    <div className="mt-4 space-y-3">
                        {enrollments.length === 0 ? (
                            <p className="text-sm text-slate-500">No students enrolled yet.</p>
                        ) : (
                            enrollments.map((enrollment) => (
                                <div key={enrollment.id} className="flex items-center justify-between rounded-2xl border border-white/8 bg-[#040914] px-4 py-3">
                                    <div>
                                        <p className="font-medium text-white">{enrollment.student_email}</p>
                                        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                                            {enrollment.is_active ? 'Active' : 'Inactive'}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={!enrollment.is_active || isBusy}
                                        onClick={() => onRemoveEnrollment(course.id, enrollment.student_id)}
                                        className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        Remove
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
