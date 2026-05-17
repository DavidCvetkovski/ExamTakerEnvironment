import React, { useEffect, useState } from 'react';
import { useBlueprintStore, AvailableItem } from '@/stores/useBlueprintStore';
import { Button, Badge } from '@/components/ui';
import { api } from '@/lib/api';
import { subjectTone } from '@/lib/subjectColor';
import QuestionInspector from '@/components/editor/QuestionInspector';

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
    options: { question_type: string; choices?: Array<{ id: string; text: string; is_correct: boolean }>; min_words?: number; max_words?: number } | null;
    metadata_tags: Record<string, unknown> | null;
};

function normaliseOptions(v: VersionResponse): Array<{ id: string; text: string; is_correct: boolean }> | { min_words?: number; max_words?: number } | null {
    if (!v.options) return null;
    if (v.options.choices) return v.options.choices;
    if (v.question_type === 'ESSAY') return { min_words: v.options.min_words, max_words: v.options.max_words };
    return null;
}

function OpenQuestionPickerModal({ onClose, onSelect, excludeIds }: OpenQuestionPickerModalProps) {
    const { availableItems, fetchAvailableItems, isLoading } = useBlueprintStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [courseFilter, setCourseFilter] = useState<string>('all');
    const [topicFilter, setTopicFilter] = useState<string>('all');
    const [inspectedItem, setInspectedItem] = useState<AvailableItem | null>(null);
    const [inspectedVersion, setInspectedVersion] = useState<VersionResponse | null>(null);
    const [versionLoading, setVersionLoading] = useState(false);
    const [versionError, setVersionError] = useState<string | null>(null);

    useEffect(() => {
        fetchAvailableItems();
    }, [fetchAvailableItems]);

    const handleClose = () => {
        setInspectedItem(null);
        setInspectedVersion(null);
        setVersionError(null);
        setVersionLoading(false);
        onClose();
    };

    const handleBackToList = () => {
        setInspectedItem(null);
        setInspectedVersion(null);
        setVersionError(null);
        setVersionLoading(false);
    };

    const handleInspectItem = async (item: AvailableItem) => {
        setInspectedItem(item);
        setInspectedVersion(null);
        setVersionError(null);
        setVersionLoading(true);
        try {
            const res = await api.get<VersionResponse[]>(`learning-objects/${item.id}/versions`);
            const versions = res.data ?? [];
            const latest = versions.reduce<VersionResponse | null>(
                (acc, v) => (acc === null || v.version_number > acc.version_number ? v : acc),
                null,
            );
            setInspectedVersion(latest);
        } catch {
            setVersionError('Failed to load question preview.');
        } finally {
            setVersionLoading(false);
        }
    };

    const uniqueCourses = Array.from(
        new Map(
            availableItems
                .filter((i) => i.course_id && i.course_title)
                .map((i) => [i.course_id as string, i.course_title as string])
        ).entries()
    ).sort((left, right) => left[1].localeCompare(right[1]));

    const uniqueTopics = Array.from(
        new Set(availableItems.map((i) => i.metadata_tags?.topic).filter(Boolean))
    ).sort((left, right) => String(left).localeCompare(String(right))) as string[];

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isIdSearch = UUID_RE.test(searchQuery.trim());

    const filteredItems = availableItems.filter((item) => {
        const matchesSearch = isIdSearch
            ? item.id.toLowerCase() === searchQuery.trim().toLowerCase()
            : item.latest_content_preview.toLowerCase().includes(searchQuery.toLowerCase()) ||
              item.id.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === 'all' || item.latest_question_type === typeFilter;
        const matchesCourse = courseFilter === 'all' || item.course_id === courseFilter;
        const matchesTopic = topicFilter === 'all' || item.metadata_tags?.topic === topicFilter;
        const isExcluded = excludeIds.includes(item.id);
        return matchesSearch && matchesType && matchesCourse && matchesTopic && !isExcluded;
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
                        value={courseFilter}
                        onChange={(e) => setCourseFilter(e.target.value)}
                        className="rounded-xl border border-shell-border bg-shell-input px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-brand"
                    >
                        <option value="all">All Courses</option>
                        {uniqueCourses.map(([id, title]) => (
                            <option key={id} value={id}>{title}</option>
                        ))}
                    </select>
                    <select
                        value={topicFilter}
                        onChange={(e) => setTopicFilter(e.target.value)}
                        className="rounded-xl border border-shell-border bg-shell-input px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-brand"
                    >
                        <option value="all">All Topics</option>
                        {uniqueTopics.map((topic) => (
                            <option key={topic} value={topic}>{topic}</option>
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
                                    onClick={handleBackToList}
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
                                    {excludeIds.includes(inspectedItem.id) ? 'Added' : 'Add'}
                                </Button>
                            </div>

                            {versionLoading ? (
                                <div className="px-6 py-10 text-center text-shell-muted-dim text-sm">Loading…</div>
                            ) : versionError ? (
                                <div className="rounded-xl border border-shell-border bg-shell-bg px-6 py-8 text-center">
                                    <p className="text-meta text-[var(--color-danger-fg)]">{versionError}</p>
                                </div>
                            ) : inspectedVersion ? (
                                <QuestionInspector
                                    questionType={inspectedVersion.question_type}
                                    content={inspectedVersion.content}
                                    options={normaliseOptions(inspectedVersion)}
                                    metadataTags={inspectedItem.metadata_tags}
                                    showCorrectness
                                />
                            ) : null}
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
                                        onClick={() => { void handleInspectItem(item); }}
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
                                                {topic && <TopicDot topic={topic} />}
                                                {item.course_title && <span title={item.course_code ?? undefined}>{item.course_title}</span>}
                                                <span>{item.metadata_tags?.points ?? 1} pt(s)</span>
                                            </div>
                                        </div>
                                        <div className="shrink-0 flex items-center gap-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={(e: React.MouseEvent) => { e.stopPropagation(); void handleInspectItem(item); }}
                                            >
                                                Preview
                                            </Button>
                                            <Button
                                                variant="primary"
                                                size="sm"
                                                disabled={excluded}
                                                onClick={(e: React.MouseEvent) => {
                                                    e.stopPropagation();
                                                    if (!excluded) onSelect(item);
                                                }}
                                            >
                                                {excluded ? 'Added' : 'Add'}
                                            </Button>
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

function TopicDot({ topic }: { topic: string }) {
    const tone = subjectTone(topic);
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-full ${tone.dot}`} aria-hidden="true" />
            <span>{topic}</span>
        </span>
    );
}
