import { create } from 'zustand';

import { api } from '@/lib/api';

export interface Course {
    id: string;
    code: string;
    title: string;
    created_by?: string | null;
    is_active: boolean;
    created_at: string;
    updated_at?: string | null;
}

export interface Enrollment {
    id: string;
    course_id: string;
    student_id: string;
    student_email: string;
    is_active: boolean;
    enrolled_at: string;
}

export interface StudentCandidate {
    id: string;
    email: string;
}

interface CourseState {
    courses: Course[];
    enrollmentsByCourse: Record<string, Enrollment[]>;
    studentCandidates: StudentCandidate[];
    isLoading: boolean;
    error: string | null;
    fetchCourses: () => Promise<void>;
    createCourse: (payload: { code: string; title: string }) => Promise<Course>;
    fetchEnrollments: (courseId: string) => Promise<void>;
    addEnrollment: (courseId: string, payload: { student_id?: string; student_email?: string }) => Promise<void>;
    removeEnrollment: (courseId: string, studentId: string) => Promise<void>;
    fetchStudentCandidates: () => Promise<void>;
}

export const useCourseStore = create<CourseState>((set, get) => ({
    courses: [],
    enrollmentsByCourse: {},
    studentCandidates: [],
    isLoading: false,
    error: null,

    fetchCourses: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<Course[]>('/courses/');
            set({ courses: response.data, isLoading: false });
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to fetch courses';
            set({ error: message, isLoading: false });
        }
    },

    createCourse: async (payload) => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.post<Course>('/courses/', payload);
            set((state) => ({
                courses: [...state.courses, response.data].sort((left, right) => left.code.localeCompare(right.code)),
                isLoading: false,
            }));
            return response.data;
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to create course';
            set({ error: message, isLoading: false });
            throw new Error(message);
        }
    },

    fetchEnrollments: async (courseId) => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<Enrollment[]>(`/courses/${courseId}/enrollments`);
            set((state) => ({
                enrollmentsByCourse: { ...state.enrollmentsByCourse, [courseId]: response.data },
                isLoading: false,
            }));
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to fetch enrollments';
            set({ error: message, isLoading: false });
        }
    },

    addEnrollment: async (courseId, payload) => {
        set({ isLoading: true, error: null });
        try {
            await api.post(`/courses/${courseId}/enrollments`, payload);
            await get().fetchEnrollments(courseId);
            set({ isLoading: false });
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to add enrollment';
            set({ error: message, isLoading: false });
            throw new Error(message);
        }
    },

    removeEnrollment: async (courseId, studentId) => {
        set({ isLoading: true, error: null });
        try {
            await api.delete(`/courses/${courseId}/enrollments/${studentId}`);
            await get().fetchEnrollments(courseId);
            set({ isLoading: false });
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to remove enrollment';
            set({ error: message, isLoading: false });
            throw new Error(message);
        }
    },

    fetchStudentCandidates: async () => {
        set({ isLoading: true, error: null });
        try {
            const response = await api.get<StudentCandidate[]>('/courses/student-candidates');
            set({ studentCandidates: response.data, isLoading: false });
        } catch (err: unknown) {
            const message = (err as { response?: { data?: { detail?: string } } })
                ?.response?.data?.detail || 'Failed to fetch students';
            set({ error: message, isLoading: false });
        }
    },
}));
