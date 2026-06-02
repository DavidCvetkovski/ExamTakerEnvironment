/**
 * Safe Exam Browser detection (Epoch 11).
 *
 * ADVISORY ONLY. The User-Agent sniff below is spoofable, so it must never be
 * treated as a security control — the authoritative check is the backend SEB
 * integrity guard, which returns 403 to any request without a valid SEB hash
 * (CLAUDE.md §1 / §7.7: frontend disables are advisory; backend 403 is the rule).
 * This helper exists solely to render a helpful "please use SEB" gate before the
 * student wastes time, not to decide whether the exam may proceed.
 */
export function isLikelySeb(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /SEB[\s/]|SafeExamBrowser/i.test(ua);
}
