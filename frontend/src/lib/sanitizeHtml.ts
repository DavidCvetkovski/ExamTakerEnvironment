import DOMPurify from 'dompurify';

/**
 * Single source of truth for sanitising author-supplied exam HTML
 * (question stems and answer-choice content). Used by the exam render path and
 * the results view so every surface inherits the same allow-list and the same
 * image-source guard.
 *
 * Security (Epoch 14 audit H-8): `img` is allowed so authored diagrams render,
 * but `src` is restricted to **relative / same-origin** URLs. An absolute
 * external `src` (e.g. `https://tracker/â€¦?student=â€¦`) would otherwise fire a
 * request from the student's browser on every render, exfiltrating timing and
 * presence. DOMPurify's defaults only block dangerous URI *schemes*; they do not
 * stop an external https image, so we strip it with an attribute hook.
 */
const ALLOWED_TAGS = [
    'span', 'p', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'blockquote', 'br', 'hr', 'img',
];
const ALLOWED_ATTR = ['class', 'src', 'alt'];

// Register the image-source guard exactly once (the hook is global to DOMPurify).
let hookRegistered = false;
function ensureImageGuard(): void {
    if (hookRegistered) return;
    hookRegistered = true;
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.nodeName !== 'IMG') return;
        const src = node.getAttribute('src') ?? '';
        // Allow only same-origin paths: a leading "/" (absolute path) or a
        // relative path with no scheme and no protocol-relative "//".
        const isRelative = src.startsWith('/') && !src.startsWith('//');
        if (!isRelative) node.removeAttribute('src');
    });
}

export function sanitizeExamHtml(html: string | null | undefined): string {
    if (!html) return '';
    ensureImageGuard();
    return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
