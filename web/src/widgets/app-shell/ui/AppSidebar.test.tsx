import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Benutzer } from '@/entities/benutzer'
import { ME } from '../../../../test/anmeldung'
import { angemeldet, zeigeShell } from '../../../../test/shell'
import type { BenutzerZustand } from '../index'

// Feature design-fundament, AK-27 und AK-28 (Abschnitt 6.2): Gruppen der Seitenleiste nach Berechtigung, Listen mit
// dem Gruppenlabel als Namen, unveränderte Linknamen/-ziele/-reihenfolge, Icons aria-hidden, aktiver Eintrag.

const GRUPPEN = ['Übersicht', 'Coins', 'Prüfung', 'Verwaltung'] as const

const EINTRAEGE = [
  { name: 'Startseite', href: '/', gruppe: 'Übersicht' },
  { name: 'Katalog', href: '/coins', gruppe: 'Coins' },
  { name: 'Zertifikat prüfen', href: '/pruefung', gruppe: 'Prüfung' },
  { name: 'Benutzerverwaltung', href: '/benutzerverwaltung', gruppe: 'Verwaltung' },
  { name: 'Startseite verwalten', href: '/verwaltung/startseite', gruppe: 'Verwaltung' },
] as const

async function nav(zustand: BenutzerZustand = angemeldet(), start = '/') {
  zeigeShell(zustand, { start })
  await screen.findByRole('heading', { level: 1 })
  return screen.getByRole('navigation', { name: 'Hauptnavigation' })
}

/** Namen der Gruppenlisten in DOM-Reihenfolge. */
function listenNamen(navigation: HTMLElement): string[] {
  return within(navigation)
    .getAllByRole('list')
    .map((liste) => liste.getAttribute('aria-labelledby') ?? '')
    .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
    .filter((name) => name !== '')
}

function linkNamen(navigation: HTMLElement): string[] {
  return within(navigation)
    .getAllByRole('link')
    .map((link) => link.textContent?.trim() ?? '')
}

function mitBerechtigungen(berechtigungen: Benutzer['berechtigungen']): BenutzerZustand {
  return angemeldet({ ...ME.betrachter, berechtigungen })
}

describe('Gruppen je Berechtigungssatz (AK-27)', () => {
  it('zeigt anonym nur die Gruppen „Übersicht“ und „Coins“', async () => {
    expect(listenNamen(await nav({ art: 'anonym' }))).toEqual(['Übersicht', 'Coins'])
  })

  it('zeigt als Betrachter zusätzlich die Gruppe „Prüfung“', async () => {
    expect(listenNamen(await nav(angemeldet(ME.betrachter)))).toEqual(['Übersicht', 'Coins', 'Prüfung'])
  })

  it('zeigt als Sachbearbeiter die Gruppen „Übersicht“, „Coins“ und „Prüfung“', async () => {
    expect(listenNamen(await nav(angemeldet(ME.sachbearbeiter)))).toEqual(['Übersicht', 'Coins', 'Prüfung'])
  })

  it('zeigt als Administrator alle vier Gruppen in fester Reihenfolge', async () => {
    expect(listenNamen(await nav(angemeldet(ME.admin)))).toEqual([...GRUPPEN])
  })

  it('zeigt ohne Rolle nur die Gruppen „Übersicht“ und „Coins“', async () => {
    expect(listenNamen(await nav(angemeldet(ME.keine)))).toEqual(['Übersicht', 'Coins'])
  })

  it('zeigt im Zustand „deaktiviert“ nur die Gruppen „Übersicht“ und „Coins“', async () => {
    expect(listenNamen(await nav({ art: 'deaktiviert' }))).toEqual(['Übersicht', 'Coins'])
  })

  it('rendert die Gruppe „Verwaltung“ nur mit „Startseite verwalten“, wenn nur startpage.manage vorliegt', async () => {
    const navigation = await nav(mitBerechtigungen(['startpage.manage']))

    expect(within(navigation).getByRole('list', { name: 'Verwaltung' })).toBeInTheDocument()
    expect(linkNamen(within(navigation).getByRole('list', { name: 'Verwaltung' }))).toEqual(['Startseite verwalten'])
  })

  it('rendert die Gruppe „Verwaltung“ nur mit „Benutzerverwaltung“, wenn nur users.manage vorliegt', async () => {
    const navigation = await nav(mitBerechtigungen(['users.manage']))

    expect(linkNamen(within(navigation).getByRole('list', { name: 'Verwaltung' }))).toEqual(['Benutzerverwaltung'])
  })

  it('lässt Gruppen ohne sichtbaren Eintrag im DOM weg (auch kein Label)', async () => {
    await nav({ art: 'anonym' })

    expect(screen.queryByText('Prüfung')).not.toBeInTheDocument()
    expect(screen.queryByText('Verwaltung')).not.toBeInTheDocument()
  })

  it('leitet die Sichtbarkeit nur aus berechtigungen ab, nicht aus der Rolle', async () => {
    // Rolle „Administrator“, aber nur coins.read: keine Verwaltung.
    const navigation = await nav(angemeldet({ ...ME.admin, berechtigungen: ['coins.read'] }))

    expect(listenNamen(navigation)).toEqual(['Übersicht', 'Coins', 'Prüfung'])
  })
})

describe('Listen und Einträge (AK-27)', () => {
  it.each(GRUPPEN.map((g) => [g]))('gibt der Gruppenliste „%s“ ihr Label als zugänglichen Namen', async (gruppe) => {
    const navigation = await nav()

    expect(within(navigation).getByRole('list', { name: gruppe })).toBeInTheDocument()
  })

  it.each(EINTRAEGE.map((e) => [e.name, e.gruppe]))('ordnet „%s“ der Gruppe „%s“ zu', async (name, gruppe) => {
    const navigation = await nav()

    expect(within(within(navigation).getByRole('list', { name: gruppe })).getByRole('link', { name })).toBeVisible()
  })

  it('behält Linknamen und Reihenfolge der fünf Einträge bei', async () => {
    expect(linkNamen(await nav())).toEqual(EINTRAEGE.map((e) => e.name))
  })

  it.each(EINTRAEGE.map((e) => [e.name, e.href]))('verlinkt „%s“ auf %s', async (name, href) => {
    const navigation = await nav()

    expect(within(navigation).getByRole('link', { name })).toHaveAttribute('href', href)
  })

  it('verwendet kein Gruppenlabel, das einem Linknamen gleicht', async () => {
    const navigation = await nav()

    const links = linkNamen(navigation)
    expect(listenNamen(navigation).filter((label) => links.includes(label))).toEqual([])
  })

  it('verwendet für die Gruppenlabels keine Überschriften', async () => {
    const navigation = await nav()

    expect(within(navigation).queryAllByRole('heading')).toEqual([])
  })

  it('blendet alle Icons in der Hauptnavigation für Screenreader aus', async () => {
    const navigation = await nav()

    const icons = [...navigation.querySelectorAll('svg')]
    expect(icons.length).toBeGreaterThanOrEqual(EINTRAEGE.length)
    expect(icons.filter((icon) => icon.closest('[aria-hidden="true"]') === null)).toEqual([])
  })

  it('zeigt im Kopf der Seitenleiste den Text „C.O.I.N.“ genau einmal', async () => {
    await nav()

    expect(screen.getAllByText('C.O.I.N.')).toHaveLength(1)
  })

  it('hat keinen Eintrag für die Bausteinseite', async () => {
    const navigation = await nav()

    expect(
      within(navigation)
        .getAllByRole('link')
        .filter((link) => link.getAttribute('href')?.startsWith('/entwicklung')),
    ).toEqual([])
  })
})

describe('Aktiver Eintrag (AK-28)', () => {
  it('setzt aria-current="page" auf dem exakten Pfad', async () => {
    const navigation = await nav(angemeldet(), '/coins')

    expect(within(navigation).getByRole('link', { name: 'Katalog' })).toHaveAttribute('aria-current', 'page')
  })

  it('setzt aria-current auf keinem anderen Eintrag', async () => {
    const navigation = await nav(angemeldet(), '/coins')

    const aktuelle = within(navigation)
      .getAllByRole('link')
      .filter((link) => link.hasAttribute('aria-current'))
      .map((link) => link.textContent?.trim())
    expect(aktuelle).toEqual(['Katalog'])
  })

  it('markiert „Katalog“ auf einer Unterseite mit data-active, aber ohne aria-current', async () => {
    const navigation = await nav(angemeldet(), '/coins/0199a1b2-0000-7000-8000-000000000001')

    const katalog = within(navigation).getByRole('link', { name: 'Katalog' })
    expect(katalog).toHaveAttribute('data-active')
    expect(katalog).not.toHaveAttribute('aria-current')
  })

  it('markiert „Startseite“ nicht auf Unterseiten anderer Einträge', async () => {
    const navigation = await nav(angemeldet(), '/coins/neu')

    expect(within(navigation).getByRole('link', { name: 'Startseite' })).not.toHaveAttribute('data-active')
  })

  it('hebt den aktiven Eintrag auch über das Schriftgewicht hervor (font-semibold)', async () => {
    const navigation = await nav(angemeldet(), '/coins')

    // Gestaltung über Tokens/Klassen; die berechnete Darstellung prüft barrierefreiheit.spec.ts.
    const katalog = within(navigation).getByRole('link', { name: 'Katalog' })
    expect(katalog.className).toMatch(/(^|\s|:)font-semibold(\s|$)/)
  })
})
