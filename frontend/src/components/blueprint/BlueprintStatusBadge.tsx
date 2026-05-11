'use client';

import { Badge, StatusDot } from '@/components/ui';
import {
    blueprintStatusLabel,
    type BlueprintStatus,
} from '@/lib/blueprintPermissions';

interface Props {
    status: BlueprintStatus;
    size?: 'sm' | 'md';
}

export default function BlueprintStatusBadge({ status, size = 'sm' }: Props) {
    if (status === 'ONGOING') {
        return (
            <Badge
                tone="warning"
                size={size}
                leadingIcon={<StatusDot tone="warning" pulse />}
            >
                {blueprintStatusLabel(status)}
            </Badge>
        );
    }

    const tone: 'neutral' | 'info' | 'success' =
        status === 'NEW' ? 'neutral' : status === 'SCHEDULED' ? 'info' : 'success';

    return (
        <Badge tone={tone} size={size}>
            {blueprintStatusLabel(status)}
        </Badge>
    );
}
