import { useState, type MouseEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Maximize2 } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Product } from '../types';
import { getBadge } from './ProductCard';
import { CloseButton, Modal } from './ui/Overlays';
import { Badge, Img } from './ui/Primitives';

const SLOTS = 4;

export function ProductGallery({ product }: { product: Product }) {
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');
  const [hover, setHover] = useState(false);
  const images = Array.from({ length: Math.max(SLOTS, product.images.length) }, (_, i) => product.images[i]);
  const badge = getBadge(product);
  const current = images[active];

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <div className="flex min-w-0 flex-[1_1_520px] flex-col-reverse gap-3.5 sm:flex-row">
      <div className="flex gap-2.5 sm:flex-col">
        {images.map((src, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            aria-label={`Imagen ${i + 1}`}
            aria-current={i === active}
            className={cn('h-[94px] w-[76px] overflow-hidden rounded border-[1.5px] p-[3px] transition-colors', i === active ? 'border-wine' : 'border-transparent')}
          >
            <span className="block h-full w-full overflow-hidden rounded-sm"><Img src={src} /></span>
          </button>
        ))}
      </div>
      <div
        className={cn('relative aspect-[4/5] flex-1 overflow-hidden rounded bg-nude', current && 'cursor-zoom-in')}
        onMouseMove={onMove}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={() => current && setZoom(true)}
      >
        <AnimatePresence mode="wait">
          <motion.div key={active} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
            <div className="h-full w-full transition-transform duration-300" style={{ transformOrigin: origin, transform: hover && current ? 'scale(1.8)' : 'none' }}>
              <Img src={current} alt={product.name} label="Foto del producto" />
            </div>
          </motion.div>
        </AnimatePresence>
        {badge && <Badge tone={badge.tone} className="pointer-events-none absolute left-4 top-4">{badge.label}</Badge>}
        <button
          onClick={(e) => { e.stopPropagation(); setZoom(true); }}
          className="absolute bottom-4 right-4 flex h-11 items-center gap-2 rounded-full bg-ivory/95 px-4 text-[11px] font-medium uppercase tracking-[.14em]"
        >
          <Maximize2 size={16} strokeWidth={1.5} /> Ampliar
        </button>
      </div>
      <Modal open={zoom} onClose={() => setZoom(false)} className="max-w-[min(90vw,800px)] bg-nude" label="Imagen ampliada">
        <div className="relative aspect-[4/5] w-full"><Img src={current} alt={product.name} label="Foto del producto" /></div>
        <CloseButton onClick={() => setZoom(false)} className="absolute right-4 top-4 bg-ivory" />
      </Modal>
    </div>
  );
}
