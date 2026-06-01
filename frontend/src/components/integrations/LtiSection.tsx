'use client';

import { useEffect, useState } from 'react';
import { useIntegrationsStore } from '@/stores/useIntegrationsStore';
import { useToast } from '@/components/ui/useToast';
import { SectionHeader } from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Input, Field } from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import EmptyState from '@/components/ui/EmptyState';
import {
    Table,
    TableContainer,
    THead as TableHead,
    TBody as TableBody,
    TR as TableRow,
    TH as TableHeaderCell,
    TD as TableCell,
} from '@/components/ui';
import IntegrationInfo, { LTI_INFO } from '@/components/integrations/IntegrationInfo';
import type { LtiPlatformCreate } from '@/lib/integrations.types';

const EMPTY_PLATFORM: LtiPlatformCreate = {
    name: '',
    issuer: '',
    client_id: '',
    auth_login_url: '',
    auth_token_url: '',
    auth_jwks_url: '',
    deployment_ids: [],
};

function PlatformForm() {
    const { toast } = useToast();
    const createPlatform = useIntegrationsStore((s) => s.createPlatform);
    const [form, setForm] = useState<LtiPlatformCreate>(EMPTY_PLATFORM);
    const [deployments, setDeployments] = useState('');
    const [busy, setBusy] = useState(false);

    const set = (key: keyof LtiPlatformCreate) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm((f) => ({ ...f, [key]: e.target.value }));

    const submit = async () => {
        setBusy(true);
        try {
            await createPlatform({
                ...form,
                deployment_ids: deployments.split(',').map((d) => d.trim()).filter(Boolean),
            });
            toast({ tone: 'success', title: 'Platform registered' });
            setForm(EMPTY_PLATFORM);
            setDeployments('');
        } catch {
            toast({ tone: 'danger', title: 'Registration failed' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Card>
            <h3 className="text-h3 text-foreground mb-4">Register a platform</h3>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name"><Input value={form.name} onChange={set('name')} /></Field>
                <Field label="Issuer"><Input value={form.issuer} onChange={set('issuer')} /></Field>
                <Field label="Client ID"><Input value={form.client_id} onChange={set('client_id')} /></Field>
                <Field label="Auth login URL"><Input value={form.auth_login_url} onChange={set('auth_login_url')} /></Field>
                <Field label="Token URL"><Input value={form.auth_token_url} onChange={set('auth_token_url')} /></Field>
                <Field label="JWKS URL"><Input value={form.auth_jwks_url} onChange={set('auth_jwks_url')} /></Field>
                <Field label="Deployment IDs (comma-separated)" className="sm:col-span-2">
                    <Input value={deployments} onChange={(e) => setDeployments(e.target.value)} />
                </Field>
            </div>
            <div className="mt-4">
                <Button onClick={submit} loading={busy}>Register platform</Button>
            </div>
        </Card>
    );
}

function MappableTable<T extends { id: string }>({
    title,
    rows,
    columns,
    placeholder,
    onMap,
    mapLabel,
}: {
    title: string;
    rows: T[];
    columns: { header: string; cell: (row: T) => React.ReactNode }[];
    placeholder: string;
    onMap: (id: string, value: string) => Promise<void>;
    mapLabel: string;
}) {
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const { toast } = useToast();

    const map = async (id: string) => {
        const value = (drafts[id] ?? '').trim();
        if (!value) return;
        try {
            await onMap(id, value);
            toast({ tone: 'success', title: 'Mapping saved' });
        } catch {
            toast({ tone: 'danger', title: 'Mapping failed' });
        }
    };

    if (rows.length === 0) {
        return (
            <Card>
                <h3 className="text-h3 text-foreground mb-3">{title}</h3>
                <EmptyState title="Nothing to map" description="No unmapped records right now." variant="compact" />
            </Card>
        );
    }

    return (
        <Card padding="none">
            <h3 className="text-h3 text-foreground p-5 pb-3">{title}</h3>
            <TableContainer>
                <Table>
                    <TableHead>
                        <TableRow>
                            {columns.map((c) => (
                                <TableHeaderCell key={c.header}>{c.header}</TableHeaderCell>
                            ))}
                            <TableHeaderCell>{mapLabel}</TableHeaderCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.map((row) => (
                            <TableRow key={row.id}>
                                {columns.map((c) => (
                                    <TableCell key={c.header}>{c.cell(row)}</TableCell>
                                ))}
                                <TableCell>
                                    <div className="flex gap-2">
                                        <Input
                                            inputSize="sm"
                                            placeholder={placeholder}
                                            value={drafts[row.id] ?? ''}
                                            onChange={(e) =>
                                                setDrafts((d) => ({ ...d, [row.id]: e.target.value }))
                                            }
                                        />
                                        <Button size="sm" variant="secondary" onClick={() => map(row.id)}>
                                            Save
                                        </Button>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Card>
    );
}

export default function LtiSection() {
    const {
        platforms,
        contexts,
        resourceLinks,
        passbacks,
        loadPlatforms,
        loadContexts,
        loadResourceLinks,
        loadPassbacks,
        mapContext,
        mapResourceLink,
        retryPassback,
    } = useIntegrationsStore();
    const { toast } = useToast();

    useEffect(() => {
        loadPlatforms();
        loadContexts(true);
        loadResourceLinks(true);
        loadPassbacks();
    }, [loadPlatforms, loadContexts, loadResourceLinks, loadPassbacks]);

    return (
        <section className="space-y-4">
            <SectionHeader
                title="LTI 1.3 platforms"
                subtitle="Trusted Canvas registrations and the bindings that resolve a launch."
                actions={<IntegrationInfo content={LTI_INFO} />}
            />

            <Card padding="none">
                <h3 className="text-h3 text-foreground p-5 pb-3">Registered platforms</h3>
                {platforms.length === 0 ? (
                    <div className="p-5 pt-0">
                        <EmptyState title="No platforms yet" description="Register one below." variant="compact" />
                    </div>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableHeaderCell>Name</TableHeaderCell>
                                    <TableHeaderCell>Issuer</TableHeaderCell>
                                    <TableHeaderCell>Client ID</TableHeaderCell>
                                    <TableHeaderCell>Status</TableHeaderCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {platforms.map((p) => (
                                    <TableRow key={p.id}>
                                        <TableCell>{p.name}</TableCell>
                                        <TableCell>{p.issuer}</TableCell>
                                        <TableCell>{p.client_id}</TableCell>
                                        <TableCell>
                                            <Badge tone={p.is_active ? 'success' : 'neutral'}>
                                                {p.is_active ? 'Active' : 'Inactive'}
                                            </Badge>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Card>

            <PlatformForm />

            <MappableTable
                title="Unmapped contexts"
                rows={contexts.filter((c) => !c.course_id)}
                columns={[
                    { header: 'Context', cell: (r) => r.title ?? r.context_id },
                ]}
                placeholder="course id"
                mapLabel="Map to course"
                onMap={(id, value) => mapContext(id, value)}
            />

            <MappableTable
                title="Unmapped resource links"
                rows={resourceLinks.filter((r) => !r.scheduled_session_id && !r.test_definition_id)}
                columns={[
                    { header: 'Resource link', cell: (r) => r.title ?? r.resource_link_id },
                ]}
                placeholder="scheduled session id"
                mapLabel="Map to session"
                onMap={(id, value) => mapResourceLink(id, { scheduled_session_id: value })}
            />

            <Card padding="none">
                <h3 className="text-h3 text-foreground p-5 pb-3">Grade passbacks</h3>
                {passbacks.length === 0 ? (
                    <div className="p-5 pt-0">
                        <EmptyState title="No passbacks yet" description="They appear after grades are pushed." variant="compact" />
                    </div>
                ) : (
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableHeaderCell>Result</TableHeaderCell>
                                    <TableHeaderCell>Status</TableHeaderCell>
                                    <TableHeaderCell>Score</TableHeaderCell>
                                    <TableHeaderCell>Attempts</TableHeaderCell>
                                    <TableHeaderCell>Action</TableHeaderCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {passbacks.map((pb) => (
                                    <TableRow key={pb.id}>
                                        <TableCell>{pb.session_result_id.slice(0, 8)}</TableCell>
                                        <TableCell>
                                            <Badge tone={pb.status === 'SUCCEEDED' ? 'success' : pb.status.startsWith('FAILED') ? 'danger' : 'warning'}>
                                                {pb.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {pb.score_given ?? '—'} / {pb.score_maximum ?? '—'}
                                        </TableCell>
                                        <TableCell>{pb.attempts}</TableCell>
                                        <TableCell>
                                            {pb.status !== 'SUCCEEDED' && pb.status !== 'FAILED_PERMANENT' && (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={async () => {
                                                        try {
                                                            await retryPassback(pb.id);
                                                            toast({ tone: 'success', title: 'Retried' });
                                                        } catch {
                                                            toast({ tone: 'danger', title: 'Retry failed' });
                                                        }
                                                    }}
                                                >
                                                    Retry
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Card>
        </section>
    );
}
