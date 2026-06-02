/**
 * Coarse device fingerprint for session-sharing detection (Epoch 11 §9.9).
 *
 * Privacy-conscious by design: we hash a few non-identifying, stable browser
 * attributes into a short digest. The backend salts and re-hashes this before
 * storage, so the raw value is never persisted and cannot be correlated across
 * exams. This is a weak signal (it flags "the attempt moved to a different
 * device"), not an identity store.
 */
function djb2(input: string): string {
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
        hash = (hash * 33) ^ input.charCodeAt(i);
    }
    // Unsigned hex.
    return (hash >>> 0).toString(16).padStart(8, '0');
}

export function computeFingerprint(): string {
    if (typeof navigator === 'undefined' || typeof screen === 'undefined') {
        return 'unknown0';
    }
    const parts = [
        navigator.userAgent,
        navigator.language,
        `${screen.width}x${screen.height}x${screen.colorDepth}`,
        new Date().getTimezoneOffset().toString(),
        (navigator.hardwareConcurrency ?? 0).toString(),
    ];
    // Two passes widen the digest enough to be a usable signal without being
    // an identifying value.
    const joined = parts.join('|');
    return `${djb2(joined)}${djb2(joined.split('').reverse().join(''))}`;
}
