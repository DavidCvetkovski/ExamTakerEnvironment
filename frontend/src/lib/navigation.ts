/**
 * Single source of truth for the primary navigation surfaces a role can reach.
 *
 * Consumed by both `GlobalHeader` (the persistent top nav) and the home
 * dashboard tiles (Epoch 14.5) so the two never drift. Add a destination here
 * once and it appears in both places — no parallel hard-coded lists.
 *
 * Pure data: no React imports. The backend still enforces authorization on
 * every route (e.g. a 403 on `/admin/accommodations` for non-admins); these
 * links only decide what we *offer*, never what is *permitted*.
 */

export type UserRoleName = 'ADMIN' | 'CONSTRUCTOR' | 'REVIEWER' | 'STUDENT';

export interface NavLink {
    name: string;
    href: string;
}

const STUDENT_LINKS: NavLink[] = [
    { name: 'My Exams', href: '/my-exams' },
    { name: 'My Grades', href: '/my-grades' },
];

/**
 * Every surface available to the given role, in canonical order. Students get
 * their two portals; staff get the full authoring/operations set, with
 * admin/constructor-only destinations appended conditionally.
 */
export function navLinksForRole(role: UserRoleName | string | undefined | null): NavLink[] {
    if (role === 'STUDENT') return [...STUDENT_LINKS];
    // L-3: an unknown/unhydrated role must not fall through to the staff view.
    // Render nothing rather than leaking Constructor links to e.g. a REVIEWER.
    if (role !== 'ADMIN' && role !== 'CONSTRUCTOR') return [];

    return [
        { name: 'Library', href: '/items' },
        { name: 'Blueprints', href: '/blueprint' },
        { name: 'Sessions', href: '/sessions' },
        { name: 'Grading', href: '/grading' },
        { name: 'Analytics', href: '/analytics' },
        // Accommodations is admin-only (backend enforces 403 regardless).
        ...(role === 'ADMIN' ? [{ name: 'Accommodations', href: '/admin/accommodations' }] : []),
        ...(role === 'ADMIN' || role === 'CONSTRUCTOR'
            ? [{ name: 'Integrations', href: '/integrations' }]
            : []),
    ];
}
