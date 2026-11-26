import { expect, test } from '@playwright/test'
import { erhebeBestand, ROLLEN, SEITEN, type Bestand } from './hilfen/rechte.js'

// Feature startseite-listen-pruefung, AK-39 (Abschnitt 6, 11.1; UI-Test mit gemockter API): Für anonym, ohne Rolle,
// Betrachter, Sachbearbeiter und Administrator sind auf /, /coins, /pruefung, /benutzerverwaltung und
// /verwaltung/startseite dieselben Blöcke (Regionen), Links, Buttons, Reiter, Navigationslinks und Requests vorhanden wie
// vor dem Umbau. VORHER wurde am 2026-11-15 auf dem Stand vor dem Umbau mit denselben Mocks erhoben. Ausnahme sind nur
// die neuen Bedienelemente aus dem Entwurf (NEU), jeweils unter derselben Berechtigung wie ihre Seite; NEU_ERLAUBT darf
// zusätzlich vorkommen (z. B. der Auswahl-Button der Combobox „Benutzer“). Anonyme Besucher werden auf geschützten Seiten
// wie bisher zur Anmeldung geleitet.

/** Bestand vor dem Umbau (Rolle + Pfad). */
const VORHER: Record<string, Bestand> = {
  'anonym /': {
    url: '/',
    navigation: ['Katalog', 'Startseite'],
    links: ['Zum Katalog'],
    buttons: [],
    reiter: [],
    regionen: [],
    endpunkte: ['GET /api/startseite/kopf'],
  },
  'anonym /coins': {
    url: '/coins',
    navigation: ['Katalog', 'Startseite'],
    links: [
      'Coin Beispiel 1',
      'Coin Beispiel 2',
      'Coin Beispiel 3',
      'Coin Beispiel 4',
      'Coin Beispiel 5',
      'Coin Beispiel 6',
      'Coin Beispiel 7',
      'Coin Gestaltungstest',
    ],
    buttons: ['Nächste Seite', 'Suchen', 'Vorherige Seite'],
    reiter: [],
    regionen: [],
    endpunkte: ['GET /api/coins'],
  },
  'anonym /pruefung': {
    url: 'Anmeldung',
    navigation: [],
    links: [],
    buttons: [],
    reiter: [],
    regionen: [],
    endpunkte: [],
  },
  'anonym /benutzerverwaltung': {
    url: 'Anmeldung',
    navigation: [],
    links: [],
    buttons: [],
    reiter: [],
    regionen: [],
    endpunkte: [],
  },
  'anonym /verwaltung/startseite': {
    url: 'Anmeldung',
    navigation: [],
    links: [],
    buttons: [],
    reiter: [],
    regionen: [],
    endpunkte: [],
  },
  'ohne Rolle /': {
    url: '/',
    navigation: ['Katalog', 'Startseite'],
    links: ['Zum Katalog'],
    buttons: [],
    reiter: [],
    regionen: [],
    endpunkte: ['GET /api/startseite/kopf'],
  },
  'ohne Rolle /coins': {
    url: '/coins',
    navigation: ['Katalog', 'Startseite'],
    links: [
      'Coin Beispiel 1',
      'Coin Beispiel 2',
      'Coin Beispiel 3',
      'Coin Beispiel 4',
      'Coin Beispiel 5',
      'Coin Beispiel 6',
      'Coin Beispiel 7',
      'Coin Gestaltungstest',
    ],
    buttons: ['Nächste Seite', 'Suchen', 'Vorherige Seite'],
    reiter: [],
    regionen: [],
    endpunkte: ['GET /api/coins'],
  },
  'ohne Rolle /pruefung': {
    url: '/kein-zugriff',
    navigation: ['Katalog', 'Startseite'],
    links: ['Zum Coin-Katalog'],
    buttons: ['Abmelden', 'Erneut prüfen'],
    reiter: [],
    regionen: [],
    endpunkte: [],
  },
  'ohne Rolle /benutzerverwaltung': {
    url: '/kein-zugriff',
    navigation: ['Katalog', 'Startseite'],
    links: ['Zum Coin-Katalog'],
    buttons: ['Abmelden', 'Erneut prüfen'],
    reiter: [],
    regionen: [],
    endpunkte: [],
  },
  'ohne Rolle /verwaltung/startseite': {
    url: '/kein-zugriff',
    navigation: ['Katalog', 'Startseite'],
    links: ['Zum Coin-Katalog'],
    buttons: ['Abmelden', 'Erneut prüfen'],
    reiter: [],
    regionen: [],
    endpunkte: [],
  },
  'Betrachter /': {
    url: '/',
    navigation: ['Katalog', 'Startseite', 'Zertifikat prüfen'],
    links: [
      'Coin Beispiel 1',
      'Coin Beispiel 2',
      'Coin Beispiel 3',
      'Coin Beispiel 4',
      'Coin Beispiel 5',
      'Coin Gestaltungstest',
      'Zum Katalog',
    ],
    buttons: [],
    reiter: [],
    regionen: ['Information', 'Kennzahlen', 'Meistausgegebene Coins', 'Neueste Coins'],
    endpunkte: ['GET /api/startseite'],
  },
  'Betrachter /coins': {
    url: '/coins',
    navigation: ['Katalog', 'Startseite', 'Zertifikat prüfen'],
    links: [
      'Coin Beispiel 1',
      'Coin Beispiel 2',
      'Coin Beispiel 3',
      'Coin Beispiel 4',
      'Coin Beispiel 5',
      'Coin Beispiel 6',
      'Coin Beispiel 7',
      'Coin Gestaltungstest',
    ],
    buttons: ['Nächste Seite', 'Suchen', 'Vorherige Seite'],
    reiter: [],
    regionen: [],
    endpunkte: ['GET /api/coins'],
  },
  'Betrachter /pruefung': {
    url: '/pruefung',
    navigation: ['Katalog', 'Startseite', 'Zertifikat prüfen'],
    links: ['Coin Gestaltungstest'],
    buttons: ['Prüfen', 'Vorschläge anzeigen'],
    reiter: [],
    regionen: [],
    endpunkte: ['POST /api/pruefung'],
  },
  'Betrachter /benutzerverwaltung': {
    url: '/kein-zugriff?grund=berechtigung',
    navigation: ['Katalog', 'Startseite', 'Zertifikat prüfen'],
    links: ['Zum Coin-Katalog'],
    buttons: ['Abmelden'],
    reiter: [],
    regionen: [],
    endpunkte: [],
  },
  'Betrachter /verwaltung/startseite': {
    url: '/kein-zugriff?grund=berechtigung',
    navigation: ['Katalog', 'Startseite', 'Zertifikat prüfen'],
    links: ['Zum Coin-Katalog'],
    buttons: ['Abmelden'],
    reiter: [],
    regionen: [],
    endpunkte: [],
  },
  'Sachbearbeiter /': {
    url: '/',
    navigation: ['Katalog', 'Startseite', 'Zertifikat prüfen'],
    links: [
      'Coin Beispiel 1',
      'Coin Beispiel 2',
      'Coin Beispiel 3',
      'Coin Beispiel 4',
      'Coin Beispiel 5',
      'Coin Gestaltungstest',
      'Zum Katalog',
    ],
    buttons: [],
    reiter: [],
    regionen: ['Information', 'Kennzahlen', 'Meistausgegebene Coins', 'Neueste Coins'],
    endpunkte: ['GET /api/startseite'],
  },
  'Sachbearbeiter /coins': {
    url: '/coins',
    navigation: ['Katalog', 'Startseite', 'Zertifikat prüfen'],
    links: [
      'Coin Beispiel 1',
      'Coin Beispiel 2',
      'Coin Beispiel 3',
      'Coin Beispiel 4',
      'Coin Beispiel 5',
      'Coin Beispiel 6',
      'Coin Beispiel 7',
      'Coin Gestaltungstest',
      'Coin hinzufügen',
    ],
    buttons: ['Nächste Seite', 'Suchen', 'Vorherige Seite'],
    reiter: [],
    regionen: [],
    endpunkte: ['GET /api/coins'],
  },
  'Sachbearbeiter /pruefung': {
    url: '/pruefung',
    navigation: ['Katalog', 'Startseite', 'Zertifikat prüfen'],
    links: ['Coin Gestaltungstest', 'Zur Ausgabe'],
    buttons: ['Prüfen', 'Vorschläge anzeigen'],
    reiter: [],
    regionen: [],
    endpunkte: ['POST /api/pruefung/mit-empfaenger'],
  },
  'Sachbearbeiter /benutzerverwaltung': {
    url: '/kein-zugriff?grund=berechtigung',
    navigation: ['Katalog', 'Startseite', 'Zertifikat prüfen'],
    links: ['Zum Coin-Katalog'],
    buttons: ['Abmelden'],
    reiter: [],
    regionen: [],
    endpunkte: [],
  },
  'Sachbearbeiter /verwaltung/startseite': {
    url: '/kein-zugriff?grund=berechtigung',
    navigation: ['Katalog', 'Startseite', 'Zertifikat prüfen'],
    links: ['Zum Coin-Katalog'],
    buttons: ['Abmelden'],
    reiter: [],
    regionen: [],
    endpunkte: [],
  },
  'Administrator /': {
    url: '/',
    navigation: ['Benutzerverwaltung', 'Katalog', 'Startseite', 'Startseite verwalten', 'Zertifikat prüfen'],
    links: [
      'Coin Beispiel 1',
      'Coin Beispiel 2',
      'Coin Beispiel 3',
      'Coin Beispiel 4',
      'Coin Beispiel 5',
      'Coin Gestaltungstest',
      'Zum Katalog',
    ],
    buttons: [],
    reiter: [],
    regionen: ['Information', 'Kennzahlen', 'Meistausgegebene Coins', 'Neueste Coins'],
    endpunkte: ['GET /api/startseite'],
  },
  'Administrator /coins': {
    url: '/coins',
    navigation: ['Benutzerverwaltung', 'Katalog', 'Startseite', 'Startseite verwalten', 'Zertifikat prüfen'],
    links: [
      'Coin Beispiel 1',
      'Coin Beispiel 2',
      'Coin Beispiel 3',
      'Coin Beispiel 4',
      'Coin Beispiel 5',
      'Coin Beispiel 6',
      'Coin Beispiel 7',
      'Coin Gestaltungstest',
      'Coin hinzufügen',
    ],
    buttons: ['Nächste Seite', 'Suchen', 'Vorherige Seite'],
    reiter: [],
    regionen: [],
    endpunkte: ['GET /api/coins'],
  },
  'Administrator /pruefung': {
    url: '/pruefung',
    navigation: ['Benutzerverwaltung', 'Katalog', 'Startseite', 'Startseite verwalten', 'Zertifikat prüfen'],
    links: ['Coin Gestaltungstest', 'Zur Ausgabe'],
    buttons: ['Prüfen', 'Vorschläge anzeigen'],
    reiter: [],
    regionen: [],
    endpunkte: ['POST /api/pruefung/mit-empfaenger'],
  },
  'Administrator /benutzerverwaltung': {
    url: '/benutzerverwaltung',
    navigation: ['Benutzerverwaltung', 'Katalog', 'Startseite', 'Startseite verwalten', 'Zertifikat prüfen'],
    links: [],
    buttons: [
      'Nächste Seite',
      'Suchen',
      'Test Administrator deaktivieren',
      'Test Betrachter deaktivieren',
      'Test Neu reaktivieren',
      'Vorherige Seite',
    ],
    reiter: ['Änderungsprotokoll', 'Benutzer'],
    regionen: [],
    // nacharbeiten-audit-filter E8: das Änderungsprotokoll lädt zusätzlich die Liste der Aktionen.
    endpunkte: ['GET /api/audit', 'GET /api/audit/aktionen', 'GET /api/benutzer'],
  },
  'Administrator /verwaltung/startseite': {
    url: '/verwaltung/startseite',
    navigation: ['Benutzerverwaltung', 'Katalog', 'Startseite', 'Startseite verwalten', 'Zertifikat prüfen'],
    links: [],
    buttons: [
      'Änderungen verwerfen',
      'Infotext nach oben verschieben',
      'Infotext nach unten verschieben',
      'Kennzahlen nach oben verschieben',
      'Kennzahlen nach unten verschieben',
      'Kopfbereich nach oben verschieben',
      'Kopfbereich nach unten verschieben',
      'Meistausgegebene Coins nach oben verschieben',
      'Meistausgegebene Coins nach unten verschieben',
      'Neueste Coins nach oben verschieben',
      'Neueste Coins nach unten verschieben',
      'Speichern',
    ],
    reiter: ['Bearbeiten', 'Vorschau'],
    regionen: [],
    endpunkte: ['GET /api/startseite/konfiguration'],
  },
}

type Feld = 'navigation' | 'links' | 'buttons' | 'reiter' | 'regionen'

/** Neue Bedienelemente aus dem Entwurf, die nach dem Umbau vorhanden sein müssen (je Seite, gleiche Berechtigung). */
const NEU: Record<string, Partial<Record<Feld, string[]>>> = {
  // Ansichtsumschalter (4.2): Katalog ist öffentlich, also für alle Rollen.
  '/coins': { buttons: ['Karten', 'Tabelle'] },
}

/** Neue Elemente, die vorkommen dürfen, aber nicht müssen (Bestandteile neuer Bausteine). */
const NEU_ERLAUBT: Record<string, Partial<Record<Feld, string[]>>> = {
  // Benutzerfilter des Audit-Logs (4.4): Auswahl- und Entfernen-Buttons der Combobox, nur auf der Seite mit users.manage.
  '/benutzerverwaltung': { buttons: ['Vorschläge anzeigen', 'Auswahl entfernen'] },
}

const FELDER: Feld[] = ['navigation', 'links', 'buttons', 'reiter', 'regionen']

for (const [rolle, me] of ROLLEN) {
  for (const pfad of SEITEN) {
    const vorher = VORHER[`${rolle} ${pfad}`]
    test.describe(`${rolle} auf ${pfad} (AK-39)`, () => {
      test('landet auf derselben Seite wie vorher (bzw. bei der Anmeldung)', async ({ page }) => {
        const { bestand, api } = await erhebeBestand(page, me, pfad)

        expect(bestand.url).toBe(vorher.url)
        expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
      })

      test('ruft dieselben Endpunkte auf wie vorher', async ({ page }) => {
        const { bestand } = await erhebeBestand(page, me, pfad)

        expect(bestand.endpunkte).toEqual(vorher.endpunkte)
      })

      for (const feld of FELDER) {
        test(`zeigt dieselben ${feld} wie vorher, ergänzt nur um die neuen Elemente der Seite`, async ({ page }) => {
          const { bestand } = await erhebeBestand(page, me, pfad)

          const ziel = vorher.url === 'Anmeldung' ? '' : new URL(vorher.url, 'http://x').pathname
          const pflicht = [...vorher[feld], ...(NEU[ziel]?.[feld] ?? [])]
          const erlaubt = new Set([...pflicht, ...(NEU_ERLAUBT[ziel]?.[feld] ?? [])])
          expect(
            pflicht.filter((name) => !bestand[feld].includes(name)),
            'fehlt',
          ).toEqual([])
          expect(
            bestand[feld].filter((name) => !erlaubt.has(name)),
            'zusätzlich',
          ).toEqual([])
        })
      }
    })
  }
}
