import { LogOutIcon } from 'lucide-react'
import { useAnmeldung } from '@/shared/lib/anmeldung'
import { Button } from '@/shared/ui/button'

export interface AbmeldenButtonProps {
  variant?: 'default' | 'outline' | 'ghost'
}

/** Meldet ab: entfernt den lokalen User und leitet zum Abmelden an den Identitätsanbieter (AK-31). */
export function AbmeldenButton({ variant = 'outline' }: AbmeldenButtonProps) {
  const { abmelden } = useAnmeldung()

  return (
    <Button type="button" variant={variant} onClick={() => void abmelden()}>
      <LogOutIcon aria-hidden="true" />
      Abmelden
    </Button>
  )
}
