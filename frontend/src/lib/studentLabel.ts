/**
 * Derive a human-friendly display name from a student's email local-part.
 * `jane.doe@vu.nl` → `Jane Doe`. Pure, no React — shared by the grading
 * dashboard and the per-session grading view so the same student reads the same
 * way everywhere.
 */
export function formatStudentLabel(email: string | null | undefined): string {
    if (!email) return 'Student Submission';
    const localPart = email.split('@')[0] ?? email;
    return localPart
        .split(/[._-]+/)
        .filter(Boolean)
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
        .join(' ');
}
