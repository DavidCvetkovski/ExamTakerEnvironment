import React, { useEffect, useState } from 'react';
import { useBlueprintStore, AvailableItem } from '@/stores/useBlueprintStore';
import { Button, Badge } from '@/components/ui';

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

function OpenQuestionPickerModal({ onClose, onSelect, excludeIds }: OpenQuestionPickerModalProps) {
    const { availableItems, fetchAvailableItems, isLoading } = useBlueprintStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [subjectFilter, setSubjectFilter] = useState<string>('all');
    const [inspectedItem, setInspectedItem] = useState<AvailableItem | null>(null);

    useEffect(() => {
        fetchAvailableItems();
    }, [fetchAvailableItems]);

    const handleClose = () => {
        setInspectedItem(null);
        onClose();
    };

    const uniqueSubjects = Array.from(
        new Set(availableItems.map((i) => i.metadata_tags?.topic).filter(Boolean))
    ) as string[];

    const filteredItems = availableItems.filter((item) => {
        const matchesSearch = item.latest_content_preview.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === 'all' || item.latest_question_type === typeFilter;
        const matchesSubject = subjectFilter === 'all' || item.metadata_tags?.topic === subjectFilter;
        const isExcluded = excludeIds.includes(item.id);
        return matchesSearch && matchesType && matchesSubject && !isExcluded;
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-5">
            <div className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-shell-border bg-shell-surface shadow-elevated"
                style={{ maxHeight: '80vh' }}>
                {/* Header */}
                <div className="flex items-center justify-between border-b border-shell-border bg-shell-surface/80 px-6 py-5">
                    <h2 className="text-h2 font-semibold text-foreground">Select Question</h2>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-shell-border text-shell-muted transition-colors hover:bg-shell-input hover:text-foreground"
                    >
                        ✕
                    </button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-3 border-b border-shell-border px-6 py-4">
                    <input
                        type="text"
                        placeholder="Search questions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex-1 min-w-[200px] rounded-xl border border-shell-border bg-shell-input px-4 py-2.5 text-sm text-foreground outline-none transition focus:border-brand placeholder:text-shell-muted"
                    />
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
                        <div className="px-6 py-10 text-center text-shell-muted-dim text-sm">Loading questions...</div>
                    ) : inspectedItem ? (
                        <div className="p-6 text-foreground">
                            <div className="mb-6 flex items-start justify-between">
                                <button
                                    type="button"
                                    onClick={() => setInspectedItem(null)}
                                    className="text-sm text-shell-muted hover:text-foreground transition-colors"
                                >
                                    ← Back to list
                                </button>
                                <Button
                                    variant="primary"
                                    size="md"
                                    disabled={excludeIds.includes(inspectedItem.id)}
                                    onClick={() => {
                                        setInspectedItem(null);
                                        onSelect(inspectedItem);
                                    }}
                                >
                                    {excludeIds.includes(inspectedItem.id) ? 'Already Added' : 'Select This Question'}
                                </Button>
                            </div>

                            <div className="rounded-2xl border border-shell-border bg-shell-bg p-8 space-y-6">
                                <div>
                                    <p className="mb-2 text-xs font-bold uppercase tracking-widest text-shell-muted-dim">Content</p>
                                    <p className="text-base leading-relaxed text-foreground break-words whitespace-pre-wrap">
                                        {inspectedItem.latest_content_preview}
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
                                    <div>
                                        <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-shell-muted-dim">Type</p>
                                        <Badge tone={typeTone(inspectedItem.latest_question_type)} size="sm">
                                            {inspectedItem.latest_question_type.replace('_', ' ')}
                                        </Badge>
                                    </div>
                                    <div>
                                        <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-shell-muted-dim">Points</p>
                                        <span className="text-foreground font-semibold">{inspectedItem.metadata_tags?.points ?? 1}</span>
                                    </div>
                                    {inspectedItem.metadata_tags?.topic ? (
                                        <div>
                                            <p className="mb-1.5 text-xs font-bold uppercase tracking-widest text-shell-muted-dim">Topic</p>
                                            <span className="text-foreground">{inspectedItem.metadata_tags.topic as string}</span>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="px-6 py-16 text-center text-shell-muted-dim">
                            <p className="text-4xl mb-4">🔍</p>
                            <p className="text-base">No questions found.</p>
                            <p className="mt-2 text-sm">Try adjusting your search or filters.</p>
                        </div>
                    ) : (
                        <div className="grid gap-2.5">
                            {filteredItems.map((item) => {
                                const excluded = excludeIds.includes(item.id);
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => setInspectedItem(item)}
                                        className="group flex cursor-pointer items-center gap-4 rounded-2xl border border-shell-border bg-shell-input/30 px-5 py-4 transition-all hover:border-brand/30 hover:bg-shell-input"
                                    >
                                        <Badge tone={typeTone(item.latest_question_type)} size="sm">
                                            {typeLabel(item.latest_question_type)}
                                        </Badge>
                                        <div className="flex-1 min-w-0">
                                            <p className="truncate text-sm font-medium text-foreground">
                                                {item.latest_content_preview}
                                            </p>
                                            <div className="mt-1 flex gap-3 text-xs text-shell-muted-dim">
                                                {item.metadata_tags?.topic && <span>{item.metadata_tags.topic}</span>}
                                                <span>{item.metadata_tags?.points ?? 1} pt(s)</span>
                                            </div>
                                        </div>
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
                                            {excluded ? 'Added' : 'Select'}
                                        </button>
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
