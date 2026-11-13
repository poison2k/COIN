import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, TriangleAlertIcon, type LucideIcon } from 'lucide-react'
import { cn } from '@/shared/lib/cn'

// Hinweisbanner (design-fundament, Abschnitt 5, AK-18): je Statusvariante ein festes Icon (aria-hidden), die Bedeutung
// trägt der Titeltext. Die Rolle bleibt standardmäßig `alert` und ist überschreibbar (z. B. `status`).
const alertVariants = cva(
  "group/alert relative grid w-full gap-0.5 rounded-lg border px-4 py-3 text-left text-sm has-data-[slot=alert-action]:relative has-data-[slot=alert-action]:pr-18 has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-3 *:[svg]:row-span-2 *:[svg]:translate-y-0.5 *:[svg]:text-current *:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground',
        info: 'border-info bg-info-subtle text-info *:data-[slot=alert-description]:text-foreground',
        success: 'border-success bg-success-subtle text-success *:data-[slot=alert-description]:text-foreground',
        warning: 'border-warning bg-warning-subtle text-warning *:data-[slot=alert-description]:text-foreground',
        destructive:
          'border-destructive bg-destructive-subtle text-destructive *:data-[slot=alert-description]:text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

type AlertVariante = NonNullable<VariantProps<typeof alertVariants>['variant']>

const ICONS: Readonly<Record<AlertVariante, LucideIcon | null>> = {
  default: null,
  info: InfoIcon,
  success: CircleCheckIcon,
  warning: TriangleAlertIcon,
  destructive: CircleAlertIcon,
}

function Alert({
  className,
  variant,
  children,
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  const Icon = ICONS[variant ?? 'default']
  return (
    <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props}>
      {Icon && <Icon aria-hidden="true" />}
      {children}
    </div>
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        'font-semibold group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground',
        className,
      )}
      {...props}
    />
  )
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        'text-sm text-balance text-muted-foreground group-has-[>svg]/alert:col-start-2 md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4',
        className,
      )}
      {...props}
    />
  )
}

function AlertAction({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-action" className={cn('absolute top-2 right-2', className)} {...props} />
}

export { Alert, AlertTitle, AlertDescription, AlertAction }
