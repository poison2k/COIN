import { afterEach, describe, expect, it, vi } from 'vitest'
import { beobachteDownloads } from '../../../test/downloads'
import { speichereDatei } from './datei'

// Feature zertifikatsvorlagen, Abschnitt 7 und AK-30: speichereDatei(blob, dateiname) speichert einen Blob über eine
// Object-URL und ein <a download>; das Element wird entfernt und die URL
// erst nach 40 s freigegeben (Rev. 3, sofortiges Freigeben kann den Download in manchen Browsern abbrechen).

describe('speichereDatei', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('löst genau einen Download mit dem übergebenen Dateinamen aus', () => {
    const { downloads } = beobachteDownloads()

    speichereDatei(new Blob(['PK']), 'zertifikatsvorlage-standard.docx')

    expect(downloads.map((d) => d.dateiname)).toEqual(['zertifikatsvorlage-standard.docx'])
  })

  it('lädt genau den übergebenen Blob über eine Object-URL', () => {
    const { downloads } = beobachteDownloads()
    const blob = new Blob(['PK-inhalt'])

    speichereDatei(blob, 'vorlage.docx')

    expect(downloads[0].blob).toBe(blob)
    expect(downloads[0].href).toMatch(/^blob:/)
  })

  it('gibt die Object-URL nicht sofort frei, damit der Browser den Download noch starten kann', () => {
    vi.useFakeTimers()
    const { widerrufen } = beobachteDownloads()

    speichereDatei(new Blob(['PK']), 'vorlage.docx')

    expect(widerrufen).not.toHaveBeenCalled()
  })

  it('gibt die Object-URL vor Ablauf von 40 s nicht frei', () => {
    vi.useFakeTimers()
    const { widerrufen } = beobachteDownloads()

    speichereDatei(new Blob(['PK']), 'vorlage.docx')
    vi.advanceTimersByTime(39_999)

    expect(widerrufen).not.toHaveBeenCalled()
  })

  it('gibt die Object-URL nach 40 s frei', () => {
    vi.useFakeTimers()
    const { downloads, widerrufen } = beobachteDownloads()

    speichereDatei(new Blob(['PK']), 'vorlage.docx')
    vi.advanceTimersByTime(40_000)

    expect(widerrufen).toHaveBeenCalledExactlyOnceWith(downloads[0].href)
  })

  it('hinterlässt kein Link-Element im Dokument', () => {
    beobachteDownloads()

    speichereDatei(new Blob(['PK']), 'vorlage.docx')

    expect(document.querySelectorAll('a[download]')).toHaveLength(0)
  })
})
