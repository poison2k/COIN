import * as React from 'react'
import { cn } from '@/shared/lib/cn'

/**
 * Meldet, ob der Container horizontal scrollt. Nur dann ist er per Tastatur fokussierbar (WCAG 2.1.1, axe
 * „scrollable-region-focusable“); sonst entsteht kein zusätzlicher Tab-Stopp.
 */
function useScrolltHorizontal(ref: React.RefObject<HTMLDivElement | null>): boolean {
  const [scrollt, setScrollt] = React.useState(false)
  React.useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return undefined
    const pruefen = () => setScrollt(element.scrollWidth > element.clientWidth)
    pruefen()
    const beobachter = new ResizeObserver(pruefen)
    beobachter.observe(element)
    if (element.firstElementChild) beobachter.observe(element.firstElementChild)
    return () => beobachter.disconnect()
  }, [ref])
  return scrollt
}

function Table({ className, ...props }: React.ComponentProps<'table'>) {
  const container = React.useRef<HTMLDivElement>(null)
  const scrollt = useScrolltHorizontal(container)
  return (
    <div
      ref={container}
      data-slot="table-container"
      tabIndex={scrollt ? 0 : undefined}
      className="relative w-full overflow-x-auto rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <table data-slot="table" className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn('[&_tr]:border-b', className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn('[&_tr:last-child]:border-0', className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted',
        className,
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption data-slot="table-caption" className={cn('mt-4 text-sm text-muted-foreground', className)} {...props} />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
