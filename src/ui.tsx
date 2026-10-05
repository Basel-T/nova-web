// ============================================================
// ui.tsx — Shared UI kit ("midnight & brass" design system)
// ============================================================
// Buttons, cards, avatars, bottom sheets, confirm dialogs, toasts,
// segmented controls, date strip, bottom navigation…
// Overlays render through portals so page animations never offset them.
// ============================================================

import {
  Fragment,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type ComponentType,
  type SelectHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ChevronDown, Info, Loader2, Scissors, X } from 'lucide-react';
import type { AppointmentStatus } from './types';
import { parseDate, WEEKDAYS_SHORT } from './lib/time';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ============================================================
// BUTTONS
// ============================================================

type Variant = 'gold' | 'dark' | 'outline' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  gold:
    'bg-gradient-to-b from-gold-300 to-gold-500 text-ink-950 font-semibold ' +
    'shadow-[0_10px_30px_-10px_rgba(201,161,90,0.6),inset_0_1px_0_rgba(255,255,255,0.5)] ' +
    'hover:from-gold-200 hover:to-gold-400',
  dark: 'bg-ink-800 text-cream border border-white/[0.08] hover:bg-ink-700',
  outline: 'border border-white/[0.12] text-cream hover:bg-white/[0.05]',
  ghost: 'text-ink-300 hover:text-cream hover:bg-white/[0.05]',
  danger: 'bg-rose-500/10 text-rose-200 border border-rose-400/20 hover:bg-rose-500/15',
  subtle: 'bg-white/[0.06] text-cream hover:bg-white/[0.1]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[13px] rounded-xl gap-1.5',
  md: 'h-11 px-5 text-sm rounded-2xl gap-2',
  lg: 'h-14 px-6 text-[15px] rounded-2xl gap-2',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = 'dark', size = 'md', loading, icon, children, className, disabled, ...rest }: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center font-medium tracking-[-0.01em] transition-all duration-200',
        'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-400/60',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx(
        'grid size-10 shrink-0 place-items-center rounded-full text-ink-300 transition-colors',
        'hover:bg-white/[0.06] hover:text-cream active:scale-95 disabled:opacity-40',
        className
      )}
    >
      {children}
    </button>
  );
}

// ============================================================
// SURFACES & TYPOGRAPHY
// ============================================================

export function Card({ className, children, onClick }: { className?: string; children: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={cx(
        'block w-full rounded-3xl border border-white/[0.07] bg-ink-900/80 text-left',
        'shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]',
        onClick && 'transition-all hover:border-white/[0.12] hover:bg-ink-850 active:scale-[0.99]',
        className
      )}
    >
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex items-end justify-between gap-3', className)}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-400">{children}</h2>
      {action}
    </div>
  );
}

/** Shop name in the display serif, with a brass italic "&" */
export function Wordmark({ name, className }: { name: string; className?: string }) {
  const parts = name.split('&');
  return (
    <span className={cx('font-display leading-none tracking-[-0.01em] text-cream', className)}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="text-brass mx-[0.16em] italic">&amp;</span>}
          {p.trim()}
        </Fragment>
      ))}
    </span>
  );
}

export function LogoMark({ size = 56 }: { size?: number }) {
  return (
    <div
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-full bg-gradient-to-b from-gold-200 via-gold-400 to-gold-700 p-[1.5px] shadow-[0_12px_40px_-12px_rgba(201,161,90,0.7)]"
    >
      <div className="grid size-full place-items-center rounded-full bg-ink-950">
        <Scissors className="text-gold-300" style={{ width: size * 0.4, height: size * 0.4 }} strokeWidth={1.4} />
      </div>
    </div>
  );
}

// ============================================================
// AVATARS & PHOTOS
// ============================================================

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/** Round/rounded avatar: photo, or brass initials when there's no photo */
export function Avatar({
  name,
  src,
  size = 44,
  className = 'rounded-full',
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        style={{ width: size, height: size }}
        className={cx('shrink-0 bg-ink-800 object-cover', className)}
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size, fontSize: Math.max(12, size * 0.4) }}
      className={cx(
        'grid shrink-0 place-items-center border border-gold-500/25 bg-gradient-to-br from-ink-700 to-ink-900 font-display text-gold-300',
        className
      )}
      aria-hidden
    >
      {initialsOf(name)}
    </div>
  );
}

/** 4:5 portrait photo used on barber cards */
export function Portrait({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <div className={cx('relative aspect-[4/5] overflow-hidden bg-ink-800', className)}>
      {src ? (
        <img src={src} alt={name} loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-ink-700 via-ink-800 to-ink-950">
          <span className="font-display text-5xl text-gold-300/90">{initialsOf(name)}</span>
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
    </div>
  );
}

// ============================================================
// STATUS
// ============================================================

export const STATUS_META: Record<AppointmentStatus, { label: string; cls: string; dot: string }> = {
  pending: { label: 'Pending', cls: 'text-amber-200 bg-amber-400/10 ring-amber-300/25', dot: 'bg-amber-300' },
  booked: { label: 'Confirmed', cls: 'text-emerald-200 bg-emerald-400/10 ring-emerald-300/25', dot: 'bg-emerald-300' },
  completed: { label: 'Completed', cls: 'text-sky-200 bg-sky-400/10 ring-sky-300/25', dot: 'bg-sky-300' },
  cancelled: { label: 'Cancelled', cls: 'text-rose-200 bg-rose-400/10 ring-rose-300/25', dot: 'bg-rose-300' },
  no_show: { label: 'No-show', cls: 'text-orange-200 bg-orange-400/10 ring-orange-300/25', dot: 'bg-orange-300' },
};

export function StatusPill({ status }: { status: AppointmentStatus }) {
  const m = STATUS_META[status];
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset',
        m.cls
      )}
    >
      <span className={cx('size-1.5 rounded-full', m.dot)} />
      {m.label}
    </span>
  );
}

// ============================================================
// FORM CONTROLS
// ============================================================

export const inputCls =
  'w-full h-12 rounded-2xl border border-white/[0.09] bg-white/[0.03] px-4 text-[15px] text-cream ' +
  'placeholder:text-ink-500 outline-none transition ' +
  'focus:border-gold-500/60 focus:bg-white/[0.05] focus:ring-4 focus:ring-gold-500/10';

export const textareaCls = inputCls.replace('h-12', 'min-h-[88px] py-3 resize-none');

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-ink-500">{hint}</span>}
    </label>
  );
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx('relative', className)}>
      <select {...rest} className={cx(inputCls, 'appearance-none pr-10')}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center gap-4 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-cream">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] text-ink-400">{description}</span>}
      </span>
      <span
        className={cx(
          'relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-gold-500' : 'bg-ink-600'
        )}
      >
        <span
          className={cx(
            'absolute top-1 size-5 rounded-full bg-white shadow transition-all duration-200',
            checked ? 'left-6' : 'left-1'
          )}
        />
      </span>
    </button>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cx('flex rounded-2xl border border-white/[0.06] bg-white/[0.03] p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'h-9 flex-1 whitespace-nowrap rounded-xl px-2 text-[13px] font-medium transition-all duration-200',
            value === o.value ? 'bg-cream text-ink-950 shadow-sm' : 'text-ink-300 hover:text-cream'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Horizontally scrolling filter chips */
export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode; lead?: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium transition-all',
            value === o.value
              ? 'border-gold-400/50 bg-gold-400/10 text-gold-200'
              : 'border-white/[0.08] bg-white/[0.02] text-ink-300 hover:text-cream'
          )}
        >
          {o.lead}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// LAYOUT
// ============================================================

export function AppHeader({
  left,
  right,
  wide = false,
}: {
  left: ReactNode;
  right?: ReactNode;
  wide?: boolean;
}) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-white/[0.05] bg-ink-950/75 backdrop-blur-xl"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className={cx(wide ? 'max-w-3xl' : 'max-w-lg', 'mx-auto flex h-16 items-center gap-3 px-4')}>
        <div className="min-w-0 flex-1">{left}</div>
        {right}
      </div>
    </header>
  );
}

export interface NavItem<T extends string> {
  key: T;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  badge?: number;
}

export function BottomNav<T extends string>({
  items,
  value,
  onChange,
}: {
  items: NavItem<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return createPortal(
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-ink-950/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg">
        {items.map(({ key, label, icon: Icon, badge }) => {
          const active = key === value;
          return (
            <button
              key={key}
              onClick={() => onChange(key)}
              className={cx(
                'relative flex h-16 flex-1 flex-col items-center justify-center gap-1 transition-colors',
                active ? 'text-gold-300' : 'text-ink-400 hover:text-ink-200'
              )}
            >
              {active && <span className="absolute top-0 h-0.5 w-8 rounded-full bg-gold-400" />}
              <span className="relative">
                <Icon className="size-[22px]" strokeWidth={active ? 1.9 : 1.6} />
                {!!badge && (
                  <span className="tnum absolute -right-2.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-gold-400 px-1 text-[10px] font-bold text-ink-950">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </span>
              <span className="text-[10.5px] font-medium tracking-wide">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>,
    document.body
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
  className,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  text?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-10 text-center', className)}>
      <div className="mb-4 grid size-14 place-items-center rounded-full border border-white/[0.08] bg-white/[0.03]">
        <Icon className="size-6 text-gold-300" strokeWidth={1.5} />
      </div>
      <p className="font-medium text-cream">{title}</p>
      {text && <p className="mt-1 max-w-xs text-sm text-ink-400">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function LoadingScreen({ message }: { message: string }) {
  return (
    <div className="page-glow flex min-h-dvh flex-col items-center justify-center gap-5">
      <div className="animate-pulse">
        <LogoMark size={64} />
      </div>
      <p className="text-sm tracking-wide text-ink-400">{message}</p>
    </div>
  );
}

// ============================================================
// DATE STRIP
// ============================================================

export interface DateItem {
  date: string;
  disabled?: boolean;
  note?: string;      // small text under the number, e.g. "Off"
  marked?: boolean;   // small brass dot (e.g. has bookings)
}

export function DateStrip({
  items,
  value,
  onChange,
}: {
  items: DateItem[];
  value: string;
  onChange: (date: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Keep the selected day in view without scrolling the page
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-date="${value}"]`);
    const box = ref.current;
    if (el && box) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: 'smooth' });
  }, [value]);

  return (
    <div ref={ref} className="scrollbar-hide -mx-4 flex gap-2 overflow-x-auto px-4 py-1">
      {items.map((d) => {
        const dt = parseDate(d.date);
        const selected = d.date === value;
        return (
          <button
            key={d.date}
            data-date={d.date}
            type="button"
            disabled={d.disabled}
            onClick={() => onChange(d.date)}
            className={cx(
              'relative flex h-[78px] w-[58px] shrink-0 flex-col items-center justify-center rounded-2xl border transition-all duration-200',
              selected
                ? 'border-transparent bg-cream text-ink-950 shadow-[0_8px_24px_-8px_rgba(244,239,230,0.35)]'
                : 'border-white/[0.07] bg-white/[0.02] text-cream hover:border-white/15',
              d.disabled && 'opacity-35'
            )}
          >
            <span className={cx('text-[10px] font-semibold uppercase tracking-[0.12em]', selected ? 'text-ink-600' : 'text-ink-400')}>
              {WEEKDAYS_SHORT[dt.getDay()]}
            </span>
            <span className="tnum mt-0.5 text-[20px] font-semibold leading-none">{dt.getDate()}</span>
            <span className={cx('mt-1 h-3 text-[9.5px] font-medium', selected ? 'text-ink-600' : 'text-ink-500')}>
              {d.note ?? dt.toLocaleDateString('en-US', { month: 'short' })}
            </span>
            {d.marked && !selected && <span className="absolute right-2 top-2 size-1.5 rounded-full bg-gold-400" />}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// SHEET (bottom sheet on phones, centered modal on desktop)
// ============================================================

function useLockScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [active]);
}

export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useLockScroll(open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="animate-fade absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="animate-sheet relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] border border-white/[0.08] bg-ink-900 shadow-2xl sm:max-w-lg sm:rounded-[28px]"
      >
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/15 sm:hidden" />
        <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-[28px] leading-tight text-cream">{title}</h3>
            {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
          </div>
          <IconButton label="Close" onClick={onClose} className="-mr-2 -mt-1">
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-white/[0.06] p-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

// ============================================================
// CONFIRM DIALOG — await confirmDialog({...}) → true / false
// ============================================================

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

let dialogState: (ConfirmOptions & { resolve: (v: boolean) => void }) | null = null;
const dialogListeners = new Set<() => void>();
const notifyDialog = () => dialogListeners.forEach((l) => l());

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    dialogState?.resolve(false);
    dialogState = { ...options, resolve };
    notifyDialog();
  });
}

export function DialogHost() {
  const d = useSyncExternalStore(
    (l) => {
      dialogListeners.add(l);
      return () => dialogListeners.delete(l);
    },
    () => dialogState
  );
  useLockScroll(!!d);
  if (!d) return null;
  const close = (v: boolean) => {
    d.resolve(v);
    dialogState = null;
    notifyDialog();
  };
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
      <div className="animate-fade absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => close(false)} />
      <div role="alertdialog" aria-modal="true" className="animate-pop relative w-full max-w-sm rounded-[28px] border border-white/[0.08] bg-ink-900 p-6 shadow-2xl">
        <div
          className={cx(
            'mb-4 grid size-11 place-items-center rounded-full',
            d.destructive ? 'bg-rose-500/10 text-rose-300' : 'bg-gold-400/10 text-gold-300'
          )}
        >
          {d.destructive ? <AlertTriangle className="size-5" /> : <Info className="size-5" />}
        </div>
        <h3 className="font-display text-2xl leading-tight text-cream">{d.title}</h3>
        {d.message && <p className="mt-2 text-sm leading-relaxed text-ink-300">{d.message}</p>}
        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <Button variant="outline" onClick={() => close(false)}>
            {d.cancelText ?? 'Keep'}
          </Button>
          <Button variant={d.destructive ? 'danger' : 'gold'} onClick={() => close(true)} autoFocus>
            {d.confirmText ?? 'Confirm'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ============================================================
// TOASTS — toast('Saved') / toast('Oops', 'error')
// ============================================================

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

let toasts: ToastItem[] = [];
const toastListeners = new Set<() => void>();
const notifyToasts = () => toastListeners.forEach((l) => l());

export function toast(message: string, kind: ToastKind = 'success'): void {
  const id = Date.now() + Math.random();
  toasts = [...toasts.slice(-2), { id, message, kind }];
  notifyToasts();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    notifyToasts();
  }, kind === 'error' ? 4500 : 3000);
}

export function Toaster() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts
  );
  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-4 pt-3"
      style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
    >
      {list.map((t) => (
        <div
          key={t.id}
          role="status"
          className="animate-toast pointer-events-auto flex max-w-sm items-center gap-3 rounded-2xl border border-white/10 bg-ink-850/95 px-4 py-3 text-sm text-cream shadow-2xl backdrop-blur-xl"
        >
          <span
            className={cx(
              'grid size-6 shrink-0 place-items-center rounded-full',
              t.kind === 'success' && 'bg-emerald-400/15 text-emerald-300',
              t.kind === 'error' && 'bg-rose-400/15 text-rose-300',
              t.kind === 'info' && 'bg-gold-400/15 text-gold-300'
            )}
          >
            {t.kind === 'success' ? <Check className="size-3.5" /> : t.kind === 'error' ? <X className="size-3.5" /> : <Info className="size-3.5" />}
          </span>
          {t.message}
        </div>
      ))}
    </div>,
    document.body
  );
}
