import type { ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

/** Überschriftenebene der Startseite: 1 auf `/`, 2 in der Vorschau (AK-21, AK-29); Blöcke eine Ebene tiefer. */
export type Ebene = 1 | 2 | 3

export interface UeberschriftProps {
  ebene: Ebene
  id?: string
  className?: string
  children: ReactNode
}

export function Ueberschrift({ ebene, id, className, children }: UeberschriftProps) {
  const Tag = ebene === 1 ? 'h1' : ebene === 2 ? 'h2' : 'h3'
  return (
    <Tag id={id} className={cn('font-semibold', className)}>
      {children}
    </Tag>
  )
}
