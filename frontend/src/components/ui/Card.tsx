'use client';

import { HTMLAttributes, ReactNode, forwardRef } from 'react';
import { cn } from './cn';

type Variant = 'surface' | 'bordered' | 'flat' | 'elevated' | 'inset';
type Padding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    variant?: Variant;
    padding?: Padding;
    interactive?: boolean;
    children?: ReactNode;
}

const VARIANT: Record<Variant, string> = {
    surface: 'bg-shell-surface border border-shell-border shadow-[var(--shadow-card)]',
    bordered: 'bg-shell-surface border border-shell-border',
    flat: 'bg-shell-surface',
    elevated: 'bg-shell-surface border border-shell-border shadow-[var(--shadow-elevated)]',
    inset: 'bg-shell-input border border-shell-border',
};

const PADDING: Record<Padding, string> = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-7',
};

const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
    { variant = 'surface', padding = 'md', interactive, className, children, ...rest },
    ref
) {
    return (
        <div
            ref={ref}
            className={cn(
                'rounded-xl',
                'transition-[box-shadow,border-color,transform] duration-[var(--duration-normal)] ease-[var(--ease-standard)]',
                interactive &&
                    'cursor-pointer hover:shadow-[var(--shadow-card-hover)] hover:border-shell-border-deep',
                VARIANT[variant],
                PADDING[padding],
                className
            )}
            {...rest}
        >
            {children}
        </div>
    );
});

export default Card;

interface CardSectionProps extends HTMLAttributes<HTMLDivElement> {
    bordered?: boolean;
}

export function CardSection({ bordered, className, children, ...rest }: CardSectionProps) {
    return (
        <div
            className={cn(bordered && 'border-t border-shell-border pt-4 mt-4', className)}
            {...rest}
        >
            {children}
        </div>
    );
}
