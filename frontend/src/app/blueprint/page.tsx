'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { DEFAULT_SCORING_CONFIG, useBlueprintStore, SelectionRule, TestDefinition } from '@/stores/useBlueprintStore';
import { useExamStore } from '@/stores/useExamStore';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useRouter, useSearchParams } from 'next/navigation';
import QuestionPickerModal from '@/components/blueprint/QuestionPickerModal';
import BlueprintSaveIndicator from '@/components/blueprint/BlueprintSaveIndicator';
import { Badge, Button, useToast } from '@/components/ui';

type BlueprintDraft = Partial<TestDefinition>;

export default function BlueprintPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-shell-bg" />}>
            <BlueprintPageInner />
        </Suspense>
    );
}

function BlueprintPageInner() {
    const {
        blueprints,
        currentBlueprint,
        availableItems,
        isLoading,
        error,
        fetchBlueprints,
        fetchBlueprint,
        fetchAvailableItems,
        saveBlueprint,
        resetCurrent,
        lastEditingId,
        setLastEditingId,
    } = useBlueprintStore();

    const { instantiateSession } = useExamStore();
    const router = useRouter();
    const searchParams = useSearchParams();
    const idFromUrl = searchParams.get('id');

    const [isEditing, setIsEditing] = useState(false);
    const [isStarting, setIsStarting] = useState(false);
    const [pickerOpen, setPickerOpen] = useState<{ blockIdx: number, ruleIdx: number } | null>(null);
    const [draggedItem, setDraggedItem] = useState<{ blockIdx: number, ruleIdx: number } | null>(null);
    const [dragOverItem, setDragOverItem] = useState<{ blockIdx: number, ruleIdx: number } | null>(null);

    useEffect(() => {
        fetchAvailableItems();
        if (idFromUrl) {
            setLastEditingId(idFromUrl);
            fetchBlueprint(idFromUrl);
            setIsEditing(true);
        } else if (lastEditingId) {
            router.replace(`/blueprint?id=${lastEditingId}`);
        } else {
            fetchBlueprints();
            setIsEditing(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idFromUrl]); // only re-run when URL id changes

    const handleCreateNew = () => {
        setLastEditingId(null);
        resetCurrent();
        setIsEditing(true);
        router.push('/blueprint');
    };

    const handleAddBlock = () => {
        if (!currentBlueprint) return;
        const newBlocks = [...(currentBlueprint.blocks || []), { title: 'New Section', rules: [] }];
        saveState({ blocks: newBlocks });
    };

    const handleAddRule = (blockIndex: number, type: 'FIXED' | 'RANDOM') => {
        if (!currentBlueprint || !currentBlueprint.blocks) return;
        const newBlocks = [...currentBlueprint.blocks];

        if (type === 'FIXED') {
            setPickerOpen({ blockIdx: blockIndex, ruleIdx: -1 });
            return;
        }

        const newRule: SelectionRule = { rule_type: 'RANDOM', count: 1, tags: [] };
        newBlocks[blockIndex].rules.push(newRule);
        saveState({ blocks: newBlocks });
    };

    const saveState = useCallback((patch: BlueprintDraft) => {
        const existingBlueprint = useBlueprintStore.getState().currentBlueprint ?? {};
        useBlueprintStore.setState({
            currentBlueprint: { ...existingBlueprint, ...patch }
        });
    }, []);

    const handleDragStart = (e: React.DragEvent, blockIdx: number, ruleIdx: number) => {
        setDraggedItem({ blockIdx, ruleIdx });
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
            if (e.target instanceof HTMLElement) e.target.style.opacity = '0.5';
        }, 0);
    };

    const handleDragEnter = (e: React.DragEvent, blockIdx: number, ruleIdx: number) => {
        e.preventDefault();
        setDragOverItem({ blockIdx, ruleIdx });
    };

    const handleDragEnd = (e: React.DragEvent) => {
        if (e.target instanceof HTMLElement) e.target.style.opacity = '1';
        setDraggedItem(null);
        setDragOverItem(null);
    };

    const handleDrop = (e: React.DragEvent, targetBlockIdx: number, targetRuleIdx: number) => {
        e.preventDefault();
        if (!currentBlueprint?.blocks || !draggedItem) return;

        // Clone deeply enough for our operation to avoid strict mode double issues
        const newBlocks = currentBlueprint.blocks.map(b => ({ ...b, rules: [...b.rules] }));

        const sourceBlockIdx = draggedItem.blockIdx;
        const sourceRuleIdx = draggedItem.ruleIdx;

        // Remove from original position
        const [movedRule] = newBlocks[sourceBlockIdx].rules.splice(sourceRuleIdx, 1);

        // Insert at new position
        newBlocks[targetBlockIdx].rules.splice(targetRuleIdx, 0, movedRule);

        saveState({ blocks: newBlocks });
        setDraggedItem(null);
        setDragOverItem(null);
    };

    const handleSave = async () => {
        if (!currentBlueprint) return;
        try {
            const id = await saveBlueprint(currentBlueprint);
            if (!idFromUrl) {
                router.push(`/blueprint?id=${id}`);
            }
        } catch {
            // Error handled by store
        }
    };

    const handleStartPreview = async () => {
        if (!idFromUrl) return;
        setIsStarting(true);
        try {
            const sessionId = await instantiateSession(idFromUrl);
            router.push(`/exam/${sessionId}`);
        } catch (err) {
            console.error(err);
        } finally {
            setIsStarting(false);
        }
    };

    const getItemPreview = (id: string) => {
        const item = availableItems.find(i => i.id === id);
        return item ? item.latest_content_preview : 'Select a question...';
    };

    const scoringConfig = currentBlueprint?.scoring_config ?? DEFAULT_SCORING_CONFIG;

    // --- Stats Calculation ---
    const stats = (() => {
        if (!currentBlueprint || !currentBlueprint.blocks) return { totalCount: 0, totalTime: 0, totalPoints: 0, topics: {} as Record<string, number> };
        let totalCount = 0;
        let totalTime = 0;
        let totalPoints = 0;
        const topics: Record<string, number> = {};

        currentBlueprint.blocks.forEach(block => {
            block.rules.forEach(rule => {
                if (rule.rule_type === 'FIXED') {
                    totalCount += 1;
                    const item = availableItems.find(i => i.id === rule.learning_object_id);
                    totalTime += item?.metadata_tags?.estimated_time_mins || 2;
                    totalPoints += item?.metadata_tags?.points || 1;
                } else {
                    totalCount += rule.count || 0;
                    totalTime += (rule.count || 0) * 3; // Estimated 3 mins for random
                    totalPoints += (rule.count || 0) * 1; // Default 1 point for random
                    if (rule.topic) {
                        topics[rule.topic] = (topics[rule.topic] || 0) + (rule.count || 0);
                    }
                }
            });
        });

        return { totalCount, totalTime, totalPoints, topics };
    })();

    if (!isEditing) {
        return (
            <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-foreground">
                    <div className="flex justify-between items-end mb-12">
                        <div>
                            <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
                                Test Blueprints
                            </h1>
                            <p className="mt-2 text-shell-muted-dim">Design and manage rule-based exam definitions.</p>
                        </div>
                        <Button variant="primary" size="lg" onClick={handleCreateNew}>
                            <span className="mr-2 text-xl">+</span> New Blueprint
                        </Button>
                    </div>

                    {isLoading && blueprints.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-24 text-shell-muted-dim">
                            <div className="w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p>Loading blueprints...</p>
                        </div>
                    )}
                    {error && (
                        <div className="p-4 rounded-xl border border-[var(--color-danger-border)] bg-[var(--color-danger-bg)] text-[var(--color-danger-fg)] mb-8">
                            {error}
                        </div>
                    )}

                    {!isLoading && blueprints.length === 0 && (
                        <div className="text-center py-20 bg-shell-surface/30 rounded-3xl border border-dashed border-shell-border">
                            <p className="text-shell-muted-dim mb-6">No blueprints found. Get started by creating your first one!</p>
                            <button onClick={handleCreateNew} className="text-brand font-semibold hover:underline">
                                Create Blueprint →
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {blueprints.map(bp => (
                            <div
                                key={bp.id}
                                onClick={() => router.push(`/blueprint?id=${bp.id}`)}
                                className="group relative bg-shell-surface/50 hover:bg-shell-input/80 p-6 rounded-3xl border border-shell-border hover:border-shell-border-deep transition-all cursor-pointer backdrop-blur-sm"
                            >
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-brand text-sm font-medium">Edit →</span>
                                </div>
                                <h3 className="text-xl font-bold mb-2 pr-12 line-clamp-1 text-foreground">{bp.title}</h3>
                                <p className="text-shell-muted-dim text-sm mb-6 line-clamp-2 min-h-[40px]">{bp.description || 'No description provided.'}</p>

                                <div className="flex items-center justify-between pt-4 border-t border-shell-border text-xs text-shell-muted-dim font-medium tracking-wider uppercase">
                                    <div className="flex items-center gap-4">
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-info"></span>
                                            {bp.blocks.length} Sections
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-brand"></span>
                                            {bp.duration_minutes} min
                                        </span>
                                    </div>
                                    <span>{new Date(bp.updated_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </ProtectedRoute>
        );
    }

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="max-w-page mx-auto px-4 py-12 text-foreground sm:px-6 lg:px-8">
                <div className="flex gap-8">
                    {/* Main Editor */}
                    <div className="min-w-0 flex-1">
                        <button
                            onClick={() => {
                                setLastEditingId(null);
                                router.push('/blueprint');
                            }}
                            className="group flex items-center text-shell-muted-dim hover:text-foreground mb-8 transition-colors"
                        >
                            <span className="mr-2 group-hover:-translate-x-1 transition-transform">←</span> All Blueprints
                        </button>

                        <div className="min-h-blueprint-canvas overflow-hidden rounded-card-lg border border-shell-border bg-shell-surface/80 shadow-2xl backdrop-blur-xl">
                            {/* Hero Section */}
                            <div className="p-8 pb-0">
                                <input
                                    type="text"
                                    placeholder="Untitled Blueprint"
                                    value={currentBlueprint?.title || ''}
                                    onChange={(e) => saveState({ title: e.target.value })}
                                    className="w-full bg-transparent border-none text-foreground text-4xl font-black placeholder:text-shell-muted-dim focus:ring-0 mb-2 p-0"
                                />
                                <textarea
                                    placeholder="Describe the purpose of this test (optional)..."
                                    value={currentBlueprint?.description || ''}
                                    onChange={(e) => saveState({ description: e.target.value })}
                                    rows={1}
                                    className="w-full bg-transparent border-none text-shell-muted-dim text-lg placeholder:text-shell-muted-dim focus:ring-0 mb-8 p-0 resize-none"
                                />

                                {/* Config Bar */}
                                <div className="flex flex-wrap items-center gap-6 p-6 bg-shell-input/40 rounded-2xl mb-12">
                                    <div className="flex-1 min-w-[150px]">
                                        <label className="mb-2 block text-eyebrow-sm font-bold uppercase tracking-widest text-brand">Duration (minutes)</label>
                                        <div className="flex items-center">
                                            <input
                                                type="number"
                                                value={currentBlueprint?.duration_minutes ?? ''}
                                                onChange={(e) => saveState({
                                                    duration_minutes: e.target.value === '' ? undefined : parseInt(e.target.value, 10)
                                                })}
                                                className="bg-shell-input border border-shell-border rounded-lg py-2 px-3 text-foreground focus:outline-none focus:border-brand w-24 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                            <span className="ml-3 text-shell-muted-dim text-sm font-medium">minutes</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => saveState({ shuffle_questions: !currentBlueprint?.shuffle_questions })}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${currentBlueprint?.shuffle_questions ? 'bg-brand' : 'bg-shell-input-alt'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-shell-bg transition-transform ${currentBlueprint?.shuffle_questions ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                        <span className="text-sm font-semibold text-shell-muted">Shuffle Questions</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => saveState({
                                                scoring_config: {
                                                    ...scoringConfig,
                                                    shuffle_options: !scoringConfig.shuffle_options,
                                                },
                                            })}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${scoringConfig.shuffle_options ? 'bg-brand' : 'bg-shell-input-alt'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-shell-bg transition-transform ${scoringConfig.shuffle_options ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                        <span className="text-sm font-semibold text-shell-muted">Shuffle Answer Order</span>
                                    </div>
                                </div>
                            </div>

                            {/* Content Area */}
                            <div className="p-8 pt-0">
                                <div className="space-y-12">
                                    {(currentBlueprint?.blocks || []).map((block, bIdx) => (
                                        <div key={bIdx} className="relative">
                                            <div className="absolute -left-4 top-0 bottom-0 w-1 bg-brand/20 rounded-full"></div>
                                            <div className="flex justify-between items-center mb-6">
                                                <input
                                                    value={block.title}
                                                    onChange={(e) => {
                                                        const newBlocks = [...currentBlueprint!.blocks!];
                                                        newBlocks[bIdx].title = e.target.value;
                                                        saveState({ blocks: newBlocks });
                                                    }}
                                                    className="bg-transparent border-none text-xl font-bold text-foreground focus:ring-0 p-0"
                                                />
                                                <button
                                                    onClick={() => {
                                                        const newBlocks = [...currentBlueprint!.blocks!];
                                                        newBlocks.splice(bIdx, 1);
                                                        saveState({ blocks: newBlocks });
                                                    }}
                                                    className="text-shell-muted hover:text-danger text-sm font-medium transition-colors"
                                                >
                                                    Remove Section
                                                </button>
                                            </div>

                                            <div
                                                className="grid gap-3 min-h-[60px]"
                                                onDragOver={(e) => e.preventDefault()}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    // Allow dropping at the end of an empty block
                                                    if (block.rules.length === 0 && draggedItem) {
                                                        handleDrop(e, bIdx, 0);
                                                    }
                                                }}
                                            >
                                                {block.rules.length === 0 && (
                                                    <div className="h-full min-h-[60px] border-2 border-dashed border-shell-border rounded-2xl flex items-center justify-center text-shell-muted-dim text-xs font-semibold uppercase tracking-widest bg-shell-input/30">
                                                        Empty Section
                                                    </div>
                                                )}
                                                {block.rules.map((rule, rIdx) => {
                                                    const isDragOver = dragOverItem?.blockIdx === bIdx && dragOverItem?.ruleIdx === rIdx;
                                                    return (
                                                        <div
                                                            key={rIdx}
                                                            draggable
                                                            onDragStart={(e) => handleDragStart(e, bIdx, rIdx)}
                                                            onDragEnter={(e) => handleDragEnter(e, bIdx, rIdx)}
                                                            onDragEnd={handleDragEnd}
                                                            onDragOver={(e) => e.preventDefault()}
                                                            onDrop={(e) => handleDrop(e, bIdx, rIdx)}
                                                            className={`group flex flex-col gap-4 bg-shell-input/30 hover:bg-shell-input/60 border border-shell-border rounded-2xl p-4 transition-all relative cursor-move
                                                                    ${isDragOver ? 'border-t-2 border-t-brand bg-brand/10 scale-[1.02]' : ''}`}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className="text-shell-muted-dim cursor-grab hover:text-foreground">
                                                                    &#x2630;
                                                                </div>
                                                                <Badge tone={rule.rule_type === 'FIXED' ? 'info' : 'accent'} size="sm">
                                                                    {rule.rule_type === 'FIXED' ? 'Fixed Item' : 'Smart Draw'}
                                                                </Badge>

                                                                {rule.rule_type === 'FIXED' ? (
                                                                    <div className="flex-1 flex items-center justify-between gap-4">
                                                                        <div className="text-sm font-medium text-foreground truncate">
                                                                            {rule.learning_object_id ? getItemPreview(rule.learning_object_id) : <span className="text-shell-muted">No question selected</span>}
                                                                        </div>
                                                                        <Button
                                                                            variant="secondary"
                                                                            size="sm"
                                                                            onClick={() => setPickerOpen({ blockIdx: bIdx, ruleIdx: rIdx })}
                                                                        >
                                                                            {rule.learning_object_id ? 'Change' : 'Select'}
                                                                        </Button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex-1 flex flex-wrap items-center gap-4">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-eyebrow font-bold uppercase tracking-tight text-shell-muted-dim">Quantity:</span>
                                                                            <input
                                                                                type="number"
                                                                                value={rule.count ?? ''}
                                                                                onChange={(e) => {
                                                                                    const newBlocks = [...currentBlueprint!.blocks!];
                                                                                    newBlocks[bIdx].rules[rIdx].count = e.target.value === ''
                                                                                        ? undefined
                                                                                        : parseInt(e.target.value, 10);
                                                                                    saveState({ blocks: newBlocks });
                                                                                }}
                                                                                className="w-12 bg-shell-input border border-shell-border text-foreground rounded-lg py-1 px-1 text-sm text-center focus:outline-none focus:border-brand [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                                            />
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-eyebrow font-bold uppercase tracking-tight text-shell-muted-dim">Topic:</span>
                                                                            <input
                                                                                placeholder="Any Topic"
                                                                                value={rule.topic || ''}
                                                                                onChange={(e) => {
                                                                                    const newBlocks = [...currentBlueprint!.blocks!];
                                                                                    newBlocks[bIdx].rules[rIdx].topic = e.target.value;
                                                                                    saveState({ blocks: newBlocks });
                                                                                }}
                                                                                className="w-32 bg-shell-input border border-shell-border text-foreground placeholder:text-shell-muted-dim rounded-lg py-1 px-2 text-sm focus:outline-none focus:border-brand"
                                                                            />
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-eyebrow font-bold uppercase tracking-tight text-shell-muted-dim">Difficulty:</span>
                                                                            <select
                                                                                value={rule.difficulty || ''}
                                                                                onChange={(e) => {
                                                                                    const newBlocks = [...currentBlueprint!.blocks!];
                                                                                    newBlocks[bIdx].rules[rIdx].difficulty = e.target.value ? parseInt(e.target.value) : undefined;
                                                                                    saveState({ blocks: newBlocks });
                                                                                }}
                                                                                className="bg-shell-input border border-shell-border text-foreground rounded-lg py-1 px-2 text-sm focus:outline-none focus:border-brand appearance-none"
                                                                            >
                                                                                <option value="">Any</option>
                                                                                {[1, 2, 3, 4, 5].map(d => (
                                                                                    <option key={d} value={d}>Level {d}</option>
                                                                                ))}
                                                                            </select>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                <button
                                                                    onClick={() => {
                                                                        const newBlocks = [...currentBlueprint!.blocks!];
                                                                        newBlocks[bIdx].rules.splice(rIdx, 1);
                                                                        saveState({ blocks: newBlocks });
                                                                    }}
                                                                    className="opacity-0 group-hover:opacity-100 p-2 text-shell-muted hover:text-danger transition-all ml-auto"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>

                                            <div className="mt-6 flex gap-3">
                                                <Button
                                                    variant="secondary"
                                                    size="sm"
                                                    onClick={() => handleAddRule(bIdx, 'FIXED')}
                                                >
                                                    <span className="mr-1.5">+</span> Specific Item
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleAddRule(bIdx, 'RANDOM')}
                                                >
                                                    <span className="mr-1.5">+</span> Smart Rule
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    onClick={handleAddBlock}
                                    className="w-full mt-12 py-10 border-2 border-dashed border-shell-border rounded-3xl text-shell-muted hover:text-foreground hover:border-shell-border-deep hover:bg-shell-input/30 transition-all flex flex-col items-center justify-center gap-2"
                                >
                                    <span className="text-3xl">+</span>
                                    <span className="text-sm font-bold uppercase tracking-widest">Add New Section</span>
                                </button>
                            </div>

                            {/* Sticky Footer */}
                            <div className="sticky bottom-0 bg-shell-surface/90 backdrop-blur-xl border-t border-shell-border p-6 px-8 flex justify-between items-center z-10">
                                <div className="flex items-center gap-4">
                                    <BlueprintSaveIndicator />
                                </div>
                                <div className="flex gap-4">
                                    {idFromUrl && (
                                        <Button
                                            variant="secondary"
                                            size="lg"
                                            onClick={handleStartPreview}
                                            disabled={isStarting}
                                            loading={isStarting}
                                        >
                                            {isStarting ? 'Loading...' : 'Practice Blueprint'}
                                        </Button>
                                    )}
                                    <Button
                                        variant="success"
                                        size="lg"
                                        onClick={handleSave}
                                    >
                                        Publish Blueprint
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Breakdown Sidebar — hidden below 1400px to prevent horizontal scroll */}
                    <div className="hidden 2xl:block w-80 shrink-0 space-y-6">
                        <div className="sticky top-12 rounded-card-lg border border-shell-border bg-shell-surface/50 p-6 backdrop-blur-md">
                            <h4 className="text-xs font-black uppercase tracking-widest text-brand mb-6 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-brand animate-pulse"></span>
                                Live Breakdown
                            </h4>

                            <div className="space-y-8">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-shell-input/50 rounded-2xl p-4">
                                        <div className="mb-1 text-eyebrow-sm font-bold uppercase text-shell-muted-dim">Items</div>
                                        <div className="text-2xl font-black text-foreground">{stats.totalCount}</div>
                                    </div>
                                    <div className="bg-shell-input/50 rounded-2xl p-4">
                                        <div className="mb-1 text-eyebrow-sm font-bold uppercase text-shell-muted-dim">Points</div>
                                        <div className="text-2xl font-black text-foreground">{stats.totalPoints}</div>
                                    </div>
                                    <div className="bg-shell-input/50 rounded-2xl p-4">
                                        <div className="mb-1 text-eyebrow-sm font-bold uppercase text-shell-muted-dim">Time</div>
                                        <div className="text-2xl font-black text-foreground">{stats.totalTime}m</div>
                                    </div>
                                </div>

                                <div>
                                    <label className="mb-4 block text-eyebrow-sm font-bold uppercase tracking-widest text-shell-muted-dim">Topic Coverage</label>
                                    <div className="space-y-3">
                                        {Object.entries(stats.topics).length > 0 ? (
                                            Object.entries(stats.topics).map(([topic, count]) => (
                                                <div key={topic} className="space-y-1">
                                                    <div className="flex justify-between text-xs font-semibold">
                                                        <span className="text-shell-muted">{topic}</span>
                                                        <span className="text-brand">{Math.round((count / stats.totalCount) * 100)}%</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-shell-input rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-brand rounded-full transition-all duration-500"
                                                            style={{ width: `${(count / (stats.totalCount || 1)) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-xs text-shell-muted italic">No topics selected yet.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-shell-border">
                                    <div className="flex items-center justify-between p-4 bg-brand/10 rounded-2xl border border-brand/20">
                                        <div className="text-eyebrow-sm font-bold uppercase text-brand">Cognitive level</div>
                                        <div className="text-lg font-black text-foreground">Dynamic</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Question Picker */}
                <QuestionPickerModal
                    isOpen={!!pickerOpen}
                    excludeIds={currentBlueprint?.blocks?.flatMap(b => b.rules.filter(r => r.rule_type === 'FIXED' && r.learning_object_id).map(r => r.learning_object_id!)) || []}
                    onClose={() => setPickerOpen(null)}
                    onSelect={(item) => {
                        if (pickerOpen && currentBlueprint?.blocks) {
                            const newBlocks = [...currentBlueprint.blocks];
                            if (pickerOpen.ruleIdx === -1) {
                                newBlocks[pickerOpen.blockIdx].rules.push({ rule_type: 'FIXED', learning_object_id: item.id });
                            } else {
                                newBlocks[pickerOpen.blockIdx].rules[pickerOpen.ruleIdx].learning_object_id = item.id;
                            }
                            saveState({ blocks: newBlocks });
                            setPickerOpen(null);
                        }
                    }}
                />
            </div>
        </ProtectedRoute>
    );
}
