'use client';

import { useMemo, useState, useEffect } from 'react';
import type { TestDefinition, AvailableItem } from '@/stores/useBlueprintStore';
import { Badge } from '@/components/ui';
import BlueprintStatusBadge from '@/components/blueprint/BlueprintStatusBadge';
import { subjectTone } from '@/lib/subjectColor';
import type { BlueprintStatus } from '@/lib/blueprintPermissions';
import { pluralize, pluralizeCount } from '@/lib/pluralize';
import { api } from '@/lib/api';
import QuestionInspector from '@/components/editor/QuestionInspector';

type VersionResponse = {
    id: string;
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

interface BlueprintInspectorProps {
    blueprint: TestDefinition;
    status: BlueprintStatus;
    availableItems: AvailableItem[];
}

/**
 * Read-only summary view of a blueprint (Epoch 8.4 Stage 3).
 * Renders the blueprint as a structured document — no inputs, no mutation
 * controls anywhere in the tree. Used when ?inspect=true or when status is
 * ONGOING / PASSED.
 */
export default function BlueprintInspector({ blueprint, status, availableItems }: BlueprintInspectorProps) {
    const itemById = useMemo(() => {
        const map = new Map<string, AvailableItem>();
        for (const it of availableItems) map.set(it.id, it);
        return map;
    }, [availableItems]);

    const totalRules = blueprint.blocks.reduce((sum, b) => sum + b.rules.length, 0);

    const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
    const [selectedVersion, setSelectedVersion] = useState<VersionResponse | null>(null);
    const [versionLoading, setVersionLoading] = useState(false);
    const [versionError, setVersionError] = useState<string | null>(null);

    // Data-fetch effect: load the latest version of the selected item. The
    // synchronous loading/reset setState calls are inherent to a fetch-with-
    // loading-state, which the set-state-in-effect rule cannot model — scoped
    // disable rather than a contrived workaround.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        if (!selectedItemId) {
            setSelectedVersion(null);
            setVersionError(null);
            return;
        }
        let cancelled = false;
        setVersionLoading(true);
        setVersionError(null);
        api.get<VersionResponse[]>(`learning-objects/${selectedItemId}/versions`)
            .then((res) => {
                if (cancelled) return;
                const latest = (res.data ?? []).reduce<VersionResponse | null>(
                    (acc, v) => (acc === null || v.version_number > acc.version_number ? v : acc),
                    null,
                );
                setSelectedVersion(latest);
            })
            .catch(() => { if (!cancelled) setVersionError('Failed to load question.'); })
            .finally(() => { if (!cancelled) setVersionLoading(false); });
        return () => { cancelled = true; };
    }, [selectedItemId]);
    /* eslint-enable react-hooks/set-state-in-effect */

    return (
        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 space-y-10">
            <header className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                    <BlueprintStatusBadge status={status} />
                    <span className="text-meta text-shell-muted-dim">
                        {blueprint.duration_minutes} min · {pluralizeCount(blueprint.blocks.length, 'section')} · {pluralizeCount(totalRules, 'rule')}
                    </span>
                </div>
                <h1 className="text-h1 font-bold text-foreground">{blueprint.title}</h1>
                {blueprint.description && (
                    <p className="text-body text-shell-muted leading-relaxed">{blueprint.description}</p>
                )}
            </header>

            {blueprint.blocks.length === 0 ? (
                <p className="text-shell-muted-dim italic">This blueprint has no sections.</p>
            ) : (
                <div className="space-y-10">
                    {blueprint.blocks.map((block, idx) => (
                        <section key={idx} className="space-y-4">
                            <div className="flex items-baseline justify-between border-b border-shell-border pb-2">
                                <h2 className="text-h2 font-semibold text-foreground">
                                    {block.title || `Section ${idx + 1}`}
                                </h2>
                                <span className="text-meta text-shell-muted-dim">
                                    Section {idx + 1} · {pluralizeCount(block.rules.length, 'rule')}
                                </span>
                            </div>

                            {block.rules.length === 0 ? (
                                <p className="text-meta text-shell-muted-dim italic">No rules in this section.</p>
                            ) : (
                                <ol className="space-y-3">
                                    {block.rules.map((rule, ruleIdx) => {
                                        if (rule.rule_type === 'FIXED' && rule.learning_object_id) {
                                            const loId = rule.learning_object_id;
                                            const item = itemById.get(loId);
                                            const topic = item?.metadata_tags?.topic;
                                            const tone = topic ? subjectTone(topic) : null;
                                            const isSelected = selectedItemId === loId;
                                            return (
                                                <li key={ruleIdx} className="space-y-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedItemId(isSelected ? null : loId)}
                                                        className={[
                                                            'w-full text-left rounded-xl border px-4 py-3 transition-colors',
                                                            isSelected
                                                                ? 'border-brand/40 bg-brand/5'
                                                                : 'border-shell-border bg-shell-surface hover:border-brand/20 hover:bg-shell-input/30',
                                                        ].join(' ')}
                                                    >
                                                        <div className="flex items-center gap-2 text-eyebrow font-semibold uppercase tracking-wide text-shell-muted-dim mb-1">
                                                            <span>Fixed question</span>
                                                            {topic && tone && (
                                                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-meta normal-case font-medium ${tone.bg} ${tone.fg} ${tone.border}`}>
                                                                    {topic}
                                                                </span>
                                                            )}
                                                            <span className="ml-auto text-xs font-normal normal-case text-brand/70">
                                                                {isSelected ? 'Collapse ↑' : 'Inspect →'}
                                                            </span>
                                                        </div>
                                                        <p className="text-body text-foreground line-clamp-3 leading-snug">
                                                            {item?.latest_content_preview ?? <span className="text-shell-muted-dim italic">Question not found</span>}
                                                        </p>
                                                    </button>

                                                    {isSelected && (
                                                        <div className="mt-2 pl-4 border-l-2 border-brand/20">
                                                            {versionLoading ? (
                                                                <div className="py-6 text-center text-shell-muted-dim text-sm">Loading…</div>
                                                            ) : versionError ? (
                                                                <p className="py-4 text-meta text-[var(--color-danger-fg)]">{versionError}</p>
                                                            ) : selectedVersion ? (
                                                                <QuestionInspector
                                                                    questionType={selectedVersion.question_type}
                                                                    content={selectedVersion.content}
                                                                    options={normaliseOptions(selectedVersion)}
                                                                    metadataTags={item?.metadata_tags ?? null}
                                                                    showCorrectness
                                                                />
                                                            ) : null}
                                                        </div>
                                                    )}
                                                </li>
                                            );
                                        }
                                        // RANDOM
                                        return (
                                            <li
                                                key={ruleIdx}
                                                className="rounded-xl border border-shell-border bg-shell-surface px-4 py-3 space-y-1"
                                            >
                                                <div className="text-eyebrow font-semibold uppercase tracking-wide text-shell-muted-dim">
                                                    Random selection
                                                </div>
                                                <p className="text-body text-foreground">
                                                    Pick <span className="font-semibold">{rule.count ?? 1}</span> {pluralize(rule.count ?? 1, 'question')} from{' '}
                                                    {rule.subject ? <Badge tone="info" size="sm">{rule.subject}</Badge> : null}
                                                    {rule.topic ? <> <Badge tone="info" size="sm">{rule.topic}</Badge></> : null}
                                                    {(!rule.subject && !rule.topic) && <span className="text-shell-muted-dim italic">the entire library</span>}
                                                </p>
                                                {(rule.tags?.length ?? 0) > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                                        {rule.tags!.map((t) => (
                                                            <Badge key={t} tone="neutral" size="sm">{t}</Badge>
                                                        ))}
                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ol>
                            )}
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
