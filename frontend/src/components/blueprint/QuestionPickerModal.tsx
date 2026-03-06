import React, { useState, useEffect } from 'react';
import { useBlueprintStore, AvailableItem } from '@/stores/useBlueprintStore';

interface QuestionPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (item: AvailableItem) => void;
    excludeIds?: string[];
}

export default function QuestionPickerModal({ isOpen, onClose, onSelect, excludeIds = [] }: QuestionPickerModalProps) {
    const { availableItems, fetchAvailableItems, isLoading } = useBlueprintStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [inspectedItem, setInspectedItem] = useState<AvailableItem | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchAvailableItems();
        }
    }, [isOpen, fetchAvailableItems]);

    if (!isOpen) return null;

    const filteredItems = availableItems.filter(item => {
        const matchesSearch = item.latest_content_preview.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === 'all' || item.latest_question_type === typeFilter;
        const isExcluded = excludeIds.includes(item.id);
        return matchesSearch && matchesType && !isExcluded;
    });

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(8px)',
            padding: '20px'
        }}>
            <div style={{
                backgroundColor: '#16213e',
                width: '100%',
                maxWidth: '800px',
                maxHeight: '80vh',
                borderRadius: '24px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                overflow: 'hidden'
            }}>
                {/* Header */}
                <div style={{
                    padding: '24px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255, 255, 255, 0.02)'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, color: '#fff' }}>Select Question</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '36px',
                            height: '36px',
                            color: '#888',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.2rem',
                            transition: 'all 0.2s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'}
                        onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'}
                    >
                        ✕
                    </button>
                </div>

                {/* Filters */}
                <div style={{ padding: '20px 24px', display: 'flex', gap: '12px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <div style={{ flex: 1, position: 'relative' }}>
                        <input
                            type="text"
                            placeholder="Search questions..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                backgroundColor: '#0f172a',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                color: '#fff',
                                outline: 'none',
                                fontSize: '0.9rem'
                            }}
                        />
                    </div>
                    <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                        style={{
                            backgroundColor: '#0f172a',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '12px',
                            padding: '12px 16px',
                            color: '#fff',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="all">All Types</option>
                        <option value="MULTIPLE_CHOICE">MCQ</option>
                        <option value="ESSAY">Essay</option>
                    </select>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                    {isLoading ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>Loading questions...</div>
                    ) : inspectedItem ? (
                        <div style={{ padding: '24px', color: '#fff' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
                                <div>
                                    <button
                                        onClick={() => setInspectedItem(null)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: '#60a5fa',
                                            cursor: 'pointer',
                                            marginBottom: '12px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontSize: '0.9rem',
                                            padding: 0
                                        }}
                                    >
                                        ← Back to list
                                    </button>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>Inspection View</h3>
                                </div>
                                <button
                                    onClick={() => onSelect(inspectedItem)}
                                    style={{
                                        padding: '12px 24px',
                                        backgroundColor: '#3b82f6',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '12px',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)'
                                    }}
                                >
                                    Select This Question
                                </button>
                            </div>

                            <div style={{
                                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '20px',
                                padding: '32px'
                            }}>
                                <div style={{ marginBottom: '32px' }}>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Content Description</div>
                                    <div style={{ fontSize: '1.1rem', lineHeight: 1.6, color: '#e2e8f0' }}>{inspectedItem.latest_content_preview}</div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '24px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Type</div>
                                        <div style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: '6px', backgroundColor: 'rgba(255,255,255,0.05)', fontSize: '0.9rem' }}>{inspectedItem.latest_question_type}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Status</div>
                                        <div style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: '6px', backgroundColor: 'rgba(34,197,94,0.1)', color: '#4ade80', fontSize: '0.9rem' }}>{inspectedItem.latest_status}</div>
                                    </div>
                                    {inspectedItem.metadata_tags?.topic && (
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Topic</div>
                                            <div style={{ color: '#fff', fontSize: '1rem' }}>{inspectedItem.metadata_tags.topic}</div>
                                        </div>
                                    )}
                                    {inspectedItem.metadata_tags?.difficulty && (
                                        <div>
                                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700 }}>Difficulty</div>
                                            <div style={{ color: '#fbbf24', fontSize: '1rem', fontWeight: 600 }}>Level {inspectedItem.metadata_tags.difficulty}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
                            <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔍</div>
                            <div style={{ fontSize: '1.1rem' }}>No questions found.</div>
                            <p style={{ fontSize: '0.9rem', marginTop: '8px' }}>Try adjusting your search or filters.</p>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gap: '10px', padding: '4px' }}>
                            {filteredItems.map(item => (
                                <div
                                    key={item.id}
                                    onClick={() => setInspectedItem(item)}
                                    style={{
                                        padding: '16px 20px',
                                        borderRadius: '16px',
                                        backgroundColor: 'rgba(255, 255, 255, 0.03)',
                                        border: '1px solid rgba(255, 255, 255, 0.05)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '20px'
                                    }}
                                    onMouseOver={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                                        e.currentTarget.style.borderColor = 'rgba(96, 165, 250, 0.2)';
                                        e.currentTarget.style.transform = 'translateY(-1px)';
                                    }}
                                    onMouseOut={(e) => {
                                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
                                        e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                                        e.currentTarget.style.transform = 'none';
                                    }}
                                >
                                    <div style={{
                                        width: '44px',
                                        height: '44px',
                                        borderRadius: '12px',
                                        backgroundColor: item.latest_question_type === 'MULTIPLE_CHOICE' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: item.latest_question_type === 'MULTIPLE_CHOICE' ? '#60a5fa' : '#a78bfa',
                                        fontWeight: 800,
                                        fontSize: '0.65rem'
                                    }}>
                                        {item.latest_question_type === 'MULTIPLE_CHOICE' ? 'MCQ' : 'ESS'}
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ color: '#fff', fontSize: '0.95rem', fontWeight: 500, marginBottom: '6px' }}>
                                            {item.latest_content_preview}
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                            <div style={{ color: '#64748b', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                                                ID: {item.id.substring(0, 8)}
                                            </div>
                                            {item.metadata_tags?.topic && (
                                                <div style={{ color: '#475569', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#475569' }}></span>
                                                    {item.metadata_tags.topic}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSelect(item);
                                        }}
                                        style={{
                                            padding: '8px 16px',
                                            borderRadius: '10px',
                                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                                            border: '1px solid rgba(59, 130, 246, 0.2)',
                                            color: '#60a5fa',
                                            fontSize: '0.85rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseOver={(e) => {
                                            e.currentTarget.style.backgroundColor = '#3b82f6';
                                            e.currentTarget.style.color = '#fff';
                                        }}
                                        onMouseOut={(e) => {
                                            e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                                            e.currentTarget.style.color = '#60a5fa';
                                        }}
                                    >
                                        Select
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '20px 24px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    background: 'rgba(255, 255, 255, 0.01)'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: 'transparent',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '10px',
                            color: '#fff',
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            fontWeight: 600
                        }}
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}
