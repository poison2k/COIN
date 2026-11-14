import { useMemo, type MouseEvent } from 'react'

// Zeilenklick (formulare-detailseiten, Abschnitt 4.7, ADR-0041 Punkt 6; Logik aus CoinListe, katalog-seiten AK-15):
// Ein Mausklick in die Zeile löst den Link der Zeile aus (Element mit `data-zeilenlink`, sonst der erste Link). Keine
// Navigation bei Folgeklicks, Zusatztasten, markiertem Text oder einem Klick auf ein anderes Bedienelement. Die Zeile
// selbst bekommt keinen Tab-Stopp; per Tastatur dient der Link.

const BEDIENELEMENTE =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [role="combobox"]'

/**
 * Zweiter (oder weiterer) Klick einer Mehrfachklick-Serie, z. B. eines Doppelklicks auf „Vorherige Seite“, während die
 * Tabelle darunter wächst. Er darf keine Detailseite öffnen. Enter und synthetische Klicks haben `detail` 0.
 */
function istFolgeklick(e: MouseEvent) {
  return e.detail >= 2
}

function zeileGeklickt(e: MouseEvent<HTMLElement>) {
  if (e.defaultPrevented || e.button !== 0) return
  if (istFolgeklick(e)) return
  // Mit Zusatztaste (neuer Tab, neues Fenster …) nicht still in diesem Tab navigieren.
  if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return
  if (e.target instanceof Element && e.target.closest(BEDIENELEMENTE)) return
  // Markierter Text (z. B. zum Kopieren) löst keine Navigation aus.
  if (window.getSelection()?.toString()) return
  const link =
    e.currentTarget.querySelector<HTMLAnchorElement>('a[data-zeilenlink]') ?? e.currentTarget.querySelector('a')
  link?.click()
}

/** Am Link der Zeile: Folgeklicks verwerfen, bevor der Router navigiert; `preventDefault` hält auch den Browser ab. */
function linkGeklickt(e: MouseEvent<HTMLAnchorElement>) {
  if (istFolgeklick(e)) e.preventDefault()
}

export function useZeilenklick() {
  return useMemo(() => ({ zeileGeklickt, linkGeklickt }), [])
}
