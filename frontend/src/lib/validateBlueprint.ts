import type { TestBlock } from '@/stores/useBlueprintStore';

export interface BlueprintValidationResult {
    valid: boolean;
    titleError: string | null;
    sectionErrors: (string | null)[];
}

export function validateBlueprint(data: {
    title?: string;
    blocks?: TestBlock[];
}): BlueprintValidationResult {
    const titleError = !data.title?.trim()
        ? 'Blueprint must have a title.'
        : null;

    const sectionErrors = (data.blocks ?? []).map((block) =>
        block.rules.length === 0
            ? 'This section is empty — add at least one question rule.'
            : null
    );

    return {
        valid: !titleError && sectionErrors.every((e) => e === null),
        titleError,
        sectionErrors,
    };
}
