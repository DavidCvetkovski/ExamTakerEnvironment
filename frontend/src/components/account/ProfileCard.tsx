'use client';

import { Avatar } from '@/components/ui';
import type { UserPublic } from '@/stores/useAuthStore';

const ROLE_LABEL: Record<UserPublic['role'], string> = {
    ADMIN: 'Administrator',
    CONSTRUCTOR: 'Constructor',
    REVIEWER: 'Reviewer',
    STUDENT: 'Student',
};

/** Read-only identity summary. Email / role / VUnetID are administrator-managed,
 *  so this is a display surface, not a form (CLAUDE.md §7.7 inspect ≠ edit). */
export default function ProfileCard({ user }: { user: UserPublic }) {
    return (
        <section className="rounded-2xl border border-shell-border bg-shell-surface px-6 py-5 space-y-4">
            <div className="flex items-center gap-4">
                <Avatar email={user.email} size="lg" />
                <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-foreground truncate">{user.email}</p>
                    <p className="text-meta text-shell-muted-dim">{ROLE_LABEL[user.role]}</p>
                </div>
            </div>

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                    <dt className="text-eyebrow text-shell-muted-dim">VUnetID</dt>
                    <dd className="text-meta text-foreground">{user.vunet_id || '—'}</dd>
                </div>
                <div>
                    <dt className="text-eyebrow text-shell-muted-dim">Role</dt>
                    <dd className="text-meta text-foreground">{ROLE_LABEL[user.role]}</dd>
                </div>
            </dl>

            <p className="text-eyebrow text-shell-muted-dim">
                These details are managed by your administrator.
            </p>
        </section>
    );
}
