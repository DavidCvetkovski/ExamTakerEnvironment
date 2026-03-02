'use client';

import TipTapEditor from '@/components/editor/TipTapEditor';
import { useAuthoringStore } from '@/stores/useAuthoringStore';

export default function AuthorPage() {
    const { saveStatus, versionNumber, questionType, setQuestionType } = useAuthoringStore();

    return (
        <div style={{ maxWidth: 900, margin: '40px auto', padding: '0 20px' }}>
            <h1 style={{ color: '#fff', marginBottom: 8 }}>✏️ Question Authoring Workbench</h1>
            <p style={{ color: '#888', marginBottom: 24 }}>
                Epoch 2 Stage 4 — TipTap Editor with Syntax Highlighting
            </p>

            {/* Status Bar */}
            <div style={{
                display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center',
                padding: '8px 16px', background: '#16213e', borderRadius: 8, fontSize: 13
            }}>
                <span style={{ color: '#888' }}>
                    Status:{' '}
                    <span style={{
                        color: saveStatus === 'SAVED' ? '#4ade80' : saveStatus === 'SAVING' ? '#fbbf24' : saveStatus === 'ERROR' ? '#f87171' : '#888'
                    }}>
                        {saveStatus === 'IDLE' ? '—' : saveStatus === 'SAVING' ? 'Saving...' : saveStatus === 'SAVED' ? 'All changes saved ✓' : 'Error saving'}
                    </span>
                </span>
                <span style={{ color: '#888' }}>Version: {versionNumber || '—'}</span>
                <span style={{ flex: 1 }} />
                <label style={{ color: '#888' }}>
                    Type:{' '}
                    <select
                        value={questionType}
                        onChange={(e) => setQuestionType(e.target.value as 'MULTIPLE_CHOICE' | 'ESSAY')}
                        style={{ background: '#0d1117', color: '#e0e0e0', border: '1px solid #333', borderRadius: 4, padding: '2px 8px' }}
                    >
                        <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                        <option value="ESSAY">Essay</option>
                    </select>
                </label>
            </div>

            {/* TipTap Editor */}
            <TipTapEditor />

            <p style={{ color: '#555', fontSize: 12, marginTop: 12 }}>
                Tip: Click the {'</>'} button to insert a syntax-highlighted code block. Try typing Python code inside it!
            </p>
        </div>
    );
}
