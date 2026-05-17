import type { TestBlock } from '@/stores/useBlueprintStore';

export interface BlueprintValidationResult {
    valid: boolean;
    titleError: string | null;
    /**
     * Blueprint-level structural error: the blueprint has no section that
     * contributes any questions. A blueprint with zero sections, or only
     * empty sections, has nothing to assemble at session-instantiation time
     * and is rejected before save. Per-section issues are reported in
     * ``sectionErrors``; this field is for the whole-blueprint failure.
     */
    structureError: string | null;
    sectionErrors: (string | null)[];
}

export function validateBlueprint(data: {
    title?: string;
    blocks?: TestBlock[];
}): BlueprintValidationResult {
    const titleError = !data.title?.trim()
        ? 'Blueprint must have a title.'
        : null;

    const blocks = data.blocks ?? [];
    const sectionErrors = blocks.map((block) =>
        block.rules.length === 0
            ? 'This section is empty — add at least one question rule.'
            : null
    );

    // A blueprint must contribute at least one question. Zero sections,
    // or every section empty, both fail this check.
    const hasNonEmptySection = blocks.some((block) => block.rules.length > 0);
    const structureError = hasNonEmptySection
        ? null
        : 'Add at least one section with a question before saving.';

    return {
        valid:
            !titleError
            && !structureError
            && sectionErrors.every((e) => e === null),
        titleError,
        structureError,
        sectionErrors,
    };
}
