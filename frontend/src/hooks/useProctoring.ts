import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import type { ClientProctoringView } from '@/stores/useExamStore';

/**
 * Client-side anti-cheat runtime for the exam page (Epoch 11 §10.3).
 *
 * ADVISORY UX ONLY — every measure here is a deterrent. The authoritative
 * controls live server-side (SEB integrity guard, IP allowlist, ownership).
 * This hook suppresses the configured browser affordances and reports observed
 * violations so a supervisor can see them; it never decides whether the exam
 * may proceed.
 *
 * Copy/paste blocking is deliberately scoped to NOT fire inside answer inputs
 * (textarea / input / contenteditable) so students can still type and paste
 * *their own* essay answers.
 */
type ReportableType =
    | 'FOCUS_LOST'
    | 'COPY_ATTEMPT'
    | 'PASTE_ATTEMPT'
    | 'CONTEXT_MENU_ATTEMPT'
    | 'FULLSCREEN_EXIT';

const REPORT_THROTTLE_MS = 1500;

function isAnswerField(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLInputElement ||
        (target instanceof HTMLElement && target.isContentEditable)
    );
}

export function useProctoring(
    sessionId: string,
    policy: ClientProctoringView | null | undefined,
): void {
    // Per-type throttle so a held key or rapid blur cannot flood the backend.
    const lastReportRef = useRef<Record<string, number>>({});

    useEffect(() => {
        if (!sessionId || !policy) return;

        const report = (incidentType: ReportableType) => {
            const now = Date.now();
            const last = lastReportRef.current[incidentType] ?? 0;
            if (now - last < REPORT_THROTTLE_MS) return;
            lastReportRef.current[incidentType] = now;
            // Best-effort; a failed report must never disrupt the exam.
            void api
                .post(`sessions/${sessionId}/incidents`, { incident_type: incidentType, detail: {} })
                .catch(() => {});
        };

        const cleanups: Array<() => void> = [];

        if (policy.suppress_context_menu) {
            const onContextMenu = (e: MouseEvent) => {
                e.preventDefault();
                report('CONTEXT_MENU_ATTEMPT');
            };
            document.addEventListener('contextmenu', onContextMenu);
            cleanups.push(() => document.removeEventListener('contextmenu', onContextMenu));
        }

        if (policy.block_copy_paste) {
            const onCopy = (e: ClipboardEvent) => {
                if (isAnswerField(e.target)) return; // never block the student's own answer
                e.preventDefault();
                report('COPY_ATTEMPT');
            };
            const onPaste = (e: ClipboardEvent) => {
                if (isAnswerField(e.target)) return;
                e.preventDefault();
                report('PASTE_ATTEMPT');
            };
            document.addEventListener('copy', onCopy);
            document.addEventListener('cut', onCopy);
            document.addEventListener('paste', onPaste);
            cleanups.push(() => {
                document.removeEventListener('copy', onCopy);
                document.removeEventListener('cut', onCopy);
                document.removeEventListener('paste', onPaste);
            });
        }

        if (policy.detect_focus_loss) {
            const onVisibility = () => {
                if (document.visibilityState === 'hidden') report('FOCUS_LOST');
            };
            const onBlur = () => report('FOCUS_LOST');
            document.addEventListener('visibilitychange', onVisibility);
            window.addEventListener('blur', onBlur);
            cleanups.push(() => {
                document.removeEventListener('visibilitychange', onVisibility);
                window.removeEventListener('blur', onBlur);
            });
        }

        if (policy.require_fullscreen) {
            const onFullscreenChange = () => {
                if (!document.fullscreenElement) report('FULLSCREEN_EXIT');
            };
            document.addEventListener('fullscreenchange', onFullscreenChange);
            cleanups.push(() =>
                document.removeEventListener('fullscreenchange', onFullscreenChange),
            );
        }

        return () => cleanups.forEach((fn) => fn());
    }, [sessionId, policy]);
}
