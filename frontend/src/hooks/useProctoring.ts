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
 * When "block copy/paste" is enabled it blocks the clipboard across the whole
 * exam (typing still works) — pasting a pre-written answer into the essay box is
 * exactly what that policy is meant to stop.
 */
type ReportableType =
    | 'FOCUS_LOST'
    | 'COPY_ATTEMPT'
    | 'PASTE_ATTEMPT'
    | 'CONTEXT_MENU_ATTEMPT'
    | 'FULLSCREEN_EXIT';

const REPORT_THROTTLE_MS = 1500;

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
            // Block clipboard everywhere on the exam. Typing still works (not a
            // clipboard event); we deliberately do NOT exempt the answer editor,
            // because pasting a pre-written answer is the exact behaviour an exam
            // with "block copy/paste" is meant to prevent.
            const blockClipboard = (incidentType: ReportableType) => (e: ClipboardEvent) => {
                e.preventDefault();
                e.stopPropagation();
                report(incidentType);
            };
            const onCopy = blockClipboard('COPY_ATTEMPT');
            const onCut = blockClipboard('COPY_ATTEMPT');
            const onPaste = blockClipboard('PASTE_ATTEMPT');
            // Capture phase so we intercept before any inner (TipTap) handler can
            // act, and also guard Ctrl/Cmd+C/X/V directly — some browsers fire the
            // keydown but suppress the clipboard event.
            const onKeydown = (e: KeyboardEvent) => {
                if (!(e.ctrlKey || e.metaKey)) return;
                const key = e.key.toLowerCase();
                if (key !== 'c' && key !== 'x' && key !== 'v') return;
                e.preventDefault();
                e.stopPropagation();
                report(key === 'v' ? 'PASTE_ATTEMPT' : 'COPY_ATTEMPT');
            };
            document.addEventListener('copy', onCopy, true);
            document.addEventListener('cut', onCut, true);
            document.addEventListener('paste', onPaste, true);
            document.addEventListener('keydown', onKeydown, true);
            cleanups.push(() => {
                document.removeEventListener('copy', onCopy, true);
                document.removeEventListener('cut', onCut, true);
                document.removeEventListener('paste', onPaste, true);
                document.removeEventListener('keydown', onKeydown, true);
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
