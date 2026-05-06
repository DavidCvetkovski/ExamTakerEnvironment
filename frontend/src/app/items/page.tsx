'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useLibraryStore } from '@/stores/useLibraryStore';
import {
    Badge,
    Button,
    EmptyState,
    Input,
    PageHeader,
    Select,
    Table,
    TableContainer,
    TBody,
    TD,
    TH,
    THead,
    TR,
} from '@/components/ui';

function getMetadataString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() !== '' ? value : null;
}
function getMetadataNumber(value: unknown): number | undefined {
    return typeof value === 'number' ? value : undefined;
}

const STATUS_TONE: Record<string, 'neutral' | 'warning' | 'success' | 'danger'> = {
    DRAFT: 'neutral',
    READY_FOR_REVIEW: 'warning',
    APPROVED: 'success',
    RETIRED: 'danger',
};

export default function ItemsLibraryPage() {
    const router = useRouter();
    const { items, isLoading, error, fetchItems, createItem } = useLibraryStore();
    const [isCreating, setIsCreating] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [subjectFilter, setSubjectFilter] = useState('all');

    useEffect(() => { fetchItems(); }, [fetchItems]);

    const uniqueSubjects = Array.from(
        new Set(items.map((item) => getMetadataString(item.metadata_tags?.topic)).filter((v): v is string => v !== null))
    );

    const filteredItems = items.filter((item) => {
        const matchesSearch =
            (item.latest_content_preview || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.id.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSubject = subjectFilter === 'all' || getMetadataString(item.metadata_tags?.topic) === subjectFilter;
        return matchesSearch && matchesSubject;
    });

    const handleCreateNew = async () => {
        setIsCreating(true);
        try {
            const newId = await createItem();
            router.push(`/author?lo_id=${newId}`);
        } catch (err) {
            console.error(err);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-screen bg-shell-bg text-foreground">
                <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
                    <PageHeader
                        eyebrow="Item bank"
                        title="Question Library"
                        subtitle="Browse, filter, and author the learning objects that feed every test."
                        actions={
                            <Button variant="primary" size="md" loading={isCreating} onClick={handleCreateNew}>
                                + New question
                            </Button>
                        }
                    />

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex-1 min-w-[280px]">
                            <Input
                                inputSize="md"
                                type="text"
                                placeholder="Search by content or ID…"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="min-w-filter">
                            <Select
                                inputSize="md"
                                value={subjectFilter}
                                onChange={(e) => setSubjectFilter(e.target.value)}
                            >
                                <option value="all">All subjects</option>
                                {uniqueSubjects.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </Select>
                        </div>
                    </div>

                    {error && (
                        <div className="rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] px-4 py-3 text-meta text-[var(--color-danger-fg)]">
                            {typeof error === 'string' ? error : 'An error occurred while loading items.'}
                        </div>
                    )}

                    {isLoading && items.length === 0 ? (
                        <div className="flex items-center justify-center py-16 text-shell-muted-dim text-meta">
                            <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin mr-3" />
                            Loading library items…
                        </div>
                    ) : items.length === 0 ? (
                        <EmptyState
                            title="No questions yet"
                            description="Get started by creating your first learning object."
                            action={
                                <Button variant="primary" size="md" onClick={handleCreateNew} loading={isCreating}>
                                    + New question
                                </Button>
                            }
                        />
                    ) : (
                        <TableContainer>
                            <Table>
                                <THead>
                                    <TR>
                                        <TH>Preview</TH>
                                        <TH>Subject</TH>
                                        <TH align="right">Points</TH>
                                        <TH>Type</TH>
                                        <TH>Status</TH>
                                        <TH>Created</TH>
                                        <TH align="right">Actions</TH>
                                    </TR>
                                </THead>
                                <TBody>
                                    {filteredItems.map((item) => (
                                        <TR key={item.id}>
                                            <TD>
                                                <div className="max-w-cell truncate font-medium text-foreground" title={item.latest_content_preview}>
                                                    {item.latest_content_preview || (
                                                        <span className="text-shell-muted-dim italic">Empty question</span>
                                                    )}
                                                </div>
                                            </TD>
                                            <TD>
                                                {getMetadataString(item.metadata_tags?.topic) || (
                                                    <span className="text-shell-muted-dim italic">General</span>
                                                )}
                                            </TD>
                                            <TD align="right" numeric className="font-medium">
                                                {getMetadataNumber(item.metadata_tags?.points) ?? 1}
                                            </TD>
                                            <TD className="text-shell-muted">
                                                {item.latest_question_type === 'MULTIPLE_CHOICE'
                                                    ? 'Single choice'
                                                    : item.latest_question_type === 'MULTIPLE_RESPONSE'
                                                    ? 'Multiple choice'
                                                    : 'Essay'}
                                            </TD>
                                            <TD>
                                                <Badge tone={STATUS_TONE[item.latest_status] ?? 'neutral'} size="sm">
                                                    {item.latest_status.replace(/_/g, ' ')}
                                                </Badge>
                                            </TD>
                                            <TD className="text-shell-muted-dim tabular-nums">
                                                {new Date(item.created_at).toLocaleDateString()}
                                            </TD>
                                            <TD align="right">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => router.push(`/author?lo_id=${item.id}`)}
                                                >
                                                    Edit →
                                                </Button>
                                            </TD>
                                        </TR>
                                    ))}
                                </TBody>
                            </Table>
                        </TableContainer>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
}
