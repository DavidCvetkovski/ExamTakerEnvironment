'use client';

import { useEffect, useState } from 'react';
import { useBlueprintStore, TestBlock, SelectionRule } from '@/stores/useBlueprintStore';
import { useExamStore } from '@/stores/useExamStore';
import { useAuthStore } from '@/stores/useAuthStore';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useRouter, useSearchParams } from 'next/navigation';

export default function BlueprintPage() {
    const {
        blueprints,
        currentBlueprint,
        isLoading,
        error,
        validation,
        fetchBlueprints,
        fetchBlueprint,
        saveBlueprint,
        validateBlueprint,
        resetCurrent
    } = useBlueprintStore();

    const { user, logout } = useAuthStore();
    const { instantiateSession } = useExamStore();
    const router = useRouter();
    const searchParams = useSearchParams();
    const idFromUrl = searchParams.get('id');

    const [isEditing, setIsEditing] = useState(false);
    const [isStarting, setIsStarting] = useState(false);

    useEffect(() => {
        if (idFromUrl) {
            fetchBlueprint(idFromUrl);
            setIsEditing(true);
        } else {
            fetchBlueprints();
            setIsEditing(false);
        }
    }, [idFromUrl, fetchBlueprints, fetchBlueprint]);

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
        const newRule: SelectionRule = type === 'FIXED'
            ? { rule_type: 'FIXED', learning_object_id: '' }
            : { rule_type: 'RANDOM', count: 1, tags: [] };

        newBlocks[blockIndex].rules.push(newRule);
        saveState({ blocks: newBlocks });
    };

    const saveState = (patch: Partial<any>) => {
        // Local update to currentBlueprint for immediate UI feedback
        // In a real app, you might want a separate local state before saving
        useBlueprintStore.setState({
            currentBlueprint: { ...currentBlueprint, ...patch }
        });
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

    if (!isEditing) {
        return (
            <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
                <div style={{ maxWidth: 1000, margin: '40px auto', padding: '0 20px', color: '#fff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
                        <h1>📋 Test Blueprints</h1>
                        <button
                            onClick={handleCreateNew}
                            style={{ padding: '10px 20px', background: '#667eea', border: 'none', borderRadius: 6, color: '#fff', cursor: 'pointer', fontWeight: 600 }}
                        >
                            + Create New Blueprint
                        </button>
                    </div>

                    {isLoading && <p>Loading blueprints...</p>}
                    {error && <p style={{ color: '#f87171' }}>{error}</p>}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
                        {blueprints.map(bp => (
                            <div
                                key={bp.id}
                                onClick={() => router.push(`/blueprint?id=${bp.id}`)}
                                style={{ background: '#16213e', padding: 20, borderRadius: 12, border: '1px solid #333', cursor: 'pointer' }}
                            >
                                <h3 style={{ margin: '0 0 8px' }}>{bp.title}</h3>
                                <p style={{ color: '#888', fontSize: 14, margin: '0 0 16px' }}>{bp.description || 'No description'}</p>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#555' }}>
                                    <span>{bp.blocks.length} Sections</span>
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
            <div style={{ maxWidth: 900, margin: '40px auto', padding: '0 20px', color: '#fff' }}>
                <button onClick={() => router.push('/blueprint')} style={{ background: 'none', border: 'none', color: '#667eea', cursor: 'pointer', marginBottom: 20 }}>
                    ← Back to List
                </button>

                <div style={{ background: '#16213e', padding: 32, borderRadius: 16, border: '1px solid #333' }}>
                    <input
                        type="text"
                        placeholder="Blueprint Title"
                        value={currentBlueprint?.title || ''}
                        onChange={(e) => saveState({ title: e.target.value })}
                        style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '2px solid #333', color: '#fff', fontSize: '2rem', fontWeight: 700, marginBottom: 12, outline: 'none' }}
                    />
                    <textarea
                        placeholder="Description (optional)"
                        value={currentBlueprint?.description || ''}
                        onChange={(e) => saveState({ description: e.target.value })}
                        style={{ width: '100%', background: 'transparent', border: 'none', color: '#888', fontSize: '1rem', marginBottom: 32, resize: 'none', outline: 'none' }}
                    />

                    <div style={{ display: 'flex', gap: 24, marginBottom: 32 }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', color: '#555', fontSize: 12, textTransform: 'uppercase', fontWeight: 700, marginBottom: 8 }}>Duration (minutes)</label>
                            <input
                                type="number"
                                value={currentBlueprint?.duration_minutes || 60}
                                onChange={(e) => saveState({ duration_minutes: parseInt(e.target.value) })}
                                style={{ background: '#0d1117', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', color: '#fff', width: '100%' }}
                            />
                        </div>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={currentBlueprint?.shuffle_questions || false}
                                    onChange={(e) => saveState({ shuffle_questions: e.target.checked })}
                                />
                                <span>Shuffle Questions</span>
                            </label>
                        </div>
                    </div>

                    <h2 style={{ marginBottom: 20 }}>Sections & Rules</h2>

                    {(currentBlueprint?.blocks || []).map((block, bIdx) => (
                        <div key={bIdx} style={{ background: '#0d1117', padding: 24, borderRadius: 12, marginBottom: 20, border: '1px solid #222' }}>
                            <input
                                value={block.title}
                                onChange={(e) => {
                                    const newBlocks = [...currentBlueprint!.blocks!];
                                    newBlocks[bIdx].title = e.target.value;
                                    saveState({ blocks: newBlocks });
                                }}
                                style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: '1.2rem', fontWeight: 600, marginBottom: 16, width: '100%' }}
                            />

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {block.rules.map((rule, rIdx) => (
                                    <div key={rIdx} style={{ background: '#16213e', padding: 12, borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ padding: '4px 8px', background: rule.rule_type === 'FIXED' ? '#3b82f6' : '#8b5cf6', borderRadius: 4, fontSize: 10, fontWeight: 800 }}>
                                            {rule.rule_type}
                                        </div>
                                        {rule.rule_type === 'FIXED' ? (
                                            <input
                                                placeholder="Learning Object UUID"
                                                value={rule.learning_object_id || ''}
                                                onChange={(e) => {
                                                    const newBlocks = [...currentBlueprint!.blocks!];
                                                    newBlocks[bIdx].rules[rIdx].learning_object_id = e.target.value;
                                                    saveState({ blocks: newBlocks });
                                                }}
                                                style={{ flex: 1, background: '#0d1117', border: '1px solid #333', borderRadius: 4, padding: '6px 10px', color: '#fff', fontSize: 13, fontFamily: 'monospace' }}
                                            />
                                        ) : (
                                            <>
                                                <input
                                                    type="number"
                                                    placeholder="Count"
                                                    value={rule.count}
                                                    onChange={(e) => {
                                                        const newBlocks = [...currentBlueprint!.blocks!];
                                                        newBlocks[bIdx].rules[rIdx].count = parseInt(e.target.value);
                                                        saveState({ blocks: newBlocks });
                                                    }}
                                                    style={{ width: 60, background: '#0d1117', border: '1px solid #333', borderRadius: 4, padding: '6px 10px', color: '#fff' }}
                                                />
                                                <input
                                                    placeholder="Tags (comma separated)"
                                                    value={(rule.tags || []).join(', ')}
                                                    onChange={(e) => {
                                                        const newBlocks = [...currentBlueprint!.blocks!];
                                                        newBlocks[bIdx].rules[rIdx].tags = e.target.value.split(',').map(s => s.trim()).filter(s => s);
                                                        saveState({ blocks: newBlocks });
                                                    }}
                                                    style={{ flex: 1, background: '#0d1117', border: '1px solid #333', borderRadius: 4, padding: '6px 10px', color: '#fff' }}
                                                />
                                            </>
                                        )}
                                        <button
                                            onClick={() => {
                                                const newBlocks = [...currentBlueprint!.blocks!];
                                                newBlocks[bIdx].rules.splice(rIdx, 1);
                                                saveState({ blocks: newBlocks });
                                            }}
                                            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                                <button
                                    onClick={() => handleAddRule(bIdx, 'FIXED')}
                                    style={{ background: '#3b82f633', border: '1px solid #3b82f6', color: '#3b82f6', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                                >
                                    + Add Item
                                </button>
                                <button
                                    onClick={() => handleAddRule(bIdx, 'RANDOM')}
                                    style={{ background: '#8b5cf633', border: '1px solid #8b5cf6', color: '#8b5cf6', padding: '6px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}
                                >
                                    + Add Random
                                </button>
                            </div>
                        </div>
                    ))}

                    <button
                        onClick={handleAddBlock}
                        style={{ width: '100%', padding: '12px', background: 'transparent', border: '2px dashed #333', color: '#555', borderRadius: 12, cursor: 'pointer', marginBottom: 32 }}
                    >
                        + Add New Section
                    </button>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            {validation && (
                                <div style={{ color: validation.valid ? '#4ade80' : '#f87171', fontSize: 14, fontWeight: 600 }}>
                                    {validation.valid ? '✓ Blueprint Valid' : '✕ Blueprint Incomplete/Invalid'}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 16 }}>
                            {idFromUrl && (
                                <>
                                    <button
                                        onClick={handleStartPreview}
                                        disabled={isStarting}
                                        style={{ padding: '10px 24px', background: '#3b82f6', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontWeight: 600, opacity: isStarting ? 0.5 : 1 }}
                                    >
                                        {isStarting ? 'Starting...' : '🚀 Start Test'}
                                    </button>
                                    <button
                                        onClick={() => validateBlueprint(idFromUrl)}
                                        style={{ padding: '10px 24px', background: '#16213e', border: '1px solid #333', borderRadius: 8, color: '#fff', cursor: 'pointer' }}
                                    >
                                        🔍 Validate Rules
                                    </button>
                                </>
                            )}
                            <button
                                onClick={handleSave}
                                style={{ padding: '10px 32px', background: '#4ade80', border: 'none', borderRadius: 8, color: '#0d1117', cursor: 'pointer', fontWeight: 700 }}
                            >
                                💾 Save Blueprint
                            </button>
                        </div>
                    </div>

                    {error && <p style={{ color: '#f87171', marginTop: 16, textAlign: 'right' }}>{error}</p>}
                </div>

                {validation && !validation.valid && (
                    <div style={{ marginTop: 20, background: '#7f1d1d33', border: '1px solid #7f1d1d', padding: 20, borderRadius: 12 }}>
                        <h4 style={{ margin: 0, color: '#f87171', marginBottom: 12 }}>Validation Details</h4>
                        {validation.blocks.map((b, i) => (
                            <div key={i} style={{ marginBottom: 10 }}>
                                <div style={{ fontWeight: 600 }}>{b.title}</div>
                                {b.rule_validation.map((r, j) => (
                                    <div key={j} style={{ fontSize: 13, color: r.valid ? '#4ade80' : '#f87171', marginLeft: 16 }}>
                                        • {r.rule}: {r.reason} {r.matching_count !== undefined && `(${r.matching_count} found)`}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </ProtectedRoute>
    );
}
