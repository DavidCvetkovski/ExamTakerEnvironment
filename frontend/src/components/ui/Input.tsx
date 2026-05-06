'use client';

import { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, forwardRef, ReactNode } from 'react';
import { cn } from './cn';

type Size = 'sm' | 'md' | 'lg';

const FIELD_BASE =
    'block w-full rounded-md bg-shell-input border border-shell-border-deep ' +
    'text-foreground placeholder:text-shell-muted-dim ' +
    'transition-[border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)] ' +
    'focus:outline-none focus:border-brand focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-brand)_25%,transparent)] ' +
    'disabled:opacity-60 disabled:cursor-not-allowed';

const SIZE: Record<Size, string> = {
    sm: 'h-8 px-2.5 text-meta',
    md: 'h-9 px-3 text-body',
    lg: 'h-11 px-3.5 text-h3',
};

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
    inputSize?: Size;
    leadingIcon?: ReactNode;
    trailingIcon?: ReactNode;
    invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
    { inputSize = 'md', leadingIcon, trailingIcon, invalid, className, ...rest },
    ref
) {
    if (leadingIcon || trailingIcon) {
        return (
            <div className="relative inline-flex items-center w-full">
                {leadingIcon && (
                    <span className="absolute left-3 inline-flex items-center text-shell-muted-dim pointer-events-none">
                        {leadingIcon}
                    </span>
                )}
                <input
                    ref={ref}
                    aria-invalid={invalid}
                    className={cn(
                        FIELD_BASE,
                        SIZE[inputSize],
                        leadingIcon && 'pl-9',
                        trailingIcon && 'pr-9',
                        invalid && 'border-danger focus:border-danger',
                        className
                    )}
                    {...rest}
                />
                {trailingIcon && (
                    <span className="absolute right-3 inline-flex items-center text-shell-muted-dim pointer-events-none">
                        {trailingIcon}
                    </span>
                )}
            </div>
        );
    }

    return (
        <input
            ref={ref}
            aria-invalid={invalid}
            className={cn(
                FIELD_BASE,
                SIZE[inputSize],
                invalid && 'border-danger focus:border-danger',
                className
            )}
            {...rest}
        />
    );
});

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
    inputSize?: Size;
    invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
    { inputSize = 'md', invalid, className, children, ...rest },
    ref
) {
    return (
        <div className="relative inline-flex items-center w-full">
            <select
                ref={ref}
                aria-invalid={invalid}
                className={cn(
                    FIELD_BASE,
                    SIZE[inputSize],
                    'appearance-none pr-9 cursor-pointer',
                    invalid && 'border-danger focus:border-danger',
                    className
                )}
                {...rest}
            >
                {children}
            </select>
            <span
                aria-hidden
                className="absolute right-3 pointer-events-none text-shell-muted-dim"
            >
                <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </span>
        </div>
    );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
    { invalid, className, ...rest },
    ref
) {
    return (
        <textarea
            ref={ref}
            aria-invalid={invalid}
            className={cn(
                FIELD_BASE,
                'min-h-[88px] py-2.5 text-body',
                invalid && 'border-danger focus:border-danger',
                className
            )}
            {...rest}
        />
    );
});

interface FieldProps {
    label?: ReactNode;
    hint?: ReactNode;
    error?: ReactNode;
    htmlFor?: string;
    required?: boolean;
    children: ReactNode;
    className?: string;
}

export function Field({ label, hint, error, htmlFor, required, children, className }: FieldProps) {
    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            {label && (
                <label
                    htmlFor={htmlFor}
                    className="text-meta font-medium text-shell-muted flex items-center gap-1"
                >
                    {label}
                    {required && <span className="text-danger">*</span>}
                </label>
            )}
            {children}
            {error ? (
                <p className="text-meta text-danger">{error}</p>
            ) : hint ? (
                <p className="text-meta text-shell-muted-dim">{hint}</p>
            ) : null}
        </div>
    );
}
