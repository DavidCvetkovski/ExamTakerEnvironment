'use client';

import Modal from '@/components/ui/Modal';

/** The exam keyboard shortcuts, surfaced both here and wired on the exam page.
 *  Single source — the help dialog and the handler read the same intent list. */
export const EXAM_SHORTCUTS: Array<{ keys: string[]; action: string }> = [
    { keys: ['→', '↓'], action: 'Next question' },
    { keys: ['←', '↑'], action: 'Previous question' },
    { keys: ['F'], action: 'Flag or unflag the current question' },
    { keys: ['?'], action: 'Show this help' },
    { keys: ['Esc'], action: 'Close this dialog' },
];

interface KeyboardShortcutsDialogProps {
    isOpen: boolean;
    onClose: () => void;
}

/** Keyboard-shortcuts reference for the exam surface (Epoch 10, F2). */
export default function KeyboardShortcutsDialog({ isOpen, onClose }: KeyboardShortcutsDialogProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Keyboard shortcuts" size="sm">
            <dl className="space-y-3">
                {EXAM_SHORTCUTS.map(({ keys, action }) => (
                    <div key={action} className="flex items-center justify-between gap-4">
                        <dt className="text-meta text-foreground">{action}</dt>
                        <dd className="flex items-center gap-1.5">
                            {keys.map((key, i) => (
                                <span key={key} className="flex items-center gap-1.5">
                                    {i > 0 && <span className="text-shell-muted-dim text-xs">or</span>}
                                    <kbd className="inline-flex min-w-[1.75rem] items-center justify-center rounded-md border border-shell-border-deep bg-shell-input px-2 py-1 text-xs font-medium text-foreground">
                                        {key}
                                    </kbd>
                                </span>
                            ))}
                        </dd>
                    </div>
                ))}
            </dl>
        </Modal>
    );
}
