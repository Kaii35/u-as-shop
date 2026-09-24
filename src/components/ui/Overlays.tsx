import type { ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn, useEscape, useLockBody } from '../../lib/utils';

export function Modal({ open, onClose, children, className, label }: {
  open: boolean; onClose: () => void; children: ReactNode; className?: string; label?: string;
}) {
  useLockBody(open);
  useEscape(open, onClose);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-3">
          <motion.div className="absolute inset-0 bg-ink/50" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={cn('relative max-h-[calc(100vh-24px)] w-full overflow-auto rounded-[20px] bg-ivory', className)}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

export function CloseButton({ onClick, className, label = 'Cerrar' }: { onClick: () => void; className?: string; label?: string }) {
  return (
    <button onClick={onClick} aria-label={label} className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ink/15 transition-colors hover:bg-nude', className)}>
      <X size={18} strokeWidth={1.5} />
    </button>
  );
}

/** Panel lateral o inferior (drawer / bottom sheet). */
export function Sheet({ open, onClose, side = 'right', children, className, label }: {
  open: boolean; onClose: () => void; side?: 'right' | 'left' | 'bottom'; children: ReactNode; className?: string; label?: string;
}) {
  useLockBody(open);
  useEscape(open, onClose);
  const offscreen = side === 'right' ? { x: '104%' } : side === 'left' ? { x: '-104%' } : { y: '105%' };
  const pos = {
    right: 'right-0 top-0 bottom-0 w-full sm:w-[460px] shadow-drawer',
    left: 'left-0 top-0 bottom-0 w-[min(360px,88vw)]',
    bottom: 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl',
  }[side];
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[100]">
          <motion.div className="absolute inset-0 bg-ink/40" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={label}
            className={cn('absolute flex flex-col overflow-hidden bg-ivory', pos, className)}
            initial={offscreen}
            animate={{ x: 0, y: 0 }}
            exit={offscreen}
            transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
          >
            {children}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Aparición suave al entrar en pantalla. */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, ease: [0.2, 0.7, 0.2, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
