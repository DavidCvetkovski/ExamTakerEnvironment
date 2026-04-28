'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { useBlueprintStore } from '@/stores/useBlueprintStore';

export default function AnalyticsIndexPage() {
    const { blueprints, isLoading, error, fetchBlueprints } = useBlueprintStore();

    useEffect(() => {
        fetchBlueprints();
    }, [fetchBlueprints]);

    return (
        <ProtectedRoute allowedRoles={['CONSTRUCTOR', 'ADMIN']}>
            <div className="min-h-screen bg-gray-950 text-gray-100">
                <div className="border-b border-gray-800 bg-gray-900 px-6 py-5">
                    <div className="mx-auto max-w-6xl">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">
                            Analytics
                        </p>
                        <h1 className="mt-2 text-3xl font-bold text-white">Psychometric Dashboards</h1>
                        <p className="mt-2 max-w-2xl text-sm text-gray-400">
                            Pick a test blueprint to inspect item quality, score distribution, and version-level behavior.
                        </p>
                    </div>
                </div>

                <div className="mx-auto max-w-6xl px-6 py-6">
                    {error ? (
                        <div className="mb-6 rounded-xl border border-rose-800 bg-rose-900/20 px-4 py-3 text-sm text-rose-200">
                            {error}
                        </div>
                    ) : null}

                    {isLoading && blueprints.length === 0 ? (
                        <div className="flex items-center justify-center py-24 text-gray-500">
                            <div className="mr-3 h-6 w-6 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                            Loading available tests...
                        </div>
                    ) : null}

                    {!isLoading && blueprints.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-gray-800 bg-gray-900/50 px-6 py-16 text-center">
                            <p className="text-lg font-semibold text-white">No test blueprints yet</p>
                            <p className="mt-2 text-sm text-gray-500">
                                Create and publish a test before analytics can tell us anything useful.
                            </p>
                        </div>
                    ) : null}

                    {blueprints.length > 0 ? (
                        <div className="grid gap-4 lg:grid-cols-2">
                            {blueprints.map((blueprint) => (
                                <div key={blueprint.id} className="rounded-xl border border-gray-800 bg-gray-900 px-5 py-5">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-lg font-semibold text-white">{blueprint.title}</p>
                                            <p className="mt-1 text-sm text-gray-500">
                                                {blueprint.description || 'No description provided.'}
                                            </p>
                                        </div>
                                        <Link
                                            href={`/analytics/tests/${blueprint.id}`}
                                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                                        >
                                            Open
                                        </Link>
                                    </div>
                                    <div className="mt-4 flex flex-wrap gap-2 text-xs text-gray-400">
                                        <span className="rounded-full border border-gray-700 px-3 py-1">
                                            {blueprint.blocks.length} sections
                                        </span>
                                        <span className="rounded-full border border-gray-700 px-3 py-1">
                                            {blueprint.duration_minutes} minutes
                                        </span>
                                        <span className="rounded-full border border-gray-700 px-3 py-1">
                                            Pass {blueprint.scoring_config?.pass_percentage ?? 55}%
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            </div>
        </ProtectedRoute>
    );
}
