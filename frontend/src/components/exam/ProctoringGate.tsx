'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { isLikelySeb } from '@/lib/sebDetection';
import { Button } from '@/components/ui';
import type { ClientProctoringView } from '@/stores/useExamStore';

interface ProctoringGateProps {
    proctoring: ClientProctoringView | null | undefined;
    scheduledSessionId: string | null;
    children: React.ReactNode;
}

/**
 * Blocks the exam UI when the test requires Safe Exam Browser and the student
 * is not in SEB (Epoch 11 §10.3).
 *
 * This is an advisory convenience: even if a student bypasses this gate (e.g.
 * via devtools), the backend SEB integrity guard 403s every exam-data request,
 * so no attempt can actually proceed outside SEB. The gate just saves the
 * student a confusing wall of failed requests by telling them what to do.
 */
export default function ProctoringGate({
    proctoring,
    scheduledSessionId,
    children,
}: ProctoringGateProps) {
    const [downloading, setDownloading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const requiresSeb = proctoring?.require_seb ?? false;
    if (!requiresSeb || isLikelySeb()) {
        return <>{children}</>;
    }

    const downloadSebConfig = async () => {
        if (!scheduledSessionId) {
            setError('This exam is not linked to a scheduled session.');
            return;
        }
        setDownloading(true);
        setError(null);
        try {
            const res = await api.get(
                `student/sessions/${scheduledSessionId}/seb-config`,
                { responseType: 'blob' },
            );
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.download = `exam-${scheduledSessionId}.seb`;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            setError('Could not download the configuration. Contact your invigilator.');
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="min-h-screen bg-shell-surface text-foreground flex items-center justify-center p-6">
            <div className="max-w-md w-full rounded-2xl border border-shell-border bg-shell-bg p-8 text-center space-y-5 shadow-[var(--shadow-card)]">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-brand"
                        aria-hidden="true"
                    >
                        <rect x="3" y="11" width="18" height="11" rx="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                </div>
                <h1 className="text-h2 font-semibold">Safe Exam Browser required</h1>
                <div className="text-shell-muted text-meta text-left space-y-2">
                    <p>This exam must be taken inside Safe Exam Browser. Please follow these steps:</p>
                    <ol className="list-decimal pl-5 space-y-1">
                        <li>Download the exam launcher file below.</li>
                        <li>Open the downloaded file with Safe Exam Browser.</li>
                        <li>The exam will launch automatically in the secure browser.</li>
                    </ol>
                </div>
                <Button
                    variant="primary"
                    size="md"
                    onClick={downloadSebConfig}
                    disabled={downloading}
                    className="w-full"
                >
                    {downloading ? 'Preparing…' : 'Get the exam launcher file'}
                </Button>
                {error && (
                    <p className="text-[var(--color-danger-fg)] text-meta" role="alert">
                        {error}
                    </p>
                )}
                <p className="text-shell-muted-dim text-eyebrow">
                    Don’t have Safe Exam Browser? Ask your invigilator for the installer.
                </p>
            </div>
        </div>
    );
}
