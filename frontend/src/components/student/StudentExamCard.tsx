'use client';

import type { StudentScheduledSession } from '@/stores/useStudentSessionsStore';
import { Badge, Button, Card } from '@/components/ui';

interface StudentExamCardProps {
    session: StudentScheduledSession;
    onJoin: (session: StudentScheduledSession) => Promise<void>;
}

export default function StudentExamCard({ session, onJoin }: StudentExamCardProps) {
    const startsAt = new Date(session.starts_at);
    const endsAt = new Date(session.ends_at);
    const canResume = Boolean(session.existing_attempt_id) && session.can_join;

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
                <Badge tone={session.can_join ? 'success' : 'neutral'} size="sm">
                    {session.can_join ? 'Joinable now' : 'Upcoming'}
                </Badge>
            </div>

            <div className="mt-5 grid gap-4 rounded-lg bg-shell-input/50 border border-shell-border p-4 text-meta md:grid-cols-2">
                <div>
                    <p className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim">Starts</p>
                    <p className="mt-1 text-foreground font-medium tabular-nums">{startsAt.toLocaleString()}</p>
                </div>
                <div>
                    <p className="text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim">Ends</p>
                    <p className="mt-1 text-foreground font-medium tabular-nums">{endsAt.toLocaleString()}</p>
                </div>
            </div>

            <div className="mt-5">
                <Button
                    variant="primary"
                    size="lg"
                    fullWidth
                    disabled={!session.can_join}
                    onClick={() => onJoin(session)}
                    aria-label={`${canResume ? 'Resume' : 'Join'} ${session.test_title}`}
                >
                    {canResume ? 'Resume exam' : 'Join exam'}
                </Button>
            </div>
        </Card>
    );
}
