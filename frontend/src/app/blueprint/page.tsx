'use client';

import { useEffect, useState, useCallback } from 'react';
import { useBlueprintStore, TestBlock, SelectionRule } from '@/stores/useBlueprintStore';
import { useExamStore } from '@/stores/useExamStore';
import { useAuthStore } from '@/stores/useAuthStore';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useRouter, useSearchParams } from 'next/navigation';
import QuestionPickerModal from '@/components/blueprint/QuestionPickerModal';

export default function BlueprintPage() {
    const {
        blueprints,
        currentBlueprint,
        availableItems,
        isLoading,
        error,
        validation,
        fetchBlueprints,
        fetchBlueprint,
        fetchAvailableItems,
        saveBlueprint,
        validateBlueprint,
        resetCurrent
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
            fetchBlueprint(idFromUrl);
            setIsEditing(true);
        } else {
            fetchBlueprints();
            setIsEditing(false);
        }
    }, [idFromUrl, fetchBlueprints, fetchBlueprint, fetchAvailableItems]);

    const handleCreateNew = () => {
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

    const saveState = useCallback((patch: Partial<any>) => {
        useBlueprintStore.setState({
            currentBlueprint: { ...useBlueprintStore.getState().currentBlueprint, ...patch } as any
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
        } catch (e) {
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
            <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN', 'STUDENT']}>
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-white">
                    <div className="flex justify-between items-end mb-12">
                        <div>
                            <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-500">
                                Test Blueprints
                            </h1>
                            <p className="mt-2 text-slate-400">Design and manage rule-based exam definitions.</p>
                        </div>
                        <button
                            onClick={handleCreateNew}
                            className="inline-flex items-center px-6 py-3 border border-transparent text-base font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
                        >
                            <span className="mr-2 text-xl">+</span> New Blueprint
                        </button>
                    </div>

                    {isLoading && blueprints.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-24 opacity-50">
                            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p>Loading blueprints...</p>
                        </div>
                    )}
                    {error && <div className="p-4 bg-red-900/20 border border-red-500/50 rounded-xl text-red-400 mb-8">{error}</div>}

                    {!isLoading && blueprints.length === 0 && (
                        <div className="text-center py-20 bg-slate-900/30 rounded-3xl border border-dashed border-slate-800">
                            <p className="text-slate-500 mb-6">No blueprints found. Get started by creating your first one!</p>
                            <button onClick={handleCreateNew} className="text-indigo-400 font-semibold hover:text-indigo-300">
                                Create Blueprint →
                            </button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {blueprints.map(bp => (
                            <div
                                key={bp.id}
                                onClick={() => router.push(`/blueprint?id=${bp.id}`)}
                                className="group relative bg-slate-900/50 hover:bg-slate-800/80 p-6 rounded-3xl border border-white/5 hover:border-white/10 transition-all cursor-pointer backdrop-blur-sm"
                            >
                                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="text-indigo-400 text-sm font-medium">Edit →</span>
                                </div>
                                <h3 className="text-xl font-bold mb-2 pr-12 line-clamp-1">{bp.title}</h3>
                                <p className="text-slate-400 text-sm mb-6 line-clamp-2 min-h-[40px]">{bp.description || 'No description provided.'}</p>

                                <div className="flex items-center justify-between pt-4 border-t border-white/5 text-xs text-slate-500 font-medium tracking-wider uppercase">
                                    <div className="flex items-center gap-4">
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                                            {bp.blocks.length} Sections
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
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
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN', 'STUDENT']}>
            <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-12 text-white">
                <div className="flex gap-8">
                    {/* Main Editor */}
                    <div className="flex-1">
                        <button
                            onClick={() => router.push('/blueprint')}
                            className="group flex items-center text-slate-400 hover:text-white mb-8 transition-colors"
                        >
                            <span className="mr-2 group-hover:-translate-x-1 transition-transform">←</span> Back to Blueprints
                        </button>

                        <div className="bg-slate-900/80 backdrop-blur-xl rounded-[32px] border border-white/10 shadow-2xl overflow-hidden min-h-[700px]">
                            {/* Hero Section */}
                            <div className="p-8 pb-0">
                                <input
                                    type="text"
                                    placeholder="Untitled Blueprint"
                                    value={currentBlueprint?.title || ''}
                                    onChange={(e) => saveState({ title: e.target.value })}
                                    className="w-100 bg-transparent border-none text-white text-4xl font-black placeholder-white/20 focus:ring-0 mb-2 p-0 w-full"
                                />
                                <textarea
                                    placeholder="Decribe the purpose of this test (optional)..."
                                    value={currentBlueprint?.description || ''}
                                    onChange={(e) => saveState({ description: e.target.value })}
                                    rows={1}
                                    className="w-100 bg-transparent border-none text-slate-400 text-lg placeholder-white/10 focus:ring-0 mb-8 p-0 resize-none w-full"
                                />

                                {/* Config Bar */}
                                <div className="flex flex-wrap items-center gap-6 p-6 bg-white/5 rounded-2xl mb-12">
                                    <div className="flex-1 min-w-[150px]">
                                        <label className="block text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2">Manual Duration</label>
                                        <div className="flex items-center">
                                            <input
                                                type="number"
                                                value={currentBlueprint?.duration_minutes || 60}
                                                onChange={(e) => saveState({ duration_minutes: parseInt(e.target.value) || 0 })}
                                                className="bg-black/20 border border-white/10 rounded-lg py-2 px-3 text-white focus:outline-none focus:border-indigo-500/50 w-24"
                                            />
                                            <span className="ml-3 text-slate-400 text-sm font-medium">minutes</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => saveState({ shuffle_questions: !currentBlueprint?.shuffle_questions })}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${currentBlueprint?.shuffle_questions ? 'bg-indigo-600' : 'bg-slate-700'}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${currentBlueprint?.shuffle_questions ? 'translate-x-6' : 'translate-x-1'}`} />
                                        </button>
                                        <span className="text-sm font-semibold text-slate-300">Shuffle Questions</span>
                                    </div>
                                </div>
                            </div>

                            {/* Content Area */}
                            <div className="p-8 pt-0">
                                <div className="space-y-12">
                                    {(currentBlueprint?.blocks || []).map((block, bIdx) => (
                                        <div key={bIdx} className="relative">
                                            <div className="absolute -left-4 top-0 bottom-0 w-1 bg-indigo-500/20 rounded-full"></div>
                                            <div className="flex justify-between items-center mb-6">
                                                <input
                                                    value={block.title}
                                                    onChange={(e) => {
                                                        const newBlocks = [...currentBlueprint!.blocks!];
                                                        newBlocks[bIdx].title = e.target.value;
                                                        saveState({ blocks: newBlocks });
                                                    }}
                                                    className="bg-transparent border-none text-xl font-bold text-white focus:ring-0 p-0"
                                                />
                                                <button
                                                    onClick={() => {
                                                        const newBlocks = [...currentBlueprint!.blocks!];
                                                        newBlocks.splice(bIdx, 1);
                                                        saveState({ blocks: newBlocks });
                                                    }}
                                                    className="text-slate-600 hover:text-red-400 text-sm font-medium transition-colors"
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
                                                    <div className="h-full min-h-[60px] border-2 border-dashed border-white/10 rounded-2xl flex items-center justify-center text-slate-500 text-xs font-semibold uppercase tracking-widest bg-white/[0.01]">
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
                                                            className={`group flex flex-col gap-4 bg-white/[0.03] hover:bg-white/[0.05] border border-white/5 rounded-2xl p-4 transition-all relative cursor-move
                                                                    ${isDragOver ? 'border-t-2 border-t-indigo-500 bg-indigo-500/10 scale-[1.02]' : ''}`}
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className="text-slate-500 cursor-grab hover:text-white">
                                                                    &#x2630;
                                                                </div>
                                                                <div className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-tight ${rule.rule_type === 'FIXED' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                                                                    {rule.rule_type === 'FIXED' ? 'Fixed Item' : 'Smart Draw'}
                                                                </div>

                                                                {rule.rule_type === 'FIXED' ? (
                                                                    <div className="flex-1 flex items-center justify-between gap-4">
                                                                        <div className="text-sm font-medium text-slate-200 truncate">
                                                                            {rule.learning_object_id ? getItemPreview(rule.learning_object_id) : <span className="text-slate-600">No question selected</span>}
                                                                        </div>
                                                                        <button
                                                                            onClick={() => setPickerOpen({ blockIdx: bIdx, ruleIdx: rIdx })}
                                                                            className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-bold rounded-lg transition-colors border border-blue-500/20"
                                                                        >
                                                                            {rule.learning_object_id ? 'Change' : 'Select'}
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <div className="flex-1 flex flex-wrap items-center gap-4">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Quantity:</span>
                                                                            <input
                                                                                type="number"
                                                                                value={rule.count}
                                                                                onChange={(e) => {
                                                                                    const newBlocks = [...currentBlueprint!.blocks!];
                                                                                    newBlocks[bIdx].rules[rIdx].count = parseInt(e.target.value) || 1;
                                                                                    saveState({ blocks: newBlocks });
                                                                                }}
                                                                                className="w-12 bg-black/40 border border-white/10 rounded-lg py-1 px-1 text-sm text-center focus:outline-none"
                                                                            />
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Topic:</span>
                                                                            <input
                                                                                placeholder="Any Topic"
                                                                                value={rule.topic || ''}
                                                                                onChange={(e) => {
                                                                                    const newBlocks = [...currentBlueprint!.blocks!];
                                                                                    newBlocks[bIdx].rules[rIdx].topic = e.target.value;
                                                                                    saveState({ blocks: newBlocks });
                                                                                }}
                                                                                className="w-32 bg-black/40 border border-white/10 rounded-lg py-1 px-2 text-sm focus:outline-none"
                                                                            />
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">Difficulty:</span>
                                                                            <select
                                                                                value={rule.difficulty || ''}
                                                                                onChange={(e) => {
                                                                                    const newBlocks = [...currentBlueprint!.blocks!];
                                                                                    newBlocks[bIdx].rules[rIdx].difficulty = e.target.value ? parseInt(e.target.value) : undefined;
                                                                                    saveState({ blocks: newBlocks });
                                                                                }}
                                                                                className="bg-black/40 border border-white/10 rounded-lg py-1 px-2 text-sm focus:outline-none appearance-none"
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
                                                                    className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-400 transition-all ml-auto"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>

                                            <div className="mt-6 flex gap-3">
                                                <button
                                                    onClick={() => handleAddRule(bIdx, 'FIXED')}
                                                    className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-bold rounded-xl transition-all border border-blue-500/10 flex items-center"
                                                >
                                                    <span className="mr-2 text-base">+</span> Specific Item
                                                </button>
                                                <button
                                                    onClick={() => handleAddRule(bIdx, 'RANDOM')}
                                                    className="px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-xs font-bold rounded-xl transition-all border border-purple-500/10 flex items-center"
                                                >
                                                    <span className="mr-2 text-base">+</span> Smart Rule
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <button
                                    onClick={handleAddBlock}
                                    className="w-full mt-12 py-10 border-2 border-dashed border-white/5 rounded-3xl text-slate-600 hover:text-slate-400 hover:border-white/10 hover:bg-white/[0.01] transition-all flex flex-col items-center justify-center gap-2"
                                >
                                    <span className="text-3xl">+</span>
                                    <span className="text-sm font-bold uppercase tracking-widest">Add New Section</span>
                                </button>
                            </div>

                            {/* Sticky Footer */}
                            <div className="sticky bottom-0 bg-slate-900/90 backdrop-blur-xl border-t border-white/10 p-6 px-8 flex justify-between items-center z-10">
                                <div className="flex items-center gap-4">
                                    {validation && (
                                        <div className={`flex items-center gap-2 text-sm font-bold ${validation.valid ? 'text-green-400' : 'text-amber-400 underline decoration-amber-400/30 cursor-help'}`}>
                                            {validation.valid ? '✓ Ready to Publish' : '✕ Rules Incomplete'}
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-4">
                                    {idFromUrl && (
                                        <>
                                            <button
                                                onClick={handleStartPreview}
                                                disabled={isStarting}
                                                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20"
                                            >
                                                {isStarting ? 'Loading...' : '🚀 Test Session'}
                                            </button>
                                            <button
                                                onClick={() => validateBlueprint(idFromUrl)}
                                                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-xl transition-all border border-white/5"
                                            >
                                                Validate
                                            </button>
                                        </>
                                    )}
                                    <button
                                        onClick={handleSave}
                                        className="px-10 py-2.5 bg-green-500 hover:bg-green-400 text-slate-950 text-sm font-black rounded-xl transition-all shadow-lg shadow-green-500/20"
                                    >
                                        Publish Blueprint
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Breakdown Sidebar */}
                    <div className="w-80 space-y-6">
                        <div className="bg-slate-900/50 backdrop-blur-md rounded-[32px] border border-white/10 p-6 sticky top-12">
                            <h4 className="text-xs font-black uppercase tracking-widest text-indigo-400 mb-6 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                                Live Breakdown
                            </h4>

                            <div className="space-y-8">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="bg-white/5 rounded-2xl p-4">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Items</div>
                                        <div className="text-2xl font-black">{stats.totalCount}</div>
                                    </div>
                                    <div className="bg-white/5 rounded-2xl p-4">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Points</div>
                                        <div className="text-2xl font-black">{stats.totalPoints}</div>
                                    </div>
                                    <div className="bg-white/5 rounded-2xl p-4">
                                        <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">Time</div>
                                        <div className="text-2xl font-black">{stats.totalTime}m</div>
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-4">Topic Coverage</label>
                                    <div className="space-y-3">
                                        {Object.entries(stats.topics).length > 0 ? (
                                            Object.entries(stats.topics).map(([topic, count]) => (
                                                <div key={topic} className="space-y-1">
                                                    <div className="flex justify-between text-xs font-semibold">
                                                        <span className="text-slate-300">{topic}</span>
                                                        <span className="text-indigo-400">{Math.round((count / stats.totalCount) * 100)}%</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                                        <div
                                                            className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                                                            style={{ width: `${(count / (stats.totalCount || 1)) * 100}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-xs text-slate-600 italic">No topics selected yet.</p>
                                        )}
                                    </div>
                                </div>

                                <div className="pt-6 border-t border-white/5">
                                    <div className="flex items-center justify-between p-4 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
                                        <div className="text-[10px] font-bold text-indigo-300 uppercase">Complexity</div>
                                        <div className="text-lg font-black text-white">Dynamic</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {validation && !validation.valid && (
                            <div className="bg-red-900/10 border border-red-500/20 rounded-[32px] p-6">
                                <h4 className="text-xs font-black uppercase tracking-widest text-red-400 mb-4">Issues</h4>
                                <div className="space-y-3">
                                    {validation.blocks.flatMap(b => b.rule_validation).filter(r => !r.valid).slice(0, 3).map((r, i) => (
                                        <div key={i} className="text-[11px] text-red-400/80 bg-red-500/5 p-3 rounded-xl border border-red-500/10">
                                            {r.reason}
                                        </div>
                                    ))}
                                    {validation.blocks.flatMap(b => b.rule_validation).filter(r => !r.valid).length > 3 && (
                                        <p className="text-[10px] text-center text-slate-500">+{validation.blocks.flatMap(b => b.rule_validation).filter(r => !r.valid).length - 3} more issues below</p>
                                    )}
                                </div>
                            </div>
                        )}
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
