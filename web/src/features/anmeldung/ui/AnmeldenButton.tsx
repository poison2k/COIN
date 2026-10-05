import { useRouterState } from '@tanstack/react-router'
import { LogInIcon } from 'lucide-react'
import { useAnmeldung } from '@/shared/lib/anmeldung'
import { Button } from '@/shared/ui/button'

export interface AnmeldenButtonProps {
  /** Rückkehrziel nach der Anmeldung; Standard ist der aktuelle Pfad samt Query (AK-24). */
  ziel?: string
  beschriftung?: string
  variant?: 'default' | 'outline'
}

/**
 * Startet die Anmeldung beim Identitätsanbieter (AK-24, AK-30). Ohne Konfiguration steht statt des Buttons der
 * Hinweis „Anmeldung ist nicht konfiguriert.“ (AK-23).
 */
export function AnmeldenButton({ ziel, beschriftung = 'Anmelden', variant = 'default' }: AnmeldenButtonProps) {
  const { status, anmelden } = useAnmeldung()
  const aktuellerPfad = useRouterState({ select: (zustand) => zustand.location.href })

  if (status === 'nichtKonfiguriert') {
    return <p className="text-sm text-muted-foreground">Anmeldung ist nicht konfiguriert.</p>
  }

  return (
    <Button type="button" variant={variant} onClick={() => void anmelden(ziel ?? aktuellerPfad)}>
      <LogInIcon aria-hidden="true" />
      {beschriftung}
    </Button>
  )
}
