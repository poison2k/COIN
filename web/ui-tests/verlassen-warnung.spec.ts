import { expect, test, type Page } from '@playwright/test'
import { ADMIN, COIN, MOTIV_PNG, oeffne, richteFormularApiEin, type SchreibZustand } from './hilfen/formulare.js'

// Feature formulare-detailseiten, AK-13 bis AK-16 (Abschnitt 4.3, ADR-0040, UI-Test mit gemockter API): Warnung
// „Ungespeicherte Änderungen“ beim Verlassen eines geänderten Formulars über Seitenleiste, „Abbrechen“, Browser-Zurück
// und (Reiter „Zertifikatsvorlage“) Reiterwechsel; `beforeunload` beim Neuladen nur mit Änderungen.

let api: SchreibZustand

test.afterEach(() => {
  expect(api.ungemockt, 'Nicht gemockte API-Aufrufe').toEqual([])
})

const DETAIL = `/coins/${COIN.id}`

const BESCHREIBUNG = {
  anlegen: 'Der neue Coin ist nicht gespeichert. Seite trotzdem verlassen?',
  bearbeiten: 'Die Änderungen am Coin sind nicht gespeichert. Seite trotzdem verlassen?',
  erfassen: 'Die Ausgabe ist nicht gespeichert. Seite trotzdem verlassen?',
  vorlage: 'Die ausgewählte Vorlage ist nicht hochgeladen. Seite trotzdem verlassen?',
  // G1 (Mensch, Review-Runde 3): Steht auf „Coin bearbeiten“ nur noch das gewählte Motivbild aus.
  nurMotivbild:
    'Das ausgewählte Motivbild ist noch nicht hochgeladen. Wenn Sie die Seite verlassen, geht die Auswahl verloren.',
}

const warnung = (page: Page) => page.getByRole('alertdialog', { name: 'Ungespeicherte Änderungen' })
const katalog = (page: Page) =>
  page.getByRole('navigation', { name: 'Hauptnavigation' }).getByRole('link', { name: 'Katalog', exact: true })

test.describe('Coin anlegen (AK-13, AK-14)', () => {
  test('Seitenleiste: Dialog mit Beschreibung, „Bleiben“ fokussiert', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')
    await page.getByLabel(/^Name/).fill('Coin Neu')

    await katalog(page).click()

    await expect(warnung(page)).toBeVisible()
    await expect(warnung(page)).toHaveAccessibleDescription(BESCHREIBUNG.anlegen)
    await expect(warnung(page).getByRole('button', { name: 'Bleiben' })).toBeFocused()
    await expect(page).toHaveURL(/\/coins\/neu$/)
  })

  test('„Bleiben“ lässt Seite und Eingaben unverändert', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')
    await page.getByLabel(/^Name/).fill('Coin Neu')
    await katalog(page).click()

    await warnung(page).getByRole('button', { name: 'Bleiben' }).click()

    await expect(warnung(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/coins\/neu$/)
    await expect(page.getByLabel(/^Name/)).toHaveValue('Coin Neu')
  })

  test('Escape heißt „Bleiben“', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')
    await page.getByLabel(/^Name/).fill('Coin Neu')
    await katalog(page).click()
    await expect(warnung(page)).toBeVisible()

    await page.keyboard.press('Escape')

    await expect(warnung(page)).toHaveCount(0)
    await expect(page.getByLabel(/^Name/)).toHaveValue('Coin Neu')
  })

  test('„Verlassen“ navigiert ohne Request', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')
    await page.getByLabel(/^Name/).fill('Coin Neu')
    await page.getByRole('link', { name: 'Abbrechen' }).click()

    await warnung(page).getByRole('button', { name: 'Verlassen' }).click()

    await expect(page).toHaveURL(/\/coins$/)
    expect(api.schreiben).toEqual([])
  })

  test('Browser-Zurück öffnet den Dialog', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins', 'Katalog')
    await page.getByRole('link', { name: 'Coin hinzufügen' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeVisible()
    await page.getByLabel(/^Name/).fill('Coin Neu')

    await page.goBack()

    await expect(warnung(page)).toBeVisible()
    await expect(page).toHaveURL(/\/coins\/neu$/)
  })

  test('ohne Änderung erscheint kein Dialog', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')

    await katalog(page).click()

    await expect(page).toHaveURL(/\/coins$/)
    await expect(warnung(page)).toHaveCount(0)
  })

  test('nach Rücksetzen auf den Ausgangswert erscheint kein Dialog', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')
    await page.getByLabel(/^Name/).fill('X')
    await page.getByLabel(/^Name/).fill('')

    await katalog(page).click()

    await expect(page).toHaveURL(/\/coins$/)
    await expect(warnung(page)).toHaveCount(0)
  })

  test('nach erfolgreichem Speichern erscheint beim Weiterleiten kein Dialog', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')
    await page.getByLabel(/^Name/).fill('Coin Neu')
    await page.getByLabel(/^Herausgeber/).fill('Herausgeber Neu')

    await page.getByRole('button', { name: 'Coin anlegen' }).click()

    await expect(page.getByRole('status').filter({ hasText: 'Coin wurde angelegt.' })).toBeVisible()
    await expect(warnung(page)).toHaveCount(0)
  })
})

test.describe('weitere Formulare (AK-13)', () => {
  test('Coin bearbeiten: „Abbrechen“ nach Änderung zeigt die Beschreibung für „Coin bearbeiten“', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, `${DETAIL}/bearbeiten`, 'Coin bearbeiten')
    await page.getByLabel(/^Herausgeber/).fill('Herausgeber Geändert')

    await page.getByRole('link', { name: 'Abbrechen' }).click()

    await expect(warnung(page)).toHaveAccessibleDescription(BESCHREIBUNG.bearbeiten)
  })

  // G1: Steht nur das Motivbild aus, nennt die Warnung das Motivbild (vorher: Text für „Coin bearbeiten“).
  test('Coin bearbeiten: Motivbild gewählt, nicht hochgeladen, Verlassen über die Seitenleiste zeigt die Warnung', async ({
    page,
  }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, `${DETAIL}/bearbeiten`, 'Coin bearbeiten')
    await page.getByLabel(/^Neues Motivbild/).setInputFiles(MOTIV_PNG)

    await katalog(page).click()

    await expect(warnung(page)).toHaveAccessibleDescription(BESCHREIBUNG.nurMotivbild)
    await expect(page).toHaveURL(new RegExp(`${DETAIL}/bearbeiten$`))
  })

  test('Coin bearbeiten: nach erfolgreichem Speichern der Stammdaten mit offenem Motivbild nennt die Warnung das Motivbild (G1)', async ({
    page,
  }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, `${DETAIL}/bearbeiten`, 'Coin bearbeiten')
    await page.getByLabel(/^Neues Motivbild/).setInputFiles(MOTIV_PNG)
    await page.getByLabel(/^Herausgeber/).fill('Herausgeber Geändert')

    await page.getByRole('button', { name: 'Änderungen speichern' }).click()

    await expect(warnung(page)).toHaveAccessibleDescription(BESCHREIBUNG.nurMotivbild)
    expect(api.schreiben.filter((a) => a.methode === 'PUT')).toHaveLength(1)
  })

  test('Coin bearbeiten: ungespeicherte Stammdaten und gewähltes Motivbild behalten den bisherigen Text (G1)', async ({
    page,
  }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, `${DETAIL}/bearbeiten`, 'Coin bearbeiten')
    await page.getByLabel(/^Neues Motivbild/).setInputFiles(MOTIV_PNG)
    await page.getByLabel(/^Herausgeber/).fill('Herausgeber Geändert')

    await katalog(page).click()

    await expect(warnung(page)).toHaveAccessibleDescription(BESCHREIBUNG.bearbeiten)
  })

  test('Coin bearbeiten: „Verlassen“ nach gewähltem Motivbild navigiert ohne Upload', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, `${DETAIL}/bearbeiten`, 'Coin bearbeiten')
    await page.getByLabel(/^Neues Motivbild/).setInputFiles(MOTIV_PNG)
    await page.getByRole('link', { name: 'Abbrechen' }).click()

    await warnung(page).getByRole('button', { name: 'Verlassen' }).click()

    await expect(page).toHaveURL(new RegExp(`${DETAIL}$`))
    expect(api.schreiben).toEqual([])
  })

  test('Coin bearbeiten: nach hochgeladenem Motivbild erscheint beim Verlassen kein Dialog', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, `${DETAIL}/bearbeiten`, 'Coin bearbeiten')
    await page.getByLabel(/^Neues Motivbild/).setInputFiles(MOTIV_PNG)
    await page.getByRole('button', { name: 'Bild hochladen' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Motivbild wurde gespeichert.' })).toBeVisible()

    await page.getByRole('link', { name: 'Abbrechen' }).click()

    await expect(page).toHaveURL(new RegExp(`${DETAIL}$`))
    await expect(warnung(page)).toHaveCount(0)
  })

  test('Ausgabe erfassen: Seitenleiste nach Eingabe zeigt die Beschreibung für „Ausgabe erfassen“', async ({
    page,
  }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, `${DETAIL}/ausgaben/neu`, 'Ausgabe erfassen')
    await page.getByLabel(/^Name des Empfängers/).fill('Testperson A')

    await katalog(page).click()

    await expect(warnung(page)).toHaveAccessibleDescription(BESCHREIBUNG.erfassen)
  })

  test('Zertifikatsvorlage: Reiterwechsel mit gewählter Datei zeigt die Beschreibung für die Vorlage', async ({
    page,
  }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, `${DETAIL}?reiter=vorlage`, COIN.name)
    await page.getByLabel(/^Word-Vorlage \(\.docx\)/).setInputFiles({
      name: 'urkunde.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('PK-synthetische-vorlage'),
    })

    await page.getByRole('tab', { name: 'Exemplare' }).click()

    await expect(warnung(page)).toHaveAccessibleDescription(BESCHREIBUNG.vorlage)
    await expect(page).toHaveURL(/reiter=vorlage/)
  })

  test('Zertifikatsvorlage: „Verlassen“ wechselt den Reiter ohne Upload', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, `${DETAIL}?reiter=vorlage`, COIN.name)
    await page.getByLabel(/^Word-Vorlage \(\.docx\)/).setInputFiles({
      name: 'urkunde.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer: Buffer.from('PK-synthetische-vorlage'),
    })
    await page.getByRole('tab', { name: 'Exemplare' }).click()

    await warnung(page).getByRole('button', { name: 'Verlassen' }).click()

    await expect(page.getByRole('tab', { name: 'Exemplare' })).toHaveAttribute('aria-selected', 'true')
    expect(api.schreiben).toEqual([])
  })
})

// G4 (Review-Runde 3): Zurück und Vor im echten Browser, auch über mehrere Einträge.
test.describe('Browser-Verlauf (AK-13, G4)', () => {
  async function coinHinzufuegenUeberKatalog(page: Page) {
    await oeffne(page, '/coins', 'Katalog')
    await page.getByRole('link', { name: 'Coin hinzufügen' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeVisible()
  }

  /** Geändertes „Coin hinzufügen“ mit dem Katalog als Vor-Eintrag im Verlauf. */
  async function geaendertMitVorEintrag(page: Page) {
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')
    await katalog(page).click()
    await expect(page).toHaveURL(/\/coins$/)
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeVisible()
    await page.getByLabel(/^Name/).fill('Coin Neu')
  }

  test('Zurück und „Verlassen“ führen zum Katalog, danach Vor ohne Dialog', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await coinHinzufuegenUeberKatalog(page)
    await page.getByLabel(/^Name/).fill('Coin Neu')
    await page.goBack()
    await warnung(page).getByRole('button', { name: 'Verlassen' }).click()
    await expect(page).toHaveURL(/\/coins$/)

    await page.goForward()

    await expect(page).toHaveURL(/\/coins\/neu$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeVisible()
    await expect(warnung(page)).toHaveCount(0)
  })

  test('Zurück und „Bleiben“ behalten Seite und Eingabe', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await coinHinzufuegenUeberKatalog(page)
    await page.getByLabel(/^Name/).fill('Coin Neu')
    await page.goBack()

    await warnung(page).getByRole('button', { name: 'Bleiben' }).click()

    await expect(warnung(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/coins\/neu$/)
    await expect(page.getByLabel(/^Name/)).toHaveValue('Coin Neu')
  })

  test('history.go(-3) mit „Verlassen“ landet drei Einträge zurück', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    // Verlauf: Detail → Bearbeiten → Detail → Katalog → Coin hinzufügen; drei zurück ist „Coin bearbeiten“.
    await oeffne(page, DETAIL, COIN.name)
    await page.getByRole('link', { name: 'Bearbeiten' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Coin bearbeiten' })).toBeVisible()
    await page.getByRole('link', { name: 'Abbrechen' }).click()
    await expect(page.getByRole('heading', { level: 1, name: COIN.name })).toBeVisible()
    await katalog(page).click()
    await page.getByRole('link', { name: 'Coin hinzufügen' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeVisible()
    await page.getByLabel(/^Name/).fill('Coin Neu')

    await page.evaluate(() => history.go(-3))
    await warnung(page).getByRole('button', { name: 'Verlassen' }).click()

    await expect(page).toHaveURL(new RegExp(`${DETAIL}/bearbeiten$`))
    await expect(page.getByRole('heading', { level: 1, name: 'Coin bearbeiten' })).toBeVisible()
  })

  test('Vor aus einem geänderten Formular öffnet den Dialog, „Bleiben“ behält die Eingabe', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await geaendertMitVorEintrag(page)

    await page.goForward()
    await warnung(page).getByRole('button', { name: 'Bleiben' }).click()

    await expect(warnung(page)).toHaveCount(0)
    await expect(page).toHaveURL(/\/coins\/neu$/)
    await expect(page.getByLabel(/^Name/)).toHaveValue('Coin Neu')
  })

  test('Vor aus einem geänderten Formular mit „Verlassen“ führt zum nächsten Eintrag', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await geaendertMitVorEintrag(page)

    await page.goForward()
    await warnung(page).getByRole('button', { name: 'Verlassen' }).click()

    await expect(page).toHaveURL(/\/coins$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Katalog' })).toBeVisible()
    expect(api.schreiben).toEqual([])
  })
})

test.describe('beforeunload (AK-15)', () => {
  test('fragt beim Neuladen mit Änderungen per Browser-Dialog nach', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')
    await page.getByLabel(/^Name/).fill('Coin Neu')
    const dialoge: string[] = []
    page.on('dialog', (dialog) => {
      dialoge.push(dialog.type())
      void dialog.dismiss()
    })

    // Neuladen ohne await: Nach dem abgewiesenen beforeunload-Dialog bleibt page.reload() sonst hängen.
    void page.reload({ waitUntil: 'commit', timeout: 3000 }).catch(() => undefined)

    await expect.poll(() => dialoge).toContain('beforeunload')
    await expect(page.getByLabel(/^Name/)).toHaveValue('Coin Neu')
  })

  test('lädt ohne Änderungen ohne Browser-Dialog neu', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')
    const dialoge: string[] = []
    page.on('dialog', (dialog) => {
      dialoge.push(dialog.type())
      void dialog.accept()
    })

    await page.reload()

    await expect(page.getByRole('heading', { level: 1, name: 'Coin hinzufügen' })).toBeVisible()
    expect(dialoge).toEqual([])
  })

  test('meldet das Ereignis als verhindert (cancelable, defaultPrevented)', async ({ page }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/coins/neu', 'Coin hinzufügen')
    await page.getByLabel(/^Name/).fill('Coin Neu')

    const verhindert = await page.evaluate(() => {
      const ereignis = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(ereignis)
      return ereignis.defaultPrevented
    })

    expect(verhindert).toBe(true)
  })
})

test.describe('Startseite (AK-16)', () => {
  test('Startseiten-Verwaltung zeigt bei Änderung weiterhin „Ungespeicherte Änderungen“ mit „Bleiben“/„Verlassen“', async ({
    page,
  }) => {
    api = await richteFormularApiEin(page, ADMIN)
    await oeffne(page, '/verwaltung/startseite', 'Startseite verwalten')
    await page.getByRole('textbox', { name: /^Infotext/ }).fill('Geänderter Infotext')

    await katalog(page).click()

    await expect(warnung(page)).toBeVisible()
    await expect(warnung(page).getByRole('button', { name: 'Bleiben' })).toBeFocused()
    await expect(warnung(page).getByRole('button', { name: 'Verlassen' })).toBeVisible()
  })
})
