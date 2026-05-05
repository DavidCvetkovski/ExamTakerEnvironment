'use client';

type Accent = 'blue' | 'emerald' | 'amber' | 'rose' | 'slate';

const ACCENT_CLASS: Record<Accent, string> = {
    blue: 'text-blue-300',
    emerald: 'text-emerald-300',
    amber: 'text-amber-300',
    rose: 'text-rose-300',
    slate: 'text-slate-100',
};

interface StatCardProps {
    label: string;
    value: string;
    note?: string;
    accent?: Accent;
}

export default function StatCard({
    label,
    value,
    note,
    accent = 'slate',
}: StatCardProps) {
    return (
        <div className="rounded-xl border border-gray-800 bg-gray-900 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
            <p className={`mt-3 text-2xl font-bold ${ACCENT_CLASS[accent]}`}>{value}</p>
            {note ? <p className="mt-2 text-xs text-gray-500">{note}</p> : null}
        </div>
    );
}
