'use client';

import { Button } from '@/components/ui';

interface CancelSessionModalProps {
    sessionId: string | null;
    onConfirm: (id: string) => Promise<void>;
    onClose: () => void;
    isBusy: boolean;
}

export default function CancelSessionModal({ sessionId, onConfirm, onClose, isBusy }: CancelSessionModalProps) {
    if (!sessionId) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-shell-border bg-shell-surface p-6 shadow-elevated">
                <h3 className="text-h3 font-semibold text-foreground">Cancel this session?</h3>
                <p className="mt-2 text-meta text-shell-muted-dim">
                    This will prevent students from joining. Already active attempts are unaffected.
                    This action cannot be undone.
                </p>
                <div className="mt-6 flex justify-end gap-3">
                    <Button variant="secondary" size="md" disabled={isBusy} onClick={onClose}>
                        Keep session
                    </Button>
                    <Button variant="destructive" size="md" disabled={isBusy} loading={isBusy}
                        onClick={() => onConfirm(sessionId)}>
                        Yes, cancel
                    </Button>
                </div>
            </div>
        </div>
    );
}
