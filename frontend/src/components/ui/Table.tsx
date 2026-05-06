'use client';

import { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from './cn';

type Density = 'compact' | 'comfortable';

interface TableProps extends HTMLAttributes<HTMLTableElement> {
    density?: Density;
    zebra?: boolean;
    children?: ReactNode;
}

interface TableContainerProps extends HTMLAttributes<HTMLDivElement> {
    children?: ReactNode;
}

export function TableContainer({ className, children, ...rest }: TableContainerProps) {
    return (
        <div
            className={cn(
                'rounded-xl border border-shell-border bg-shell-surface overflow-hidden',
                'shadow-[var(--shadow-card)]',
                className
            )}
            {...rest}
        >
            <div className="overflow-x-auto">{children}</div>
        </div>
    );
}

export function Table({ density = 'comfortable', zebra = true, className, children, ...rest }: TableProps) {
    return (
        <table
            className={cn(
                'min-w-full',
                'border-separate border-spacing-0',
                density === 'compact' ? '[&_td]:py-2 [&_th]:py-2.5' : '[&_td]:py-3.5 [&_th]:py-3',
                zebra && 'table-zebra',
                className
            )}
            {...rest}
        >
            {children}
        </table>
    );
}

export function THead({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
    return (
        <thead className={cn('bg-shell-input/50', className)} {...rest}>
            {children}
        </thead>
    );
}

export function TBody({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
    return (
        <tbody className={className} {...rest}>
            {children}
        </tbody>
    );
}

export function TR({ className, children, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
    return (
        <tr className={className} {...rest}>
            {children}
        </tr>
    );
}

interface THProps extends ThHTMLAttributes<HTMLTableCellElement> {
    align?: 'left' | 'right' | 'center';
}

export function TH({ align = 'left', className, children, ...rest }: THProps) {
    return (
        <th
            className={cn(
                'px-5 text-eyebrow font-semibold uppercase tracking-eyebrow text-shell-muted-dim',
                'border-b border-shell-border',
                align === 'right' && 'text-right',
                align === 'center' && 'text-center',
                align === 'left' && 'text-left',
                className
            )}
            {...rest}
        >
            {children}
        </th>
    );
}

interface TDProps extends TdHTMLAttributes<HTMLTableCellElement> {
    align?: 'left' | 'right' | 'center';
    numeric?: boolean;
}

export function TD({ align = 'left', numeric, className, children, ...rest }: TDProps) {
    return (
        <td
            className={cn(
                'px-5 text-body text-foreground',
                'border-b border-shell-border/60',
                numeric && 'tabular-nums',
                align === 'right' && 'text-right',
                align === 'center' && 'text-center',
                align === 'left' && 'text-left',
                className
            )}
            {...rest}
        >
            {children}
        </td>
    );
}
