import { Checkbox as CheckboxPrimitive } from '@base-ui/react/checkbox'
import { CheckIcon, MinusIcon } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

// Checkbox aus der shadcn-CLI (Base UI), nachbearbeitet (ADR-0009, ADR-0036 Punkt 6): `cn` aus @/shared/lib/cn,
// Fokusring in voller Deckkraft, Zustand „unbestimmt“ mit eigenem Icon. Die Klickfläche (≥ 40 px) liefert die
// umgebende Beschriftung (`<label>`).
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative flex size-5 shrink-0 items-center justify-center rounded-sm border border-input bg-background transition-colors outline-none group-has-disabled/field:opacity-50 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-4"
      >
        <CheckIcon aria-hidden="true" className="in-data-indeterminate:hidden" />
        <MinusIcon aria-hidden="true" className="hidden in-data-indeterminate:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
