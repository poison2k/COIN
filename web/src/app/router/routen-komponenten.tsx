import { getRouteApi, Outlet, useBlocker, useLocation, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Ausgabe } from '@/entities/ausgabe'
import type { Coin } from '@/entities/coin'
import { hatBerechtigung } from '@/entities/benutzer'
import type { ExemplarStatus } from '@/entities/exemplar'
import { AusgabeDetailSeite } from '@/pages/ausgabe-detail'
import { AusgabeErfassenSeite } from '@/pages/ausgabe-erfassen'
import { RueckrufSeite } from '@/pages/anmeldung-rueckruf'
import { BenutzerverwaltungSeite } from '@/pages/benutzerverwaltung'
import { CoinAnlegenSeite } from '@/pages/coin-anlegen'
import { CoinBearbeitenSeite } from '@/pages/coin-bearbeiten'
import { CoinDetailSeite, type CoinDetailMeldung } from '@/pages/coin-detail'
import { CoinListeSeite } from '@/pages/coin-liste'
import { KeinZugriffSeite } from '@/pages/kein-zugriff'
import { StartSeite } from '@/pages/start'
import { StartseiteVerwaltungSeite } from '@/pages/startseite-verwaltung'
import { ROUTEN } from '@/shared/config'
import { sicheresZiel, useAnmeldung } from '@/shared/lib/anmeldung'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog'
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
const ausgabeNeuApi = getRouteApi('/shell/coins/$coinId/ausgaben/neu')
const ausgabeDetailApi = getRouteApi('/shell/coins/$coinId/ausgaben/$ausgabeId')
const coinBearbeitenApi = getRouteApi('/shell/coins/$coinId/bearbeiten')

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
  const { status, seite = 1 } = coinDetailApi.useSearch()
  const { benutzer } = useBenutzerKontext()
  const coinAngelegt = useLocation({ select: (ort) => ort.state.coinAngelegt })
  const ausgabeNummer = useLocation({ select: (ort) => ort.state.ausgabeErfasst?.nummer })
  const coinGeaendert = useLocation({ select: (ort) => ort.state.coinGeaendert === true })
  const navigate = useNavigate()
  const routeNavigate = coinDetailApi.useNavigate()
  const [gemerkt, setGemerkt] = useState<{ coinId: string; meldung: CoinDetailMeldung } | null>(null)

  const neueMeldung: CoinDetailMeldung | undefined =
    coinAngelegt ??
    (coinGeaendert ? 'coinGeaendert' : undefined) ??
    (typeof ausgabeNummer === 'number' ? { art: 'ausgabeErfasst', nummer: ausgabeNummer } : undefined)
  if (neueMeldung && (gemerkt?.coinId !== coinId || !gleicheMeldung(gemerkt.meldung, neueMeldung))) {
    setGemerkt({ coinId, meldung: neueMeldung })
  }

  const meldungImState = neueMeldung !== undefined
  useEffect(() => {
    if (!meldungImState) return
    void navigate({ to: ROUTEN.coinDetail, params: { coinId }, search: true, replace: true, state: {} })
  }, [meldungImState, coinId, navigate])

  const onStatus = useCallback(
    (neu?: ExemplarStatus) => {
      void routeNavigate({ search: { status: neu, seite: undefined }, resetScroll: false })
    },
    [routeNavigate],
  )
  const onSeite = useCallback(
    (neu: number) => {
      void routeNavigate({ search: (alt) => ({ ...alt, seite: neu > 1 ? neu : undefined }), resetScroll: false })
    },
    [routeNavigate],
  )

  const meldung = gemerkt?.coinId === coinId ? gemerkt.meldung : undefined
  return (
    <CoinDetailSeite
      coinId={coinId}
      meldung={meldung}
      berechtigungen={{
        exemplare: hatBerechtigung(benutzer, 'coins.read'),
        historie: hatBerechtigung(benutzer, 'issues.read'),
        erfassen: hatBerechtigung(benutzer, 'issues.write'),
        auflage: hatBerechtigung(benutzer, 'coins.write'),
        bearbeiten: hatBerechtigung(benutzer, 'coins.write'),
      }}
      status={status}
      seite={seite}
      onStatus={onStatus}
      onSeite={onSeite}
    />
  )
}

function gleicheMeldung(a: CoinDetailMeldung, b: CoinDetailMeldung): boolean {
  return typeof a === 'string' || typeof b === 'string' ? a === b : a.nummer === b.nummer
}

/**
 * „Ausgabe erfassen“ nur mit issues.write. Nach 201 ersetzt die Detailseite das Formular im Verlauf; die Meldung reist
 * nur mit der Nummer im History-State (coin-ausgaben, AK-28).
 */
export function AusgabeErfassenRoute() {
  const { coinId } = ausgabeNeuApi.useParams()
  const { benutzer } = useBenutzerKontext()
  const navigate = useNavigate()

  const onErfasst = useCallback(
    (ausgabe: Ausgabe) => {
      void navigate({
        to: ROUTEN.coinDetail,
        params: { coinId },
        replace: true,
        state: { ausgabeErfasst: { nummer: ausgabe.exemplarNummer } },
      })
    },
    [coinId, navigate],
  )

  return hatBerechtigung(benutzer, 'issues.write') ? (
    <AusgabeErfassenSeite coinId={coinId} onErfasst={onErfasst} />
  ) : null
}

/**
 * Seite „Ausgabe“ nur mit issues.read (zertifikat-erzeugen, AK-27); der Download nur mit issues.write (AK-29). Ohne
 * issues.read (z. B. nach Deaktivierung) leer, damit kein Request auf …/ausgaben entsteht.
 */
export function AusgabeDetailRoute() {
  const { coinId, ausgabeId } = ausgabeDetailApi.useParams()
  const { benutzer } = useBenutzerKontext()
  return hatBerechtigung(benutzer, 'issues.read') ? (
    <AusgabeDetailSeite
      key={`${coinId}/${ausgabeId}`}
      coinId={coinId}
      ausgabeId={ausgabeId}
      darfZertifikat={hatBerechtigung(benutzer, 'issues.write')}
    />
  ) : null
}

/**
 * „Coin bearbeiten“ nur mit coins.write. Nach dem Speichern ersetzt die Detailseite die Bearbeiten-Seite im Verlauf;
 * die Meldung reist als fester Schlüssel im History-State (zertifikatsvorlagen, AK-28).
 */
export function CoinBearbeitenRoute() {
  const { coinId } = coinBearbeitenApi.useParams()
  const { benutzer } = useBenutzerKontext()
  const navigate = useNavigate()

  const onGespeichert = useCallback(
    (coin: Coin) => {
      void navigate({
        to: ROUTEN.coinDetail,
        params: { coinId: coin.id },
        replace: true,
        state: { coinGeaendert: true },
      })
    },
    [navigate],
  )

  return hatBerechtigung(benutzer, 'coins.write') ? (
    <CoinBearbeitenSeite coinId={coinId} onGespeichert={onGespeichert} />
  ) : null
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

/**
 * Startseite (/): Sichtbarkeit nur aus `berechtigungen` von /api/me (startseite, AK-20/AK-22, ADR-0032 Punkt 6). Solange
 * die Anmeldung geprüft wird, steht nicht fest, welcher Endpunkt gilt; die Seite zeigt dann nur den Ladestatus.
 */
export function StartRoute() {
  const { zustand, benutzer } = useBenutzerKontext()
  return <StartSeite bereit={zustand.art !== 'pruefe'} darfAnsehen={hatBerechtigung(benutzer, 'coins.read')} />
}

/**
 * „Startseite verwalten“ nur mit startpage.manage (startseite, AK-26). Ungespeicherte Änderungen sichern das Verlassen
 * über die App per AlertDialog und Neuladen/Schließen per beforeunload ab (AK-32).
 */
export function StartseiteVerwaltungRoute() {
  const { benutzer } = useBenutzerKontext()
  const [geaendert, setGeaendert] = useState(false)
  const geaendertRef = useRef(false)
  useEffect(() => {
    geaendertRef.current = geaendert
  }, [geaendert])

  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => geaendertRef.current && current.pathname !== next.pathname,
    enableBeforeUnload: false,
    withResolver: true,
  })

  useEffect(() => {
    if (!geaendert) return undefined
    const warnen = (ereignis: BeforeUnloadEvent) => {
      ereignis.preventDefault()
    }
    window.addEventListener('beforeunload', warnen)
    return () => window.removeEventListener('beforeunload', warnen)
  }, [geaendert])

  if (!hatBerechtigung(benutzer, 'startpage.manage')) return null
  return (
    <>
      <StartseiteVerwaltungSeite onGeaendert={setGeaendert} />
      <AlertDialog
        open={blocker.status === 'blocked'}
        onOpenChange={(offen) => {
          if (!offen) blocker.reset?.()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ungespeicherte Änderungen</AlertDialogTitle>
            <AlertDialogDescription>
              Die Änderungen an der Startseite sind nicht gespeichert. Seite trotzdem verlassen?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Bleiben</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={() => blocker.proceed?.()}>
              Verlassen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
