'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/useToast';
import { Spinner } from '@/components/ui/Spinner';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';

interface Candidate {
    id: string;
    kind: string;
    title: string;
    starts_at: string | null;
}

interface DeepLinkSession {
    id: string;
    context_label: string | null;
    candidate_sessions: Candidate[];
    return_url: string;
}

// Build and submit the standard Canvas deep-linking auto-post form. The JWT is
// signed server-side; the browser only relays it (directive §10.3 security).
function autoPostToCanvas(returnUrl: string, jwt: string) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = returnUrl;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'JWT';
    input.value = jwt;
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
}

function DeepLinkPicker() {
    const params = useSearchParams();
    const sessionId = params.get('session') || '';
    const { toast } = useToast();
    const [session, setSession] = useState<DeepLinkSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState<string | null>(null);

    useEffect(() => {
        if (!sessionId) {
            setLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.get(`lti/deep-link/${sessionId}`);
                if (!cancelled) setSession(data);
            } catch {
                if (!cancelled) toast({ tone: 'danger', title: 'Could not load deep-link session' });
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [sessionId, toast]);

    const choose = async (candidate: Candidate) => {
        setSubmitting(candidate.id);
        try {
            const body =
                candidate.kind === 'test'
                    ? { test_definition_id: candidate.id, title: candidate.title }
                    : { scheduled_session_id: candidate.id, title: candidate.title };
            const { data } = await api.post(`lti/deep-link/${sessionId}/respond`, body);
            autoPostToCanvas(data.return_url, data.jwt);
        } catch {
            toast({ tone: 'danger', title: 'Could not create the deep link' });
            setSubmitting(null);
        }
    };

    if (loading) return <Spinner size="lg" tone="brand" />;
    if (!session) {
        return (
            <Card className="max-w-md">
                <EmptyState
                    title="No deep-link session"
                    description="Open this page from a Canvas assignment selection."
                />
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-2xl">
            <h1 className="text-h2 text-foreground mb-1">Choose an exam</h1>
            <p className="text-meta text-shell-muted mb-5">
                {session.context_label
                    ? `Linking into ${session.context_label}.`
                    : 'Select what Canvas should link to.'}
            </p>
            {session.candidate_sessions.length === 0 ? (
                <EmptyState
                    title="Nothing available"
                    description="No approved exams or scheduled sessions for this context yet."
                    variant="compact"
                />
            ) : (
                <ul className="space-y-2">
                    {session.candidate_sessions.map((c) => (
                        <li
                            key={c.id}
                            className="flex items-center justify-between gap-4 rounded-xl border border-shell-border bg-shell-surface p-4"
                        >
                            <div className="min-w-0">
                                <p className="text-body text-foreground truncate">{c.title}</p>
                                <Badge tone="neutral" size="sm">
                                    {c.kind}
                                </Badge>
                            </div>
                            <Button
                                onClick={() => choose(c)}
                                loading={submitting === c.id}
                                disabled={submitting !== null}
                            >
                                Link this
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

export default function LtiDeepLinkPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-shell-bg px-4 py-8">
            <Suspense fallback={<Spinner size="lg" tone="brand" />}>
                <DeepLinkPicker />
            </Suspense>
        </div>
    );
}
