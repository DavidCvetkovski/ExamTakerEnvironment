'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import TipTapEditor from '@/components/editor/TipTapEditor';
import MCQOptionsPanel from '@/components/editor/MCQOptionsPanel';
import EssayOptionsPanel from '@/components/editor/EssayOptionsPanel';
import { useAuthoringStore } from '@/stores/useAuthoringStore';
import { useAuthStore } from '@/stores/useAuthStore';
import ProtectedRoute from '@/components/auth/ProtectedRoute';

export default function AuthorPage() {
    const searchParams = useSearchParams();
    const loIdParam = searchParams.get('lo_id');
    const fetchedRef = useRef<string | null>(null);

    const {
        saveStatus,
        versionNumber,
        questionType,
        setQuestionType,
        fetchLatestVersion,
        learningObjectId,
        saveDraft,
        metadataTags,
        updateMetadataField,
    } = useAuthoringStore();

    const { user, logout } = useAuthStore();

    // Always fetch on mount when lo_id param is present, guard against double-render
    useEffect(() => {
        if (loIdParam && fetchedRef.current !== loIdParam) {
            fetchedRef.current = loIdParam;
            fetchLatestVersion(loIdParam);
        }
    }, [loIdParam, fetchLatestVersion]);

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="max-w-4xl mx-auto py-10 px-6 font-sans">

                <button
                    onClick={() => window.location.href = '/items'}
                    className="text-blue-400 hover:text-blue-300 transition-colors mb-6 flex items-center gap-2 text-sm font-medium"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    Back to Library
                </button>

                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">✏️ Question Authoring</h1>
                    <p className="text-[#A1A1AA] text-sm">
                        Create or edit question versions for the selected Learning Object.
                    </p>
                </div>

                {!learningObjectId ? (
                    <div className="bg-[#242424] border border-[#333] p-12 text-center rounded-xl space-y-4">
                        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
                        <p className="text-[#A1A1AA]">Linking to learning object...</p>
                        <p className="text-xs text-[#555]">If this persists, go back to the library and try again.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {/* Control Bar */}
                        <div className="flex flex-wrap items-center gap-4 p-4 bg-[#242424] border border-[#333] rounded-xl text-sm">
                            <div className="flex items-center gap-2">
                                <span className="text-[#A1A1AA]">Status:</span>
                                <span className={`font-bold ${saveStatus === 'SAVED' ? 'text-emerald-400'
                                    : saveStatus === 'SAVING' ? 'text-amber-400'
                                        : saveStatus === 'ERROR' ? 'text-rose-400'
                                            : 'text-gray-500'
                                    }`}>
                                    {saveStatus === 'IDLE' ? 'Ready'
                                        : saveStatus === 'SAVING' ? '⏳ Saving...'
                                            : saveStatus === 'SAVED' ? '✓ Changes saved'
                                                : '✕ Save Failed'}
                                </span>
                            </div>

                            <div className="h-4 w-px bg-[#333]" />

                            <div className="flex items-center gap-2">
                                <span className="text-[#A1A1AA]">Version:</span>
                                <span className="text-white font-mono bg-[#1A1A1A] px-2 py-0.5 rounded border border-[#333]">
                                    v{versionNumber || 1}
                                </span>
                            </div>

                            <div className="flex-1" />

                            <div className="flex items-center gap-3">
                                <label className="text-[#A1A1AA] flex items-center gap-2">
                                    Subject:
                                    <input
                                        type="text"
                                        placeholder="e.g. Math"
                                        value={(metadataTags.topic as string) || ''}
                                        onChange={(e) => updateMetadataField('topic', e.target.value)}
                                        className="bg-[#1A1A1A] text-white border border-[#333] rounded px-3 py-1.5 focus:border-blue-500 outline-none transition-colors w-32"
                                    />
                                </label>

                                <label className="text-[#A1A1AA] flex items-center gap-2">
                                    Points:
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={metadataTags.points !== undefined ? metadataTags.points as number : ''}
                                        onChange={(e) => updateMetadataField('points', e.target.value === '' ? '' : parseInt(e.target.value))}
                                        className="bg-[#1A1A1A] text-white border border-[#333] rounded px-3 py-1.5 focus:border-blue-500 outline-none transition-colors w-20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                </label>

                                <label className="text-[#A1A1AA] flex items-center gap-2">
                                    Type:
                                    <select
                                        value={questionType}
                                        onChange={(e) => setQuestionType(e.target.value as 'MULTIPLE_CHOICE' | 'MULTIPLE_RESPONSE' | 'ESSAY')}
                                        className="bg-[#1A1A1A] text-white border border-[#333] rounded px-3 py-1.5 focus:border-blue-500 outline-none transition-colors"
                                    >
                                        <option value="MULTIPLE_CHOICE">Single Choice</option>
                                        <option value="MULTIPLE_RESPONSE">Multiple Choice</option>
                                        <option value="ESSAY">Essay</option>
                                    </select>
                                </label>

                                <button
                                    onClick={saveDraft}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-emerald-50 px-4 py-2 rounded font-bold transition-colors shadow-lg shadow-emerald-900/10 flex items-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                    </svg>
                                    Save
                                </button>
                            </div>
                        </div>

                        {/* TipTap Editor */}
                        <div className="bg-[#1A1A1A] rounded-xl border border-[#333] overflow-hidden">
                            <TipTapEditor />
                        </div>

                        {/* Options Panels */}
                        <div className="bg-[#1A1A1A] rounded-xl border border-[#333] overflow-hidden">
                            {questionType === 'MULTIPLE_CHOICE' || questionType === 'MULTIPLE_RESPONSE' ? (
                                <MCQOptionsPanel />
                            ) : (
                                <EssayOptionsPanel />
                            )}
                        </div>
                    </div>
                )}
            </div>
        </ProtectedRoute>
    );
}
