import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useStore } from '../../store/StoreContext';

export function ToastViewport() {
  const { toast, openCart, dismissToast } = useStore();
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-[76px] right-3 z-[140] md:bottom-5 md:right-5">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.25, ease: [0.2, 0.7, 0.3, 1] }}
            className="pointer-events-auto flex w-[min(360px,calc(100vw-24px))] items-center gap-3 rounded-lg bg-ink py-2.5 pl-3 pr-2.5 text-white shadow-pop"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-clay text-white">
              <Check size={14} strokeWidth={2.5} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-body font-medium">{toast.title}</span>
              {toast.description && <span className="truncate text-cap text-white/65">{toast.description}</span>}
            </span>
            {toast.action === 'cart' && (
              <button
                onClick={() => { dismissToast(); openCart(); }}
                className="h-8 shrink-0 cursor-pointer rounded border border-white/25 px-2.5 text-cap font-medium transition-colors hover:bg-white hover:text-ink"
              >
                Ver carrito
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
