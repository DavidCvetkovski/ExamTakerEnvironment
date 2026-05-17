'use client';

import { useRouter } from 'next/navigation';
import type { StudentScheduledSession } from '@/stores/useStudentSessionsStore';
import { Badge, Button, Card } from '@/components/ui';
import { useServerNow } from '@/hooks/useServerNow';
import { formatAbsolute, formatScheduled, formatRelativeTime } from '@/lib/relativeTime';

interface StudentExamCardProps {
    session: StudentScheduledSession;
    onJoin: (session: StudentScheduledSession) => Promise<void>;
}

export default function StudentExamCard({ session, onJoin }: StudentExamCardProps) {
    const router = useRouter();
    // Minute-resolution ticking is plenty for "is this start in the past or
    // future" copy decisions — we don't need 1s precision here.
    const now = useServerNow(60_000);
    const startsAt = new Date(session.starts_at);
    const endsAt = new Date(session.ends_at);

    const status = session.existing_attempt_status;
    const alreadySubmitted = status === 'SUBMITTED';
    const alreadyExpired = status === 'EXPIRED';
    const canResume = status === 'STARTED' && session.can_join;
    const canJoinFresh = !status && session.can_join;

    let badgeTone: 'success' | 'info' | 'neutral' = 'neutral';
    let badgeLabel = 'Upcoming';
    if (alreadySubmitted) {
        badgeTone = 'info';
        badgeLabel = 'Submitted';
    } else if (alreadyExpired) {
        badgeTone = 'neutral';
        badgeLabel = 'Window closed';
    } else if (session.can_join) {
        badgeTone = 'success';
        badgeLabel = 'Joinable now';
    }

    return (
        <Card variant="surface" padding="md" className="rounded-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim">
                        {session.course_code}
                    </p>
                    <h3 className="mt-2 text-h2 text-foreground">{session.test_title}</h3>
                    <p className="mt-1 text-meta text-shell-muted">{session.course_title}</p>
                </div>
                <Badge tone={badgeTone} size="sm">{badgeLabel}</Badge>
            </div>

            <div className="mt-5 grid gap-4 rounded-lg bg-shell-input/50 border border-shell-border p-4 text-meta md:grid-cols-2">
                <div>
                    <p className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim">Starts</p>
                    <p
                        className="mt-1 text-foreground font-medium tabular-nums"
                        title={formatAbsolute(startsAt)}
                    >
                        {startsAt > now ? formatScheduled(startsAt) : formatRelativeTime(startsAt)}
                    </p>
                </div>
                <div>
                    <p className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim">Ends</p>
                    <p
                        className="mt-1 text-foreground font-medium tabular-nums"
                        title={formatAbsolute(endsAt)}
                    >
                        {endsAt > now ? formatScheduled(endsAt) : formatRelativeTime(endsAt)}
                    </p>
                </div>
            </div>

            <div className="mt-5">
                {alreadySubmitted ? (
                    <Button
                        variant="secondary"
                        size="lg"
                        fullWidth
                        onClick={() => router.push('/my-grades')}
                        aria-label="Already submitted — see My Grades"
                    >
                        Already submitted — see My Grades
                    </Button>
                ) : alreadyExpired ? (
                    <Button
                        variant="ghost"
                        size="lg"
                        fullWidth
                        disabled
                        aria-label="Window closed"
                    >
                        Window closed — exam expired
                    </Button>
                ) : (
                    <Button
                        variant="primary"
                        size="lg"
                        fullWidth
                        disabled={!canResume && !canJoinFresh}
                        onClick={() => onJoin(session)}
                        aria-label={`${canResume ? 'Resume' : 'Join'} ${session.test_title}`}
                    >
                        {canResume ? 'Resume exam' : 'Join exam'}
                    </Button>
                )}
            </div>
        </Card>
    );
}
