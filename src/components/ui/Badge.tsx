import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeTone = 'sale' | 'new' | 'best' | 'light' | 'soft' | 'success';

const tones: Record<BadgeTone, string> = {
  sale: 'bg-wine text-ivory',
  new: 'bg-ink text-ivory',
  best: 'bg-ivory text-ink',
  light: 'bg-ivory text-wine',
  soft: 'bg-nude text-wine',
  success: 'bg-[#E4EDE3] text-[#2F5A3C]',
};

export function Badge({ tone = 'soft', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-[7px] text-[10px] font-medium uppercase leading-none tracking-[0.16em]', tones[tone], className)}>
      {children}
    </span>
  );
}
