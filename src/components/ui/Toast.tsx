import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { useStore } from '../../store/StoreContext';

export function ToastViewport() {
  const { toast, openCart, dismissToast } = useStore();
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed bottom-[88px] right-3 z-[140] md:bottom-7 md:right-7">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
            className="pointer-events-auto flex w-[min(380px,calc(100vw-24px))] items-center gap-3.5 rounded-[18px] bg-ink py-3.5 pl-4 pr-3.5 text-ivory shadow-soft"
          >
            <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-blush text-wine">
              <Check size={15} strokeWidth={2} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium">{toast.title}</span>
              {toast.description && <span className="truncate text-[12.5px] font-light text-blush">{toast.description}</span>}
            </span>
            {toast.action === 'cart' && (
              <button
                onClick={() => { dismissToast(); openCart(); }}
                className="h-9 shrink-0 rounded-full border border-ivory/35 px-3.5 text-[10.5px] font-medium uppercase tracking-[.14em] hover:bg-ivory hover:text-ink"
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
