import { Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { hatBerechtigung } from '@/entities/benutzer'
import { RueckrufSeite } from '@/pages/anmeldung-rueckruf'
import { BenutzerverwaltungSeite } from '@/pages/benutzerverwaltung'
import { CoinListeSeite } from '@/pages/coin-liste'
import { KeinZugriffSeite } from '@/pages/kein-zugriff'
import { ROUTEN } from '@/shared/config'
import { sicheresZiel, useAnmeldung } from '@/shared/lib/anmeldung'
import { AppShell } from '@/widgets/app-shell'
import { useBenutzerKontext } from '../anmeldung/benutzer-kontext'
import { NichtGefunden } from './Fehlerseiten'

// Routen-Komponenten in app: lesen Anmeldung und Benutzer und reichen sie als Props an Widgets und Seiten weiter.

export function ShellLayout() {
  const { zustand } = useBenutzerKontext()
  return (
    <AppShell benutzerZustand={zustand}>
      <Outlet />
    </AppShell>
  )
}

/** Unbekannte Pfade: 404 wie bisher innerhalb der App-Shell. */
export function NichtGefundenInShell() {
  const { zustand } = useBenutzerKontext()
  return (
    <AppShell benutzerZustand={zustand}>
      <NichtGefunden />
    </AppShell>
  )
}

export function CoinListeRoute() {
  const { erfassen } = useBenutzerKontext()
  return <CoinListeSeite erfassen={erfassen} />
}

export function KeinZugriffRoute() {
  const { zustand, benutzer } = useBenutzerKontext()
  if (zustand.art === 'deaktiviert') return <KeinZugriffSeite grund="deaktiviert" />
  return benutzer?.rolle === 'keine' ? <KeinZugriffSeite grund="keineRolle" benutzer={benutzer} /> : null
}

/** Benutzerverwaltung mit der eigenen Id aus /api/me (AK-29). Ohne users.manage (z. B. nach Deaktivierung) leer. */
export function BenutzerverwaltungRoute() {
  const { benutzer } = useBenutzerKontext()
  return benutzer && hatBerechtigung(benutzer, 'users.manage') ? (
    <BenutzerverwaltungSeite aktuellerBenutzerId={benutzer.id} />
  ) : null
}

/** Nach dem Rückruf: ohne Rolle oder deaktiviert nach /kein-zugriff, sonst zum (geprüften) Ausgangspfad (AK-24). */
export function RueckrufRoute() {
  const anmeldung = useAnmeldung()
  const { zustand } = useBenutzerKontext()
  const navigate = useNavigate()
  const ziel = sicheresZiel(anmeldung.rueckkehrZiel)

  useEffect(() => {
    if (zustand.art === 'deaktiviert' || (zustand.art === 'angemeldet' && zustand.benutzer.rolle === 'keine')) {
      void navigate({ to: ROUTEN.keinZugriff, replace: true })
    } else if (zustand.art === 'angemeldet' || zustand.art === 'fehler') {
      void navigate({ href: ziel, replace: true })
    }
  }, [zustand, ziel, navigate])

  const fehlgeschlagen =
    anmeldung.rueckrufFehlgeschlagen || zustand.art === 'anonym' || zustand.art === 'nichtKonfiguriert'
  return <RueckrufSeite zustand={fehlgeschlagen ? 'fehlgeschlagen' : 'laeuft'} />
}
