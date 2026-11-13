import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2Icon } from 'lucide-react'
import { Children, isValidElement, type ReactNode } from 'react'
import { cn } from '@/shared/lib/cn'

// Button (design-fundament, Abschnitt 5, AK-10): default = primär, outline = sekundär, destructive = gefährlich,
// ghost = Text; secondary und link bleiben für den Bestand. Alle Größen sind mindestens 40 × 40 px (D9).
const buttonVariantenRoh = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-busy:cursor-progress aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary-hover',
        outline:
          'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground',
        ghost:
          'text-foreground hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        link: 'text-primary underline underline-offset-4 hover:text-primary-hover',
      },
      size: {
        default: 'h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        sm: 'h-10 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2',
        lg: 'h-12 gap-2 px-6 text-base has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5',
        icon: 'size-10',
        // Aliase aus dem Bestand; keine Größe unter 40 × 40 px (D9).
        xs: 'h-10 gap-1 px-3 text-xs',
        'icon-xs': 'size-10',
        'icon-sm': 'size-10',
        'icon-lg': 'size-12',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

/**
 * Klassen eines Buttons, auch für Links im Button-Stil. Über `cn` zusammengeführt, damit z. B. der Rahmen der Variante
 * `outline` den transparenten Grundrahmen ersetzt (sonst entschiede die Reihenfolge im CSS).
 */
function buttonVariants(...args: Parameters<typeof buttonVariantenRoh>): string {
  return cn(buttonVariantenRoh(...args))
}

type ButtonProps = ButtonPrimitive.Props &
  VariantProps<typeof buttonVariantenRoh> & {
    /**
     * Ladezustand: Spinner statt Start-Icon, Beschriftung bleibt, `aria-busy`, gesperrt per `aria-disabled` (der Fokus
     * bleibt auf dem Button), Klicks werden verworfen.
     */
    laedt?: boolean
  }

/** Entfernt ein führendes Icon (erste Komponente unter den Kindern), damit der Spinner seinen Platz einnimmt. */
function ohneStartIcon(children: ReactNode): ReactNode {
  const kinder = Children.toArray(children)
  const [erstes, ...rest] = kinder
  return isValidElement(erstes) && typeof erstes.type !== 'string' ? rest : kinder
}

function Button({
  className,
  variant = 'default',
  size = 'default',
  laedt = false,
  disabled,
  focusableWhenDisabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={laedt || disabled}
      focusableWhenDisabled={laedt || focusableWhenDisabled}
      aria-busy={laedt ? true : undefined}
      {...props}
    >
      {laedt ? (
        <>
          <Loader2Icon aria-hidden="true" className="animate-spin" />
          {ohneStartIcon(children)}
        </>
      ) : (
        children
      )}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
export type { ButtonProps }
