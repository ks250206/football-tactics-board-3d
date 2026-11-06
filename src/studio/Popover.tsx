import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../Icon';

/** A non-modal toolbar panel: it must not resize or remount either viewport. */
export function Popover({ label, icon, children, align = 'right' }: {
  label: string; icon: string; children: ReactNode; align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<CSSProperties>({});
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = trigger.current!.getBoundingClientRect(), width = Math.min(300, window.innerWidth - 24);
      setPosition({ position: 'fixed', width, left: Math.max(12, Math.min(window.innerWidth - width - 12, align === 'left' ? r.left : r.right - width)), top: r.bottom + 6, maxHeight: Math.max(100, window.innerHeight - r.bottom - 18) });
    };
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open, align]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);
  return <div className={`studio-popover align-${align}`} ref={root} onBlur={e => {
    if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
  }}>
    <button ref={trigger} className={`button secondary small ${open ? 'active' : ''}`}
      aria-label={label} aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <Icon name={icon} size={15}/><span>{label}</span>
    </button>
    {open && <section className="studio-popover-content" aria-label={label} style={position}>
      <div className="popover-title"><strong>{label}</strong><button className="icon-button"
        aria-label={`${label}を閉じる`} onClick={() => { setOpen(false); trigger.current?.focus(); }}><Icon name="close" size={16}/></button></div>
      {children}
    </section>}
  </div>;
}
