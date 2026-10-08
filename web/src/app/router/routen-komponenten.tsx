import { getRouteApi, Outlet, useLocation, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import type { Coin } from '@/entities/coin'
import { hatBerechtigung } from '@/entities/benutzer'
import { RueckrufSeite } from '@/pages/anmeldung-rueckruf'
import { BenutzerverwaltungSeite } from '@/pages/benutzerverwaltung'
import { CoinAnlegenSeite } from '@/pages/coin-anlegen'
import { CoinDetailSeite, type CoinAngelegtMeldung } from '@/pages/coin-detail'
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

const katalogApi = getRouteApi('/shell/coins')
const coinDetailApi = getRouteApi('/shell/coins/$coinId')
const keinZugriffApi = getRouteApi('/shell/kein-zugriff')

/** Katalog: Suche und Seite stehen in der URL (katalog-seiten, AK-14); eine neue Suche beginnt auf Seite 1. */
export function CoinListeRoute() {
  const { benutzer } = useBenutzerKontext()
  const { suche = '', seite = 1 } = katalogApi.useSearch()
  const navigate = katalogApi.useNavigate()

  const onSuche = useCallback(
    (neu: string) => {
      const begriff = neu.trim()
      void navigate({ search: begriff === '' ? {} : { suche: begriff } })
    },
    [navigate],
  )
  const onSeite = useCallback(
    (neu: number) => {
      // Blättern behält die Scroll-Position, damit der fokussierte Button sichtbar bleibt (QA Runde 2, N1).
      void navigate({ search: (alt) => ({ ...alt, seite: neu > 1 ? neu : undefined }), resetScroll: false })
    },
    [navigate],
  )

  return (
    <CoinListeSeite
      suche={suche}
      seite={seite}
      darfAnlegen={hatBerechtigung(benutzer, 'coins.write')}
      onSuche={onSuche}
      onSeite={onSeite}
    />
  )
}

/**
 * „Coin hinzufügen“ nur mit coins.write (wie BenutzerverwaltungRoute). Nach dem Anlegen ersetzt die Detailseite das
 * Formular im Verlauf; die Meldung reist als fester Schlüssel im History-State (katalog-seiten, AK-22/AK-23).
 */
export function CoinAnlegenRoute() {
  const { benutzer } = useBenutzerKontext()
  const navigate = useNavigate()

  const onAngelegt = useCallback(
    (coin: Coin, { bild }: { bild: 'gespeichert' | 'ohne' }) => {
      void navigate({
        to: ROUTEN.coinDetail,
        params: { coinId: coin.id },
        replace: true,
        state: { coinAngelegt: bild === 'gespeichert' ? 'mitBild' : 'ohneBild' },
      })
    },
    [navigate],
  )

  return hatBerechtigung(benutzer, 'coins.write') ? <CoinAnlegenSeite onAngelegt={onAngelegt} /> : null
}

/**
 * Detailseite. Die Meldung nach dem Anlegen wird einmal aus dem History-State gelesen und danach aus dem Verlaufseintrag
 * entfernt, damit sie nach dem Neuladen nicht wieder erscheint (katalog-seiten, AK-22).
 */
export function CoinDetailRoute() {
  const { coinId } = coinDetailApi.useParams()
  const coinAngelegt = useLocation({ select: (ort) => ort.state.coinAngelegt })
  const navigate = useNavigate()
  const [gemerkt, setGemerkt] = useState<{ coinId: string; meldung: CoinAngelegtMeldung } | null>(null)

  if (coinAngelegt && (gemerkt?.coinId !== coinId || gemerkt.meldung !== coinAngelegt)) {
    setGemerkt({ coinId, meldung: coinAngelegt })
  }

  useEffect(() => {
    if (!coinAngelegt) return
    void navigate({ to: ROUTEN.coinDetail, params: { coinId }, replace: true, state: {} })
  }, [coinAngelegt, coinId, navigate])

  const meldung = gemerkt?.coinId === coinId ? gemerkt.meldung : undefined
  return <CoinDetailSeite coinId={coinId} meldung={meldung} />
}

/**
 * /kein-zugriff: ohne Rolle oder deaktiviert mit „Erneut prüfen“ (Rev. 3, AK-41/AK-42), dieselbe Seite, damit der Fokus
 * beim Wechsel des Grunds erhalten bleibt. Mit Rolle nur nach einer Weiterleitung wegen fehlender Berechtigung
 * (katalog-seiten, AK-10); deaktiviert und „ohne Rolle“ haben Vorrang.
 */
export function KeinZugriffRoute() {
  const { zustand, benutzer, erneutPruefen } = useBenutzerKontext()
  const { grund } = keinZugriffApi.useSearch()
  if (zustand.art === 'deaktiviert') return <KeinZugriffSeite grund="deaktiviert" onErneutPruefen={erneutPruefen} />
  if (benutzer?.rolle === 'keine') {
    return <KeinZugriffSeite grund="keineRolle" benutzer={benutzer} onErneutPruefen={erneutPruefen} />
  }
  return benutzer && grund === 'berechtigung' ? <KeinZugriffSeite grund="keineBerechtigung" /> : null
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
