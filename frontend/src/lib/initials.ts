// Email → two-letter initials (CLAUDE.md §8 Stage 7).
// Rules:
//   - "first.last@…"   → "FL"
//   - "first_last@…"   → "FL"
//   - "first-last@…"   → "FL"
//   - "name@…"         → first 2 letters of name (uppercased)
//   - empty / invalid  → "?"

export function emailToInitials(email: string | null | undefined): string {
    if (!email) return '?';
    const local = email.split('@')[0]?.trim();
    if (!local) return '?';

    const parts = local.split(/[._\-+]/).filter(Boolean);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (parts[0]?.slice(0, 2) ?? '?').toUpperCase();
}
