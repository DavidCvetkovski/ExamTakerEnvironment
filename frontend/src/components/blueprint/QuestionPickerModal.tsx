import React, { useEffect, useState } from 'react';
import { useBlueprintStore, AvailableItem } from '@/stores/useBlueprintStore';
import { Button, Badge } from '@/components/ui';
import { api } from '@/lib/api';
import { subjectTone } from '@/lib/subjectColor';
import ReadOnlyTipTap from '@/components/editor/ReadOnlyTipTap';

interface QuestionPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (item: AvailableItem) => void;
    excludeIds?: string[];
}

export default function QuestionPickerModal({ isOpen, onClose, onSelect, excludeIds = [] }: QuestionPickerModalProps) {
    if (!isOpen) {
        return null;
    }

    return (
        <OpenQuestionPickerModal
            onClose={onClose}
            onSelect={onSelect}
            excludeIds={excludeIds}
        />
    );
}

interface OpenQuestionPickerModalProps {
    onClose: () => void;
    onSelect: (item: AvailableItem) => void;
    excludeIds: string[];
}

function typeLabel(qt: string) {
    if (qt === 'MULTIPLE_CHOICE') return 'SC';
    if (qt === 'MULTIPLE_RESPONSE') return 'MC';
    return 'ESS';
}

function typeTone(qt: string): 'info' | 'accent' | 'neutral' {
    if (qt === 'MULTIPLE_CHOICE') return 'info';
    if (qt === 'MULTIPLE_RESPONSE') return 'accent';
    return 'neutral';
}

type VersionResponse = {
    id: string;
    learning_object_id: string;
    version_number: number;
    question_type: string;
    content: Record<string, unknown> | null;
    options: { question_type: string; choices?: Array<{ id: string; text: string; is_correct: boolean }> } | null;
    metadata_tags: Record<string, unknown> | null;
};

function OpenQuestionPickerModal({ onClose, onSelect, excludeIds }: OpenQuestionPickerModalProps) {
    const { availableItems, fetchAvailableItems, isLoading } = useBlueprintStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [subjectFilter, setSubjectFilter] = useState<string>('all');
    const [inspectedItem, setInspectedItem] = useState<AvailableItem | null>(null);
    const [inspectedVersion, setInspectedVersion] = useState<VersionResponse | null>(null);
    const [versionLoading, setVersionLoading] = useState(false);
    const [versionError, setVersionError] = useState<string | null>(null);

    useEffect(() => {
        fetchAvailableItems();
    }, [fetchAvailableItems]);

    // Fetch full latest version when an item is inspected (Stage 6).
    useEffect(() => {
        if (!inspectedItem) {
            setInspectedVersion(null);
            setVersionError(null);
            return;
        }
        let cancelled = false;
        setVersionLoading(true);
        setVersionError(null);
        api.get<VersionResponse[]>(`learning-objects/${inspectedItem.id}/versions`)
            .then((res) => {
                if (cancelled) return;
                const versions = res.data ?? [];
                const latest = versions.reduce<VersionResponse | null>(
                    (acc, v) => (acc === null || v.version_number > acc.version_number ? v : acc),
                    null,
                );
                setInspectedVersion(latest);
            })
            .catch(() => {
                if (!cancelled) setVersionError('Failed to load question preview.');
            })
            .finally(() => {
                if (!cancelled) setVersionLoading(false);
            });
        return () => { cancelled = true; };
    }, [inspectedItem]);

    const handleClose = () => {
        setInspectedItem(null);
        onClose();
    };

    const uniqueSubjects = Array.from(
        new Set(availableItems.map((i) => i.metadata_tags?.topic).filter(Boolean))
    ) as string[];

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isIdSearch = UUID_RE.test(searchQuery.trim());

    const filteredItems = availableItems.filter((item) => {
        const matchesSearch = isIdSearch
            ? item.id.toLowerCase() === searchQuery.trim().toLowerCase()
            : item.latest_content_preview.toLowerCase().includes(searchQuery.toLowerCase()) ||
              item.id.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === 'all' || item.latest_question_type === typeFilter;
        const matchesSubject = subjectFilter === 'all' || item.metadata_tags?.topic === subjectFilter;
        const isExcluded = excludeIds.includes(item.id);
        return matchesSearch && matchesType && matchesSubject && !isExcluded;
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-5">
            <div className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-shell-border bg-shell-surface shadow-elevated"
                style={{ maxHeight: '85vh' }}>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-shell-border bg-shell-surface/80 px-6 py-5">
                    <h2 className="text-h2 font-semibold text-foreground">Select Question</h2>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-shell-border text-shell-muted transition-colors hover:bg-shell-input hover:text-foreground"
                        aria-label="Close"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-3 border-b border-shell-border px-6 py-4">
                    <div className="flex-1 min-w-[200px] space-y-1">
                        <input
                            type="text"
                            placeholder="Search by text or paste a Question ID…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-xl border border-shell-border bg-shell-input px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-brand placeholder:text-shell-muted"
                        />
                    </div>
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        className="rounded-xl border border-shell-border bg-shell-input px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-brand"
                    >
                        <option value="all">All Types</option>
                        <option value="MULTIPLE_CHOICE">Single Choice</option>
                        <option value="MULTIPLE_RESPONSE">Multiple Choice</option>
                        <option value="ESSAY">Essay</option>
                    </select>
                    <select
                        value={subjectFilter}
                        onChange={(e) => setSubjectFilter(e.target.value)}
                        className="rounded-xl border border-shell-border bg-shell-input px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-brand"
                    >
                        <option value="all">All Subjects</option>
                        {uniqueSubjects.map((subject) => (
                            <option key={subject} value={subject}>{subject}</option>
                        ))}
                    </select>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
                    {isLoading ? (
                        <div className="px-6 py-10 text-center text-shell-muted-dim text-sm">Loading questions…</div>
                    ) : inspectedItem ? (
                        <div className="p-6 text-foreground">
                            <div className="mb-6 flex items-start justify-between">
                                <button
                                    type="button"
                                    onClick={() => setInspectedItem(null)}
                                    className="text-sm text-shell-muted hover:text-foreground transition-colors focus-ring rounded"
                                >
                                    ← Back to list
                                </button>
                                <Button
                                    variant="primary"
                                    size="md"
                                    disabled={excludeIds.includes(inspectedItem.id)}
                                    onClick={() => {
                                        const item = inspectedItem;
                                        setInspectedItem(null);
                                        onSelect(item);
                                    }}
                                >
                                    {excludeIds.includes(inspectedItem.id) ? 'Already Added' : 'Select This Question'}
                                </Button>
                            </div>

                            <div className="rounded-2xl border border-shell-border bg-shell-bg p-8 space-y-6">
                                <div>
                                    <p className="mb-2 text-eyebrow font-semibold uppercase tracking-widest text-shell-muted-dim">Content</p>
                                    {versionLoading ? (
                                        <p className="text-meta text-shell-muted-dim">Loading…</p>
                                    ) : versionError ? (
                                        <p className="text-meta text-[var(--color-danger-fg)]">{versionError}</p>
                                    ) : (
                                        <ReadOnlyTipTap content={inspectedVersion?.content ?? null} />
                                    )}
                                </div>

                                {inspectedVersion?.options && 'choices' in inspectedVersion.options && Array.isArray(inspectedVersion.options.choices) && (
                                    <div>
                                        <p className="mb-2 text-eyebrow font-semibold uppercase tracking-widest text-shell-muted-dim">Options</p>
                                        <ul className="space-y-2">
                                            {inspectedVersion.options.choices.map((choice) => (
                                                <li
                                                    key={choice.id}
                                                    className={[
                                                        'flex items-start gap-2 rounded-lg border px-3 py-2 text-meta',
                                                        choice.is_correct
                                                            ? 'border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-fg)]'
                                                            : 'border-shell-border bg-shell-input text-foreground',
                                                    ].join(' ')}
                                                >
                                                    <span className="font-mono text-shell-muted-dim">{choice.is_correct ? '✓' : '·'}</span>
                                                    <span className="flex-1">{choice.text}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
                                    <div>
                                        <p className="mb-1.5 text-eyebrow font-semibold uppercase tracking-widest text-shell-muted-dim">Type</p>
                                        <Badge tone={typeTone(inspectedItem.latest_question_type)} size="sm">
                                            {inspectedItem.latest_question_type.replace('_', ' ')}
                                        </Badge>
                                    </div>
                                    <div>
                                        <p className="mb-1.5 text-eyebrow font-semibold uppercase tracking-widest text-shell-muted-dim">Points</p>
                                        <span className="text-foreground font-semibold">{inspectedItem.metadata_tags?.points ?? 1}</span>
                                    </div>
                                    {inspectedItem.metadata_tags?.topic ? (
                                        <div>
                                            <p className="mb-1.5 text-eyebrow font-semibold uppercase tracking-widest text-shell-muted-dim">Subject</p>
                                            <SubjectDot subject={inspectedItem.metadata_tags.topic as string} />
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="px-6 py-16 text-center text-shell-muted-dim">
                            <p className="text-base">No questions found.</p>
                            <p className="mt-2 text-sm">Try adjusting your search or filters.</p>
                        </div>
                    ) : (
                        <div className="grid gap-2.5">
                            {filteredItems.map((item) => {
                                const excluded = excludeIds.includes(item.id);
                                const topic = item.metadata_tags?.topic as string | undefined;
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => setInspectedItem(item)}
                                        className="group flex cursor-pointer items-start gap-3 rounded-2xl border border-shell-border bg-shell-input/30 px-4 py-3 transition-all hover:border-brand/30 hover:bg-shell-input"
                                    >
                                        <div className="shrink-0 pt-0.5">
                                            <Badge tone={typeTone(item.latest_question_type)} size="sm">
                                                {typeLabel(item.latest_question_type)}
                                            </Badge>
                                        </div>
                                        <div className="flex-1 min-w-0 space-y-1">
                                            <p className="line-clamp-3 text-sm font-medium text-foreground leading-snug">
                                                {item.latest_content_preview}
                                            </p>
                                            <div className="flex items-center gap-3 text-xs text-shell-muted-dim">
                                                {topic && <SubjectDot subject={topic} />}
                                                <span>{item.metadata_tags?.points ?? 1} pt(s)</span>
                                            </div>
                                        </div>
                                        <div className="shrink-0 flex flex-col items-end gap-1">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (!excluded) onSelect(item);
                                                }}
                                                disabled={excluded}
                                                className={[
                                                    'rounded-xl px-4 py-2 text-xs font-bold transition-colors',
                                                    excluded
                                                        ? 'border border-shell-border text-shell-muted-dim cursor-not-allowed'
                                                        : 'border border-brand/30 bg-brand/10 text-brand hover:bg-brand hover:text-white',
                                                ].join(' ')}
                                            >
                                                {excluded ? 'Added' : 'Add'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setInspectedItem(item); }}
                                                className="text-xs text-shell-muted hover:text-foreground focus-ring rounded"
                                                title="Preview question details"
                                            >
                                                Preview
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end border-t border-shell-border bg-shell-surface/60 px-6 py-4">
                    <Button variant="secondary" size="sm" onClick={handleClose}>Cancel</Button>
                </div>
            </div>
        </div>
    );
}

function SubjectDot({ subject }: { subject: string }) {
    const tone = subjectTone(subject);
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
            <span>{subject}</span>
        </span>
    );
}
