'use client';

import { useRouter } from 'next/navigation';
import { cn } from './cn';
import { useConfirm } from './ConfirmDialog';

interface BackButtonProps {
    /** Destination route. If omitted, uses browser `back()`. */
    href?: string;
    /** Custom click handler (overrides `href`). */
    onClick?: () => void;
    label: string;
    /** When true, prompt before navigating away. */
    confirmDirty?: boolean;
    confirmTitle?: string;
    confirmMessage?: string;
    className?: string;
}

/**
 * Canonical back-navigation button. Top-left of the page, before any PageHeader.
 * See CLAUDE.md §8.4 for placement rules.
 */
export default function BackButton({
    href,
    onClick,
    label,
    confirmDirty,
    confirmTitle = 'Leave without saving?',
    confirmMessage = 'You have unsaved changes. They will be lost if you leave.',
    className,
}: BackButtonProps) {
    const router = useRouter();
    const { confirm, ConfirmDialog } = useConfirm();

    const navigate = async () => {
        if (confirmDirty) {
            const ok = await confirm({
                title: confirmTitle,
                message: confirmMessage,
                confirmLabel: 'Leave',
                tone: 'warning',
            });
            if (!ok) return;
        }
        if (onClick) return onClick();
        if (href) return router.push(href);
        router.back();
    };

    return (
        <>
            {ConfirmDialog}
            <button
                type="button"
                onClick={navigate}
                className={cn(
                    'mb-6 inline-flex items-center gap-2 text-meta font-medium',
                    'text-shell-muted hover:text-foreground transition-colors',
                    className,
                )}
            >
                <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                </svg>
                {label}
            </button>
        </>
    );
}
