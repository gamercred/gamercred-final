import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export default function Panel({
  children,
  className,
  variant = 'cyan',
}: {
  children: ReactNode;
  className?: string;
  variant?: 'cyan' | 'magenta';
}) {
  return (
    <div className={cn('panel', variant === 'magenta' && 'panel-mag', 'p-4', className)}>
      <span className="corner-tl" />
      <span className="corner-tr" />
      <span className="corner-bl" />
      <span className="corner-br" />
      {children}
    </div>
  );
}
