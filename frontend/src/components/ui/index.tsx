/**
 * Samayak Shared UI Components
 * All components use Samayak Design System tokens via Tailwind.
 */
import React from 'react';
import { clsx } from 'clsx';
import { Loader2, AlertTriangle, X, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── Button ───────────────────────────────────────────────────────────────────
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}
export function Button({ variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';
  const variants = {
    primary:   'bg-brand-gradient text-white shadow-sm hover:opacity-90 focus:ring-brand-500',
    secondary: 'bg-white text-slate-700 border border-surface-border shadow-card hover:bg-slate-50 focus:ring-brand-500',
    danger:    'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500',
    ghost:     'text-slate-600 hover:bg-slate-100 focus:ring-slate-400',
  };
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' };
  return (
    <button className={clsx(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  leftIcon?: React.ReactNode;
}
export function Input({ label, error, leftIcon, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="w-full">
      {label && <label htmlFor={inputId} className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>}
      <div className="relative">
        {leftIcon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{leftIcon}</div>}
        <input
          id={inputId}
          className={clsx(
            'input',
            leftIcon && 'pl-9',
            error && 'border-red-400 focus:ring-red-400/30 focus:border-red-400',
            className
          )}
          {...props}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</p>}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string | number; label: string }[];
  placeholder?: string;
}
export function Select({ label, error, options, placeholder, className, id, ...props }: SelectProps) {
  const selectId = id ?? label?.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="w-full">
      {label && <label htmlFor={selectId} className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>}
      <select id={selectId} className={clsx('select', error && 'border-red-400', className)} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps { children: React.ReactNode; className?: string; noPadding?: boolean; }
export function Card({ children, className, noPadding }: CardProps) {
  return (
    <div className={clsx('bg-white rounded-2xl shadow-card border border-surface-border', !noPadding && 'p-6', className)}>
      {children}
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
interface ModalProps {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; footer?: React.ReactNode; size?: 'sm' | 'md' | 'lg';
}
export function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={clsx('w-full bg-white rounded-2xl shadow-dropdown flex flex-col max-h-[90vh] animate-slide-in', widths[size])}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border flex-shrink-0">
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-surface-border flex justify-end gap-3 flex-shrink-0 bg-slate-50/50 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}
// need useEffect inside component file
import { useEffect } from 'react';

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeColor = 'blue' | 'green' | 'amber' | 'red' | 'slate' | 'purple' | 'indigo';
interface BadgeProps { color?: BadgeColor; children: React.ReactNode; dot?: boolean; }
export function Badge({ color = 'blue', children, dot }: BadgeProps) {
  const colors: Record<BadgeColor, string> = {
    blue:   'bg-brand-50 text-brand-700',
    green:  'bg-emerald-50 text-emerald-700',
    amber:  'bg-amber-50 text-amber-700',
    red:    'bg-red-50 text-red-600',
    slate:  'bg-slate-100 text-slate-600',
    purple: 'bg-purple-50 text-purple-700',
    indigo: 'bg-indigo-50 text-indigo-700',
  };
  return (
    <span className={clsx('badge', colors[color])}>
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full mr-1', {
        'bg-brand-500': color === 'blue', 'bg-emerald-500': color === 'green',
        'bg-amber-500': color === 'amber', 'bg-red-500': color === 'red',
        'bg-slate-400': color === 'slate',
      })} />}
      {children}
    </span>
  );
}

// ─── Role Badge ───────────────────────────────────────────────────────────────
import type { Role } from '../../types';
export function RoleBadge({ role }: { role: Role }) {
  const map: Record<Role, { color: BadgeColor; label: string }> = {
    ADMIN:       { color: 'red',    label: 'Admin' },
    DEAN:        { color: 'purple', label: 'Dean' },
    HOD:         { color: 'amber',  label: 'HOD' },
    COORDINATOR: { color: 'blue',   label: 'Coordinator' },
    PROFESSOR:   { color: 'green',  label: 'Professor' },
  };
  const { color, label } = map[role] ?? { color: 'slate', label: role };
  return <Badge color={color}>{label}</Badge>;
}

// ─── Shimmer / Skeleton ───────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('shimmer rounded-xl', className)} />;
}
export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-container">
      <table className="table-base">
        <thead><tr>{Array.from({ length: cols }).map((_, i) => <th key={i}><Skeleton className="h-3 w-20" /></th>)}</tr></thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={i}>{Array.from({ length: cols }).map((_, j) => (
              <td key={j}><Skeleton className="h-4 w-full" /></td>
            ))}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
interface EmptyProps { icon?: string; title: string; subtitle?: string; action?: React.ReactNode; }
export function EmptyState({ icon = '📭', title, subtitle, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="text-5xl mb-4 opacity-40">{icon}</div>
      <div className="text-base font-semibold text-slate-700 mb-1">{title}</div>
      {subtitle && <p className="text-sm text-slate-400 mb-5 max-w-xs">{subtitle}</p>}
      {action}
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────
interface PaginationProps { page: number; pages: number; total: number; onPage: (p: number) => void; }
export function Pagination({ page, pages, total, onPage }: PaginationProps) {
  if (pages <= 1) return null;
  const items = Array.from({ length: Math.min(pages, 7) }, (_, i) => i + 1);
  return (
    <div className="flex items-center justify-between mt-4 px-1">
      <p className="text-xs text-slate-500">{total} total records</p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPage(page - 1)} disabled={page === 1}
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-surface-border hover:bg-slate-50 disabled:opacity-40 transition-colors">
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {items.map(n => (
          <button key={n} onClick={() => onPage(n)}
            className={clsx('w-7 h-7 text-xs font-semibold rounded-lg transition-colors', n === page
              ? 'bg-brand-gradient text-white'
              : 'border border-surface-border hover:bg-slate-50 text-slate-600')}>
            {n}
          </button>
        ))}
        <button onClick={() => onPage(page + 1)} disabled={page === pages}
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-surface-border hover:bg-slate-50 disabled:opacity-40 transition-colors">
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
interface ConfirmProps {
  open: boolean; onClose: () => void; onConfirm: () => void;
  title: string; message: React.ReactNode; confirmLabel?: string; loading?: boolean;
}
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', loading }: ConfirmProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" onClick={onConfirm} loading={loading}>{confirmLabel}</Button></>}>
      <div className="flex gap-4">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-red-500" />
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">{message}</p>
      </div>
    </Modal>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
interface ProgressProps { value: number; max?: number; color?: string; size?: 'sm' | 'md'; showLabel?: boolean; }
export function ProgressBar({ value, max = 100, color, size = 'sm', showLabel }: ProgressProps) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  const autoColor = pct > 85 ? 'bg-red-400' : pct > 70 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="flex items-center gap-2">
      <div className={clsx('flex-1 bg-slate-100 rounded-full overflow-hidden', size === 'sm' ? 'h-1.5' : 'h-2.5')}>
        <div className={clsx('h-full rounded-full transition-all duration-500', color ?? autoColor)} style={{ width: pct + '%' }} />
      </div>
      {showLabel && <span className="text-xs font-semibold text-slate-600 w-8 text-right">{pct}%</span>}
    </div>
  );
}

// ─── Page Header ─────────────────────────────────────────────────────────────
interface PageHeaderProps { title: string; subtitle?: string; actions?: React.ReactNode; }
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
interface StatCardProps { label: string; value: string | number; sub?: string; icon: React.ReactNode; accentClass?: string; }
export function StatCard({ label, value, sub, icon, accentClass }: StatCardProps) {
  return (
    <div className="relative bg-white rounded-2xl shadow-card border border-surface-border p-5 overflow-hidden">
      <div className={clsx('absolute top-0 left-0 right-0 h-0.5', accentClass ?? 'bg-brand-gradient')} />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">{label}</p>
          <p className="text-2xl font-bold text-slate-800 tracking-tight leading-none">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1.5">{sub}</p>}
        </div>
        <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-700 flex-shrink-0">
          {icon}
        </div>
      </div>
    </div>
  );
}

// ─── Corr ID tag ─────────────────────────────────────────────────────────────
export function CorrId({ id }: { id: string }) {
  return <span className="font-mono text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{id}</span>;
}
