'use client';

/** "Skip to main content" link — the first focusable element on the page.
 *  Off-screen until focused, then token-styled and visible. Lets keyboard and
 *  screen-reader users bypass the header nav (WCAG 2.4.1). Targets the
 *  #main-content landmark set on the layout's <main>. */
export default function SkipLink() {
    return (
        <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:border focus:border-brand focus:bg-shell-surface focus:px-4 focus:py-2 focus:text-body focus:text-foreground focus:shadow-elevated"
        >
            Skip to main content
        </a>
    );
}
