'use client';

import type { HistogramBucket } from '@/lib/analytics.types';

export default function HistogramChart({ buckets }: { buckets: HistogramBucket[] }) {
    if (buckets.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-gray-800 bg-gray-900/50 px-4 py-10 text-center text-sm text-gray-500">
                No published score distribution yet.
            </div>
        );
    }

    const maxCount = Math.max(...buckets.map((bucket) => bucket.count), 1);

    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-5">
            <div className="flex h-56 items-end gap-3">
                {buckets.map((bucket) => {
                    const height = `${Math.max((bucket.count / maxCount) * 100, bucket.count > 0 ? 10 : 0)}%`;
                    return (
                        <div key={bucket.range} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                            <span className="text-[11px] text-gray-500">{bucket.count}</span>
                            <div className="flex h-40 w-full items-end rounded-lg bg-gray-950/60 px-1 pb-1">
                                <div
                                    className="w-full rounded-md bg-gradient-to-t from-blue-600 to-cyan-400 transition-all duration-300"
                                    style={{ height }}
                                />
                            </div>
                            <span className="text-[10px] text-gray-500">{bucket.range}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
