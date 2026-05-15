'use client';

import ReadOnlyTipTap from './ReadOnlyTipTap';
import { CheckIcon } from '../ui/icons';

/**
 * Read-only viewer for a question version. Stage 6 of Epoch 8.5.
 *
 * Structurally distinct from `<TipTapEditor>` + `<MCQOptionsPanel>` rather than
 * the same editor rendered with `disabled` inputs — per CLAUDE.md §7.7
 * ("Inspect ≠ Edit"). Three current entry points consume this:
 *   1. `/author?lo_id=…` when the underlying item is locked by an ONGOING /
 *      PASSED blueprint (locked-item route).
 *   2. The blueprint inspector's question-detail card (Stage 5).
 *   3. The `QuestionPickerModal` preview panel (Stage 7).
 *
 * Pure presentation — callers fetch and pass the data shape they already have.
 * Default `showCorrectness=true` (every current call site is educator-side);
 * threaded as a prop so future student-facing reuses (post-exam review, etc.)
 * can opt out without forking.
 */

type QuestionType = 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY' | string;

interface MCQOption {
    id: string;
    text: string;
    is_correct: boolean;
    weight?: number;
}

interface EssayOptions {
    min_words?: number;
    max_words?: number;
}

interface QuestionInspectorProps {
    questionType: QuestionType;
    content: Record<string, unknown> | null;
    options: MCQOption[] | EssayOptions | null;
    metadataTags?: Record<string, unknown> | null;
    /**
     * Reveal the correct answer? Default true. Every current entry point is
     * educator-side; threaded so future student-facing surfaces can opt out.
     */
    showCorrectness?: boolean;
}

function typeLabel(qt: QuestionType): string {
    if (qt === 'MULTIPLE_CHOICE') return 'Single choice';
    if (qt === 'MULTIPLE_RESPONSE') return 'Multiple choice';
    if (qt === 'ESSAY') return 'Essay';
    return qt.replace(/_/g, ' ').toLowerCase();
}

function isMCQOptions(opts: unknown): opts is MCQOption[] {
    return Array.isArray(opts);
}

function isEssayOptions(opts: unknown): opts is EssayOptions {
    return !!opts && typeof opts === 'object' && !Array.isArray(opts);
}

export default function QuestionInspector({
    questionType,
    content,
    options,
    metadataTags,
    showCorrectness = true,
}: QuestionInspectorProps) {
    const topic = metadataTags?.topic as string | undefined;
    const points = metadataTags?.points as number | undefined;

    return (
        <div className="rounded-2xl border border-shell-border bg-shell-bg p-6 sm:p-8 space-y-6">
            {/* Content (stem) */}
            <section>
                <p className="mb-2 text-eyebrow font-semibold uppercase tracking-widest text-shell-muted-dim">
                    Content
                </p>
                <ReadOnlyTipTap content={content} />
            </section>

            {/* Options — branch on question type */}
            {(questionType === 'MULTIPLE_CHOICE' || questionType === 'MULTIPLE_RESPONSE') && isMCQOptions(options) && (
                <section>
                    <p className="mb-2 text-eyebrow font-semibold uppercase tracking-widest text-shell-muted-dim">
                        Options
                    </p>
                    {options.length === 0 ? (
                        <p className="text-meta text-shell-muted-dim italic">No options defined.</p>
                    ) : (
                        <ul className="space-y-2">
                            {options.map((choice) => {
                                const markCorrect = showCorrectness && choice.is_correct;
                                return (
                                    <li
                                        key={choice.id}
                                        className={[
                                            'flex items-start gap-3 rounded-lg border px-3 py-2 text-meta',
                                            // Muted accent on correct rows — left border only, neutral fill.
                                            // No loud success-bg fill: §7.7 / Stage 5 intent is "lightly indicating".
                                            markCorrect
                                                ? 'border-shell-border border-l-2 border-l-[var(--color-success-border)] bg-shell-input/50'
                                                : 'border-shell-border bg-shell-input/30',
                                        ].join(' ')}
                                    >
                                        <span
                                            className={[
                                                'inline-flex items-center justify-center w-4 h-4 mt-0.5 shrink-0',
                                                markCorrect ? 'text-[var(--color-success-fg)]' : 'text-shell-muted-dim',
                                            ].join(' ')}
                                            aria-label={markCorrect ? 'Correct answer' : undefined}
                                        >
                                            {markCorrect ? <CheckIcon size={14} /> : <span aria-hidden="true">·</span>}
                                        </span>
                                        <span className="flex-1 text-foreground">{choice.text}</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            )}

            {questionType === 'ESSAY' && isEssayOptions(options) && (
                <section>
                    <p className="mb-2 text-eyebrow font-semibold uppercase tracking-widest text-shell-muted-dim">
                        Response constraints
                    </p>
                    <p className="text-meta text-foreground">
                        {options.min_words !== undefined && options.max_words !== undefined
                            ? `Between ${options.min_words} and ${options.max_words} words.`
                            : options.min_words !== undefined
                                ? `At least ${options.min_words} words.`
                                : options.max_words !== undefined
                                    ? `Up to ${options.max_words} words.`
                                    : 'No word-count constraints.'}
                    </p>
                </section>
            )}

            {/* Metadata strip — type / points / subject */}
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 pt-2 border-t border-shell-border">
                <div>
                    <p className="mb-1.5 text-eyebrow font-semibold uppercase tracking-widest text-shell-muted-dim">
                        Type
                    </p>
                    <span className="text-foreground font-medium">{typeLabel(questionType)}</span>
                </div>
                <div>
                    <p className="mb-1.5 text-eyebrow font-semibold uppercase tracking-widest text-shell-muted-dim">
                        Points
                    </p>
                    <span className="text-foreground font-semibold">{points ?? 1}</span>
                </div>
                {topic && (
                    <div>
                        <p className="mb-1.5 text-eyebrow font-semibold uppercase tracking-widest text-shell-muted-dim">
                            Subject
                        </p>
                        <span className="text-foreground font-medium">{topic}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
