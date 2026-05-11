/**
 * Blueprint lifecycle permission predicates.
 *
 * Mirrors backend/app/services/blueprint_status_service.py. Frontend uses these
 * to show/hide UI affordances; backend enforces the same rules authoritatively.
 */

export type BlueprintStatus = 'NEW' | 'SCHEDULED' | 'ONGOING' | 'PASSED';

export function canEditBlueprint(status: BlueprintStatus | undefined): boolean {
    return status === 'NEW' || status === 'SCHEDULED' || status === undefined;
}

export function canDeleteBlueprint(status: BlueprintStatus | undefined): boolean {
    return status === 'NEW' || status === undefined;
}

export function isBlueprintLocked(status: BlueprintStatus | undefined): boolean {
    return status === 'ONGOING' || status === 'PASSED';
}

export function blueprintStatusLabel(status: BlueprintStatus): string {
    switch (status) {
        case 'NEW':
            return 'New';
        case 'SCHEDULED':
            return 'Scheduled';
        case 'ONGOING':
            return 'Ongoing';
        case 'PASSED':
            return 'Completed';
    }
}
