'use client';

import DOMPurify from 'dompurify';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useGradingStore, QuestionGrade, ManualGradePayload } from '@/stores/useGradingStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { getExamChoiceContent, toExamContentHtml, toExamContentText } from '@/lib/examContent';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeHtml(html: string | null | undefined): string {
    return html
        ? DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['span', 'p', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'br', 'hr'],
            ALLOWED_ATTR: ['class'],
        })
        : '';
}

function getQuestionHeading(content: QuestionGrade['question_content'], index: number): string {
    const prompt = toExamContentText(content);
    if (!prompt) {
        return `Question ${index + 1}`;
    }

    return prompt.length > 96 ? `${prompt.slice(0, 93).trimEnd()}...` : prompt;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AutoGradeResult({ grade }: { grade: QuestionGrade }) {
    const studentAnswer = grade.student_answer;
    const options = getExamChoiceContent(grade.question_options);
    const correctIndices = ((grade.correct_answer as Record<string, number[]> | null)?.correct_indices ?? []);

    const getSelectedLabel = (answer: Record<string, unknown>): string => {
        if ('selected_option_index' in answer) {
            const idx = answer.selected_option_index as number;
            return options[idx]?.text ?? `Option ${idx + 1}`;
        }
        if ('selected_option_indices' in answer) {
            const indices = answer.selected_option_indices as number[];
            return indices.map(i => options[i]?.text ?? `Option ${i + 1}`).join(', ') || '(none)';
        }
        return JSON.stringify(answer);
    };

    const studentIdx = studentAnswer?.selected_option_index as number | undefined;
    const studentIdxs = studentAnswer?.selected_option_indices as number[] | undefined;
    const selectedIndices = studentIdx !== undefined ? [studentIdx] : (studentIdxs ?? []);

    return (
        <div className="space-y-3">
            {/* Student answer */}
            <div className={`rounded-lg p-3 border ${grade.is_correct ? 'bg-emerald-950/40 border-emerald-800/60' : 'bg-red-950/40 border-red-800/60'}`}>
                <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-gray-400">STUDENT ANSWER</span>
                    {grade.is_correct !== null && (
                        <span className={`text-xs font-bold ${grade.is_correct ? 'text-emerald-400' : 'text-red-400'}`}>
                            {grade.is_correct ? '✓ CORRECT' : '✗ INCORRECT'}
                        </span>
                    )}
                </div>
                <p className="text-white text-sm">{getSelectedLabel(studentAnswer)}</p>
            </div>

            {/* Correct answer */}
            {grade.correct_answer && (
                <div className="rounded-lg p-3 bg-gray-800/50 border border-gray-700">
                    <p className="text-xs font-semibold text-gray-400 mb-1">CORRECT ANSWER</p>
                    {((grade.correct_answer as Record<string, number[]>).correct_indices ?? []).map((idx: number) => (
                        <span key={idx} className="bg-emerald-900/40 text-emerald-300 text-xs px-2 py-0.5 rounded mr-1">
                            {options[idx]?.text ?? `Option ${idx + 1}`}
                        </span>
                    ))}
                </div>
            )}

            {options.length > 0 && (
                <div className="rounded-lg p-3 bg-gray-800/50 border border-gray-700">
                    <p className="text-xs font-semibold text-gray-400 mb-2">AVAILABLE OPTIONS</p>
                    <div className="space-y-2">
                        {options.map((option, idx) => {
                            const isSelected = selectedIndices.includes(idx);
                            const isCorrect = correctIndices.includes(idx);
                            return (
                                <div
                                    key={`${idx}-${option.text}`}
                                    className={`rounded-md border px-3 py-2 text-sm ${
                                        isSelected && isCorrect
                                            ? 'border-emerald-700 bg-emerald-950/30 text-emerald-200'
                                            : isSelected
                                                ? 'border-red-700 bg-red-950/30 text-red-200'
                                                : isCorrect
                                                    ? 'border-emerald-900/60 bg-gray-900 text-emerald-300'
                                                    : 'border-gray-700 bg-gray-900/60 text-gray-300'
                                    }`}
                                >
                                    <span className="font-semibold mr-2">{String.fromCharCode(65 + idx)}.</span>
                                    <span
                                        className="inline-block align-middle prose prose-invert prose-p:my-0 prose-li:my-0 prose-pre:my-1 max-w-none"
                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(option.html) }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Score */}
            <div className="text-sm text-gray-400">
                Score: <span className="text-white font-semibold">{grade.points_awarded}</span> / {grade.points_possible} pts
            </div>
        </div>
    );
}

function EssayGradingPanel({
    grade,
    onSave,
    saving,
}: {
    grade: QuestionGrade;
    onSave: (payload: ManualGradePayload) => void;
    saving: boolean;
}) {
    const [pointsInput, setPointsInput] = useState(String(grade.points_awarded));
    const [feedback, setFeedback] = useState(grade.feedback ?? '');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync if grade changes (e.g. after save)
    useEffect(() => {
        setPointsInput(String(grade.points_awarded));
        setFeedback(grade.feedback ?? '');
    }, [grade.id, grade.points_awarded, grade.feedback]);

    const handleSave = useCallback(() => {
        const pts = parseFloat(pointsInput);
        if (isNaN(pts) || pts < 0 || pts > grade.points_possible) return;
        onSave({ points_awarded: pts, feedback: feedback.trim() || undefined });
    }, [pointsInput, feedback, grade.points_possible, onSave]);

    // Auto-save on feedback change (debounced 2s)
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            const pts = parseFloat(pointsInput);
            if (!isNaN(pts) && pts >= 0 && pts <= grade.points_possible) {
                onSave({ points_awarded: pts, feedback: feedback.trim() || undefined });
            }
        }, 2000);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [feedback, pointsInput]);

    const essayText = grade.student_answer?.essay_text as string ?? grade.student_answer?.text as string ?? '';

    return (
        <div className="space-y-4">
            {/* Student essay */}
            <div className="rounded-lg border border-gray-700 bg-gray-800/40">
                <div className="px-4 py-2 border-b border-gray-700">
                    <span className="text-xs font-semibold text-gray-400">STUDENT ESSAY</span>
                </div>
                <div className="px-4 py-3 max-h-48 overflow-y-auto">
                    {essayText ? (
                        <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{essayText}</p>
                    ) : (
                        <p className="text-sm text-gray-500 italic">No answer submitted</p>
                    )}
                </div>
            </div>

            {/* Grading controls */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-start">
                {/* Points */}
                <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">
                        Points (max {grade.points_possible})
                    </label>
                    <input
                        type="number"
                        min={0}
                        max={grade.points_possible}
                        step={0.5}
                        value={pointsInput}
                        onChange={e => setPointsInput(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                </div>

                {/* Feedback */}
                <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-gray-400 mb-1">Feedback (optional)</label>
                    <textarea
                        rows={3}
                        value={feedback}
                        onChange={e => setFeedback(e.target.value)}
                        placeholder="Write feedback for the student…"
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                    />
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-700 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                >
                    {saving ? 'Saving…' : '✓ Save Grade'}
                </button>
                {grade.feedback !== null && !grade.is_auto_graded && (
                    <span className="text-xs text-emerald-400">✓ Graded</span>
                )}
            </div>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SessionGradingPage() {
    const { sessionId } = useParams<{ sessionId: string }>();
    const router = useRouter();
    const { user } = useAuthStore();
    const {
        questionGrades, sessionResult, gradesLoading,
        submittingGradeId, blindMode, error,
        fetchSessionGrades, submitManualGrade, clearError,
    } = useGradingStore();

    useEffect(() => {
        if (sessionId) fetchSessionGrades(sessionId);
    }, [sessionId, fetchSessionGrades]);

    if (user?.role === 'STUDENT') {
        router.replace('/my-exams');
        return null;
    }

    const pendingEssays = questionGrades.filter(g => !g.is_auto_graded && g.is_correct === null && !g.feedback);

    return (
        <div className="min-h-screen bg-gray-950 text-gray-100">
            {/* ── Top bar ── */}
            <div className="bg-gray-900 border-b border-gray-800 px-6 py-4 sticky top-0 z-10">
                <div className="max-w-5xl mx-auto flex items-center gap-4">
                    <button
                        onClick={() => router.push('/grading')}
                        className="text-gray-400 hover:text-white text-sm transition-colors"
                    >
                        ← Back to Dashboard
                    </button>

                    <div className="flex-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">
                            {blindMode ? 'Blind Review Mode' : 'Grading Review'}
                        </p>
                        <p className="mt-1 text-sm text-gray-300">
                            {sessionResult?.test_title ?? 'Submitted exam response'}
                        </p>
                    </div>

                    {/* Session result summary */}
                    {sessionResult && (
                        <div className="flex items-center gap-4 text-sm">
                            <span className="text-gray-400">
                                {sessionResult.questions_graded} / {sessionResult.questions_total} graded
                            </span>
                            <span className="font-bold text-white">
                                {sessionResult.total_points} / {sessionResult.max_points} pts
                                <span className="ml-2 text-blue-400">({sessionResult.percentage.toFixed(1)}%)</span>
                            </span>
                            {sessionResult.letter_grade && (
                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${sessionResult.passed ? 'bg-emerald-900/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}`}>
                                    {sessionResult.letter_grade}
                                </span>
                            )}
                            {pendingEssays.length > 0 && (
                                <span className="text-xs text-amber-400">
                                    ⚠ {pendingEssays.length} essay{pendingEssays.length > 1 ? 's' : ''} pending
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
                {/* Error banner */}
                {error && (
                    <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-3 text-sm flex justify-between">
                        <span>{error}</span>
                        <button onClick={clearError} className="text-red-400 hover:text-red-200">✕</button>
                    </div>
                )}

                {/* Loading */}
                {gradesLoading && (
                    <div className="flex items-center justify-center py-20 text-gray-500">
                        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
                        Loading grades…
                    </div>
                )}

                {/* Question cards */}
                {!gradesLoading && questionGrades.map((grade, idx) => {
                    const isEssay = !grade.is_auto_graded;
                    const isGraded = isEssay
                        ? (grade.feedback !== null || grade.points_awarded > 0)
                        : true;

                    return (
                        <div
                            key={grade.id}
                            className={`bg-gray-900 border rounded-xl p-6 space-y-5 transition-colors ${
                                isGraded
                                    ? 'border-emerald-900/60'
                                    : 'border-amber-800/60'
                            }`}
                        >
                            {/* Card header */}
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isGraded ? 'bg-emerald-900/60 text-emerald-400' : 'bg-amber-900/40 text-amber-400'}`}>
                                        {isGraded ? '✓' : idx + 1}
                                    </span>
                                    <div>
                                        <p className="text-white font-semibold text-sm">{getQuestionHeading(grade.question_content, idx)}</p>
                                        <p className="text-gray-500 text-xs capitalize">
                                            Question {idx + 1} · {isEssay ? 'Essay - manual grading required' : 'Auto-graded'}
                                        </p>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <p className="text-white font-bold">
                                        {grade.points_awarded} <span className="text-gray-500 font-normal">/ {grade.points_possible} pts</span>
                                    </p>
                                </div>
                            </div>
                            {grade.question_content && (
                                <div
                                    className="prose prose-invert max-w-none rounded-lg border border-gray-800 bg-gray-950/60 px-4 py-3 text-base leading-relaxed"
                                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(toExamContentHtml(grade.question_content)) }}
                                />
                            )}

                            {/* Grading body */}
                            {isEssay ? (
                                <EssayGradingPanel
                                    grade={grade}
                                    onSave={(payload) => submitManualGrade(grade.id, payload)}
                                    saving={submittingGradeId === grade.id}
                                />
                            ) : (
                                <AutoGradeResult grade={grade} />
                            )}
                        </div>
                    );
                })}

                {!gradesLoading && questionGrades.length === 0 && (
                    <div className="text-center py-20 text-gray-500">
                        No grades found for this session. This session may not have been submitted yet.
                    </div>
                )}
            </div>
        </div>
    );
}
