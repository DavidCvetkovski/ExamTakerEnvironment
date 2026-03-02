'use client';

import { useEffect, useState } from 'react';
import TipTapEditor from '@/components/editor/TipTapEditor';
import MCQOptionsPanel from '@/components/editor/MCQOptionsPanel';
import { useAuthoringStore } from '@/stores/useAuthoringStore';

export default function AuthorPage() {
    const {
        saveStatus,
        versionNumber,
        questionType,
        setQuestionType,
        setLearningObjectId,
        learningObjectId,
        saveDraft,
    } = useAuthoringStore();

    const [loIdInput, setLoIdInput] = useState('');

    // Allow the user to paste a LearningObject UUID from the seed script
    const handleConnect = () => {
        if (loIdInput.trim()) {
            setLearningObjectId(loIdInput.trim());
        }
    };

    return (
        <div style={{ maxWidth: 900, margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
            <h1 style={{ color: '#fff', marginBottom: 4 }}>✏️ Question Authoring Workbench</h1>
            <p style={{ color: '#666', marginBottom: 24, fontSize: 14 }}>
                Epoch 2 — Full Stack Integration
            </p>

            {/* Connection Bar */}
            {!learningObjectId ? (
                <div style={{
                    padding: '16px 20px', background: '#16213e', borderRadius: 8, marginBottom: 20,
                    border: '1px solid #333'
                }}>
                    <p style={{ color: '#888', fontSize: 13, margin: '0 0 8px' }}>
                        Paste the <strong style={{ color: '#e0e0e0' }}>LearningObject UUID</strong> from the seed script to connect:
                    </p>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <input
                            type="text"
                            value={loIdInput}
                            onChange={(e) => setLoIdInput(e.target.value)}
                            placeholder="e.g. cc480f39-7f17-4949-8742-a24a86aba7bf"
                            style={{
                                flex: 1, padding: '8px 12px', background: '#0d1117', border: '1px solid #333',
                                borderRadius: 6, color: '#e0e0e0', fontSize: 13, fontFamily: 'monospace'
                            }}
                        />
                        <button
                            onClick={handleConnect}
                            style={{
                                padding: '8px 20px', background: '#667eea', border: 'none', borderRadius: 6,
                                color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13
                            }}
                        >
                            Connect
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    {/* Status Bar */}
                    <div style={{
                        display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center',
                        padding: '10px 16px', background: '#16213e', borderRadius: 8, fontSize: 13,
                        border: '1px solid #333'
                    }}>
                        <span style={{ color: '#888' }}>
                            Save:{' '}
                            <span style={{
                                fontWeight: 600,
                                color: saveStatus === 'SAVED' ? '#4ade80'
                                    : saveStatus === 'SAVING' ? '#fbbf24'
                                        : saveStatus === 'ERROR' ? '#f87171'
                                            : '#666'
                            }}>
                                {saveStatus === 'IDLE' ? 'Not saved yet'
                                    : saveStatus === 'SAVING' ? '⏳ Saving...'
                                        : saveStatus === 'SAVED' ? '✓ All changes saved'
                                            : '✕ Error saving'}
                            </span>
                        </span>
                        <span style={{ color: '#555' }}>|</span>
                        <span style={{ color: '#888' }}>Version: <strong style={{ color: '#e0e0e0' }}>{versionNumber || '—'}</strong></span>
                        <span style={{ flex: 1 }} />
                        <label style={{ color: '#888' }}>
                            Type:{' '}
                            <select
                                value={questionType}
                                onChange={(e) => setQuestionType(e.target.value as 'MULTIPLE_CHOICE' | 'ESSAY')}
                                style={{
                                    background: '#0d1117', color: '#e0e0e0', border: '1px solid #333',
                                    borderRadius: 4, padding: '4px 8px', fontSize: 13
                                }}
                            >
                                <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                                <option value="ESSAY">Essay</option>
                            </select>
                        </label>
                        <button
                            onClick={saveDraft}
                            style={{
                                padding: '4px 14px', background: '#4ade80', border: 'none', borderRadius: 4,
                                color: '#0d1117', cursor: 'pointer', fontWeight: 600, fontSize: 12
                            }}
                        >
                            💾 Save Now
                        </button>
                    </div>

                    {/* TipTap Editor */}
                    <TipTapEditor />

                    {/* MCQ Options Panel */}
                    <MCQOptionsPanel />

                    <p style={{ color: '#444', fontSize: 11, marginTop: 16 }}>
                        Connected to LO: <code style={{ color: '#667eea' }}>{learningObjectId}</code>
                    </p>
                </>
            )}
        </div>
    );
}
