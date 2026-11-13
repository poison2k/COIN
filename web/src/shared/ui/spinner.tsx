import { Loader2Icon } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

// Spinner aus der shadcn-CLI, nachbearbeitet (ADR-0036 Punkt 6): deutscher Name „Wird geladen“, `cn` aus
// @/shared/lib/cn. Im Button steht stattdessen ein Icon mit aria-hidden (button.tsx).
function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="Wird geladen"
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  )
}

export { Spinner }
