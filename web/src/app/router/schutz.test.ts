import { isRedirect } from '@tanstack/react-router'
import { describe, expect, it, vi } from 'vitest'
import { ME } from '../../../test/anmeldung'
import { erfordertAnmeldung, erfordertRolle, type SchutzKontext } from './schutz'

// AK-28: Guard-Funktionen für Routen, die Anmeldung bzw. eine Rolle verlangen (für künftige Seiten).

function kontext(teil: { status: SchutzKontext['anmeldung']['status']; benutzer?: SchutzKontext['benutzer'] }) {
  const anmelden = vi.fn()
  const k: SchutzKontext = { anmeldung: { status: teil.status, anmelden }, benutzer: teil.benutzer ?? null }
  return { kontext: k, anmelden }
}

function geworfen(aufruf: () => void): unknown {
  try {
    aufruf()
  } catch (fehler) {
    return fehler
  }
  throw new Error('Es wurde nichts geworfen.')
}

describe('erfordertAnmeldung', () => {
  it('lässt angemeldete Benutzer durch', () => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: ME.keine })

    expect(() => erfordertAnmeldung(k, '/kein-zugriff')).not.toThrow()
  })

  it('startet für Anonyme die Anmeldung mit dem Rückkehrziel', () => {
    const { kontext: k, anmelden } = kontext({ status: 'anonym' })

    geworfen(() => erfordertAnmeldung(k, '/kein-zugriff?x=1'))

    expect(anmelden).toHaveBeenCalledWith('/kein-zugriff?x=1')
  })

  it('bricht für Anonyme die Navigation ab', () => {
    const { kontext: k } = kontext({ status: 'anonym' })

    expect(() => erfordertAnmeldung(k, '/kein-zugriff')).toThrow()
  })

  it('bricht ohne konfigurierte Anmeldung die Navigation ab, ohne eine Anmeldung zu starten', () => {
    const { kontext: k, anmelden } = kontext({ status: 'nichtKonfiguriert' })

    geworfen(() => erfordertAnmeldung(k, '/kein-zugriff'))

    expect(anmelden).not.toHaveBeenCalled()
  })
})

describe('erfordertRolle', () => {
  it('lässt Benutzer mit einer der Rollen durch', () => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: ME.sachbearbeiter })

    expect(() => erfordertRolle(['Administrator', 'Sachbearbeiter'])(k, '/verwaltung')).not.toThrow()
  })

  it('leitet Benutzer ohne Rolle nach /kein-zugriff', () => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: ME.keine })

    const fehler = geworfen(() => erfordertRolle(['Administrator'])(k, '/verwaltung'))

    expect(isRedirect(fehler)).toBe(true)
    expect((fehler as { options: { to?: string } }).options.to).toBe('/kein-zugriff')
  })

  it('leitet Benutzer mit einer anderen Rolle zur Startseite', () => {
    const { kontext: k } = kontext({ status: 'angemeldet', benutzer: ME.betrachter })

    const fehler = geworfen(() => erfordertRolle(['Administrator'])(k, '/verwaltung'))

    expect(isRedirect(fehler)).toBe(true)
    expect((fehler as { options: { to?: string } }).options.to).toBe('/')
  })

  it('startet für Anonyme die Anmeldung mit dem Rückkehrziel', () => {
    const { kontext: k, anmelden } = kontext({ status: 'anonym' })

    geworfen(() => erfordertRolle(['Administrator'])(k, '/verwaltung'))

    expect(anmelden).toHaveBeenCalledWith('/verwaltung')
  })
})
