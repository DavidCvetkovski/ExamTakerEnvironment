'use client';

import { useMemo } from 'react';
import type { TestDefinition, AvailableItem } from '@/stores/useBlueprintStore';
import { Badge } from '@/components/ui';
import BlueprintStatusBadge from '@/components/blueprint/BlueprintStatusBadge';
import { subjectTone } from '@/lib/subjectColor';
import type { BlueprintStatus } from '@/lib/blueprintPermissions';
import { pluralize, pluralizeCount } from '@/lib/pluralize';

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
                                            const item = itemById.get(rule.learning_object_id);
                                            const topic = item?.metadata_tags?.topic;
                                            const tone = topic ? subjectTone(topic) : null;
                                            return (
                                                <li
                                                    key={ruleIdx}
                                                    className="rounded-xl border border-shell-border bg-shell-surface px-4 py-3"
                                                >
                                                    <div className="flex items-center gap-2 text-eyebrow font-semibold uppercase tracking-wide text-shell-muted-dim mb-1">
                                                        <span>Fixed question</span>
                                                        {topic && tone && (
                                                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-meta normal-case font-medium ${tone.bg} ${tone.fg} ${tone.border}`}>
                                                                {topic}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-body text-foreground line-clamp-3 leading-snug">
                                                        {item?.latest_content_preview ?? <span className="text-shell-muted-dim italic">Question not found</span>}
                                                    </p>
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
