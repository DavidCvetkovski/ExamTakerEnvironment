'use client';

import { ButtonHTMLAttributes, forwardRef, ReactNode } from 'react';
import { cn } from './cn';
import Spinner from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'success' | 'warning';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    leadingIcon?: ReactNode;
    trailingIcon?: ReactNode;
    loading?: boolean;
    fullWidth?: boolean;
}

const VARIANT: Record<Variant, string> = {
    primary:
        'bg-brand text-white border border-transparent ' +
        'hover:brightness-110 active:brightness-95 ' +
        'disabled:opacity-50',
    secondary:
        'bg-shell-surface text-foreground border border-shell-border ' +
        'hover:bg-shell-input-alt hover:border-shell-border-deep ' +
        'disabled:opacity-50',
    ghost:
        'bg-transparent text-shell-muted border border-transparent ' +
        'hover:text-foreground hover:bg-shell-input-alt ' +
        'disabled:opacity-50',
    destructive:
        'bg-danger text-white border border-transparent ' +
        'hover:brightness-110 active:brightness-95 ' +
        'disabled:opacity-50',
    success:
        'bg-success text-white border border-transparent ' +
        'hover:brightness-110 active:brightness-95 ' +
        'disabled:opacity-40 disabled:cursor-not-allowed',
    warning:
        'bg-warning text-white border border-transparent ' +
        'hover:brightness-110 active:brightness-95 ' +
        'disabled:opacity-50',
};

const SIZE: Record<Size, string> = {
    sm: 'h-7 px-2.5 text-meta gap-1.5',
    md: 'h-9 px-3.5 text-body gap-2',
    lg: 'h-11 px-5 text-h3 gap-2.5',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    {
        variant = 'primary',
        size = 'md',
        leadingIcon,
        trailingIcon,
        loading,
        fullWidth,
        className,
        children,
        disabled,
        ...rest
    },
    ref
) {
    return (
        <button
            ref={ref}
            disabled={disabled || loading}
            className={cn(
                'inline-flex items-center justify-center rounded-md font-medium',
                'transition-[background-color,border-color,color,filter,transform] duration-[var(--duration-fast)] ease-[var(--ease-standard)]',
                'focus-ring',
                'select-none whitespace-nowrap',
                'disabled:cursor-not-allowed',
                fullWidth && 'w-full',
                VARIANT[variant],
                SIZE[size],
                className
            )}
            {...rest}
        >
            {loading ? (
                <Spinner size="xs" tone="current" />
            ) : leadingIcon ? (
                <span className="shrink-0 inline-flex items-center justify-center">{leadingIcon}</span>
            ) : null}
            {children}
            {trailingIcon && !loading ? (
                <span className="shrink-0 inline-flex items-center justify-center">{trailingIcon}</span>
            ) : null}
        </button>
    );
});

export default Button;
