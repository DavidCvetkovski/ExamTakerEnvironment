/**
 * Single source of truth for "has this question been graded?" on the grading
 * review surface.
 *
 * Before this helper the grading session page derived the answer three
 * different, contradicting ways (card border, panel badge, header pending
 * count), so an essay scored 0 with no feedback could read as graded, ungraded,
 * and pending simultaneously. The authoritative signal is `updated_at`:
 * `submit_manual_grade` stamps it when a human saves a grade, and it is null on
 * the pending row created at submission (the M-12 rule). Auto-graded questions
 * are always resolved.
 */
export type GradeState = 'AUTO' | 'GRADED' | 'PENDING';

export interface GradeStateInput {
    is_auto_graded: boolean;
    updated_at: string | null;
}

export function deriveGradeState(grade: GradeStateInput): GradeState {
    if (grade.is_auto_graded) return 'AUTO';
    return grade.updated_at !== null ? 'GRADED' : 'PENDING';
}

/** True only for an essay still awaiting a human grade. */
export function isAwaitingGrade(grade: GradeStateInput): boolean {
    return deriveGradeState(grade) === 'PENDING';
}
