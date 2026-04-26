'use client';

import DOMPurify from 'dompurify';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useResultsStore, QuestionResultDetail } from '@/stores/useResultsStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { getExamChoiceContent, toExamContentHtml, toExamContentText } from '@/lib/examContent';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractEssayText(answer: Record<string, unknown>): string {
    return (answer?.essay_text ?? answer?.text ?? '') as string;
}

function sanitizeHtml(html: string | null | undefined): string {
    return html
        ? DOMPurify.sanitize(html, {
            ALLOWED_TAGS: ['span', 'p', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'br', 'hr'],
            ALLOWED_ATTR: ['class'],
        })
        : '';
}

function getQuestionHeading(content: QuestionResultDetail['question_content'], index: number): string {
    const prompt = toExamContentText(content);
    if (!prompt) {
        return `Question ${index + 1}`;
    }

    return prompt.length > 96 ? `${prompt.slice(0, 93).trimEnd()}...` : prompt;
}

function MCQAnswerDisplay({ detail }: { detail: QuestionResultDetail }) {
    const options = getExamChoiceContent(detail.question_options);
    const opts = (detail.correct_answer as Record<string, number[]> | null)?.correct_indices ?? [];
    const studentIdx = detail.student_answer?.selected_option_index as number | undefined;
    const studentIdxs = detail.student_answer?.selected_option_indices as number[] | undefined;
    const allSelected = studentIdx !== undefined ? [studentIdx] : (studentIdxs ?? []);

    return (
        <div className="space-y-4 mt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="rounded-2xl border border-[#e8dcc7] bg-white/60 p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[#8a6c3e] mb-2">Your Answer</p>
                    {allSelected.length > 0 ? (
                        <div className="space-y-2">
                            {allSelected.map((idx) => (
                                <div
                                    key={idx}
                                    className={`rounded-xl border px-3 py-2 text-sm ${
                                        opts.includes(idx)
                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                            : 'border-rose-300 bg-rose-50 text-rose-900'
                                    }`}
                                >
                                    <span className="mr-2 font-semibold">{String.fromCharCode(65 + idx)}.</span>
                                    <span
                                        className="inline-block align-middle prose prose-sm max-w-none prose-p:my-0 prose-li:my-0 prose-pre:my-1"
                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(options[idx]?.html ?? options[idx]?.text ?? `Option ${idx + 1}`) }}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="text-slate-400 text-sm italic">No answer submitted</span>
                    )}
                </div>

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 mb-2">Correct Answer</p>
                    {opts.length > 0 ? (
                        <div className="space-y-2">
                            {opts.map((idx) => (
                                <div key={idx} className="rounded-xl border border-emerald-300 bg-emerald-100/70 px-3 py-2 text-sm text-emerald-900">
                                    <span className="mr-2 font-semibold">{String.fromCharCode(65 + idx)}.</span>
                                    <span
                                        className="inline-block align-middle prose prose-sm max-w-none prose-p:my-0 prose-li:my-0 prose-pre:my-1"
                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(options[idx]?.html ?? options[idx]?.text ?? `Option ${idx + 1}`) }}
                                    />
                                </div>
                            ))}
                        </div>
                    ) : (
                        <span className="text-slate-400 text-sm italic">—</span>
                    )}
                </div>
            </div>

            {options.length > 0 && (
                <div className="rounded-2xl border border-[#e8dcc7] bg-[#fffaf4] p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[#8a6c3e] mb-3">Available Options</p>
                    <div className="space-y-2">
                        {options.map((option, idx) => {
                            const isSelected = allSelected.includes(idx);
                            const isCorrect = opts.includes(idx);
                            return (
                                <div
                                    key={`${idx}-${option.text}`}
                                    className={`rounded-xl border px-3 py-2 text-sm ${
                                        isSelected && isCorrect
                                            ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                                            : isSelected
                                                ? 'border-rose-300 bg-rose-50 text-rose-900'
                                                : isCorrect
                                                    ? 'border-emerald-200 bg-white text-emerald-900'
                                                    : 'border-[#e8dcc7] bg-white/80 text-slate-700'
                                    }`}
                                >
                                    <span className="mr-2 font-semibold">{String.fromCharCode(65 + idx)}.</span>
                                    <span
                                        className="inline-block align-middle prose prose-sm max-w-none prose-p:my-0 prose-li:my-0 prose-pre:my-1"
                                        dangerouslySetInnerHTML={{ __html: sanitizeHtml(option.html) }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function QuestionCard({ detail, index }: { detail: QuestionResultDetail; index: number }) {
    const isEssay = detail.question_type === 'ESSAY';
    const isCorrect = detail.is_correct;
    const isPending = !detail.is_auto_graded && detail.is_correct === null;

    let borderColor = 'border-[#e8dcc7]';
    let accentColor = 'bg-slate-100 text-slate-600';
    if (isPending) {
        borderColor = 'border-amber-200';
        accentColor = 'bg-amber-50 text-amber-700';
    } else if (isCorrect === true) {
        borderColor = 'border-emerald-200';
        accentColor = 'bg-emerald-100 text-emerald-800';
    } else if (isCorrect === false) {
        borderColor = 'border-rose-200';
        accentColor = 'bg-rose-100 text-rose-700';
    }

    return (
        <div className={`rounded-[24px] border ${borderColor} bg-white/80 p-6 shadow-sm space-y-4`}>
            {/* Header row */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${accentColor}`}>
                        {isPending ? '?' : isCorrect ? '✓' : isEssay ? '#' : '✗'}
                    </div>
                    <div>
                        <p className="font-bold text-slate-900 text-sm">{getQuestionHeading(detail.question_content, index)}</p>
                        <p className="text-xs text-slate-400 capitalize">
                            Question {index + 1} · {isEssay ? 'Open answer' : detail.question_type?.replace('_', ' ').toLowerCase()}
                        </p>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <p className="text-lg font-black text-slate-900">
                        {detail.points_awarded}
                        <span className="text-slate-400 font-normal text-sm"> / {detail.points_possible}</span>
                    </p>
                    <p className="text-xs text-slate-400">points</p>
                </div>
            </div>

            {detail.question_content && (
                <div
                    className="prose max-w-none rounded-2xl border border-[#e8dcc7] bg-[#fffaf4] px-4 py-3 text-slate-700"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(toExamContentHtml(detail.question_content)) }}
                />
            )}

            {/* Answer display */}
            {isEssay ? (
                <div className="space-y-3">
                    <div className="rounded-2xl border border-[#e8dcc7] bg-[#fffaf4] p-4">
                        <p className="text-xs font-semibold uppercase tracking-widest text-[#8a6c3e] mb-2">Your Essay</p>
                        {extractEssayText(detail.student_answer) ? (
                            <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
                                {extractEssayText(detail.student_answer)}
                            </p>
                        ) : (
                            <p className="text-sm text-slate-400 italic">No answer submitted</p>
                        )}
                    </div>
                    {isPending && (
                        <div className="flex items-center gap-2 text-amber-600 text-xs">
                            <span>⏳</span>
                            <span>Awaiting manual grading</span>
                        </div>
                    )}
                </div>
            ) : (
                <MCQAnswerDisplay detail={detail} />
            )}

            {/* Feedback */}
            {detail.feedback && (
                <div className="rounded-2xl border border-[#1055cc]/20 bg-[#eef4ff] p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-[#1055cc] mb-1">Grader Feedback</p>
                    <p className="text-sm text-slate-700 leading-relaxed">{detail.feedback}</p>
                </div>
            )}
        </div>
    );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyResultDetailPage() {
    const { sessionId } = useParams<{ sessionId: string }>();
    const router = useRouter();
    const { user } = useAuthStore();
    const { currentResultDetail, detailLoading, error, fetchMyResultDetail } = useResultsStore();

    useEffect(() => {
        if (sessionId) fetchMyResultDetail(sessionId);
    }, [sessionId, fetchMyResultDetail]);

    // Redirect non-students
    if (user && user.role !== 'STUDENT') {
        router.replace('/grading');
        return null;
    }

    const result = currentResultDetail;

    return (
        <div className="min-h-screen bg-[linear-gradient(180deg,#fff6e8_0%,#f9fcff_40%,#eef4ff_100%)] px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl space-y-8">
                {/* Back */}
                <Link href="/my-exams" className="inline-flex items-center gap-2 text-sm text-[#1055cc] hover:underline">
                    ← Back to My Exams
                </Link>

                {/* Error */}
                {error && (
                    <div className="rounded-2xl border border-rose-300 bg-rose-50 px-5 py-4 text-sm text-rose-700">
                        {error}
                    </div>
                )}

                {/* Loading */}
                {detailLoading && (
                    <div className="flex items-center justify-center py-20 text-slate-400 text-sm gap-3">
                        <div className="w-5 h-5 border-2 border-[#1055cc] border-t-transparent rounded-full animate-spin" />
                        Loading your result…
                    </div>
                )}

                {result && !detailLoading && (
                    <>
                        {/* Result header card */}
                        <div className="rounded-[34px] border border-[#e8dcc7] bg-[linear-gradient(135deg,#fffdf9_0%,#f4f8ff_100%)] p-8 shadow-[0_20px_60px_rgba(72,52,24,0.10)]">
                            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#8a6c3e]">Exam Result</p>
                            <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-900">
                                {result.test_title}
                            </h1>
                            {result.submitted_at && (
                                <p className="mt-2 text-sm text-slate-500">
                                    Submitted on {new Date(result.submitted_at).toLocaleDateString('en-GB', {
                                        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                                    })}
                                </p>
                            )}

                            {/* Score summary */}
                            <div className="mt-6 grid grid-cols-3 gap-4">
                                <div className="rounded-2xl border border-[#e8dcc7] bg-white/60 p-4 text-center">
                                    <p className="text-3xl font-black text-slate-900">{result.percentage.toFixed(1)}%</p>
                                    <p className="text-xs text-slate-500 mt-1">Score</p>
                                </div>
                                <div className="rounded-2xl border border-[#e8dcc7] bg-white/60 p-4 text-center">
                                    <p className="text-3xl font-black text-slate-900">{result.total_points}</p>
                                    <p className="text-xs text-slate-500 mt-1">Points (of {result.max_points})</p>
                                </div>
                                <div className="rounded-2xl border border-[#e8dcc7] bg-white/60 p-4 text-center">
                                    {result.letter_grade ? (
                                        <>
                                            <p className={`text-3xl font-black ${result.passed ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {result.letter_grade}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-1">Grade</p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-2xl font-black text-amber-500">⏳</p>
                                            <p className="text-xs text-slate-500 mt-1">Pending</p>
                                        </>
                                    )}
                                </div>
                            </div>

                            {/* Pass/fail badge */}
                            {result.passed !== null && (
                                <div className="mt-4">
                                    <span className={`inline-block px-4 py-1.5 rounded-full text-sm font-bold ${
                                        result.passed
                                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                                    }`}>
                                        {result.passed ? '✓ Passed' : '✗ Did not pass'}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Per-question breakdown */}
                        {result.question_results.length > 0 && (
                            <div className="space-y-4">
                                <h2 className="text-2xl font-black text-slate-900">Question Breakdown</h2>
                                {result.question_results.map((detail, idx) => (
                                    <QuestionCard key={detail.grade_id} detail={detail} index={idx} />
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
