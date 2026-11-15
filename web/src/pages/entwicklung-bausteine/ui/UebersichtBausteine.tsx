import { BanIcon, CircleCheckIcon, SearchXIcon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { Ansichtsumschalter, type Ansicht } from '@/shared/ui/ansichtsumschalter'
import { Ergebniskarte } from '@/shared/ui/ergebniskarte'
import { Rangliste } from '@/shared/ui/rangliste'
import { Leerzustand } from '@/shared/ui/zustaende'
import { Abschnitt, Zeile } from './Abschnitt'

// Bausteine des Features startseite-listen-pruefung (Abschnitt 4.6, AK-38) auf der Bausteinseite: je Baustein ein
// Abschnitt mit allen Varianten, nur synthetische Daten, keine API-Aufrufe.

function AnsichtsumschalterBeispiel() {
  const [wert, setWert] = useState<Ansicht>('tabelle')
  return (
    <Zeile>
      <Ansichtsumschalter wert={wert} onWert={setWert} />
      <span className="text-sm text-muted-foreground">{`Gewählt: ${wert === 'tabelle' ? 'Tabelle' : 'Karten'}`}</span>
      <Ansichtsumschalter wert="karten" onWert={() => undefined} beschriftung="Ansicht (Karten gewählt)" />
    </Zeile>
  )
}

const RANGLISTE = [
  { id: 'a', rang: 1, name: 'Beispiel-Coin Nord', ausgegeben: '1.234 ausgegeben' },
  { id: 'b', rang: 2, name: 'Beispiel-Coin Süd', ausgegeben: '87 ausgegeben' },
  { id: 'c', rang: 3, name: 'Beispiel-Coin Mitte', ausgegeben: '5 ausgegeben' },
]

export function UebersichtBausteine() {
  return (
    <>
      <Abschnitt
        titel="Ansichtsumschalter"
        beschreibung="Zwei Buttons mit aria-pressed in einer Gruppe „Ansicht“; die Wahl bleibt im Browser gespeichert."
      >
        <AnsichtsumschalterBeispiel />
      </Abschnitt>

      <Abschnitt
        titel="Rangliste"
        beschreibung="Geordnete Liste ohne Browser-Nummerierung; Rangzahl sichtbar, „Platz n“ für Screenreader."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Rangliste
            beschriftung="Beispiel-Rangliste"
            eintraege={RANGLISTE.map((e) => ({
              id: e.id,
              rang: e.rang,
              inhalt: <span className="font-medium">{e.name}</span>,
              wert: <span className="text-sm">{e.ausgegeben}</span>,
            }))}
          />
          <Leerzustand titel="Ohne Einträge: Leerzustand statt Liste." titelEbene={3} />
        </div>
      </Abschnitt>

      <Abschnitt
        titel="Ergebniskarte"
        beschreibung="Vier Töne; Titel und Icon unterscheiden das Ergebnis, die Farbe kommt nur hinzu."
      >
        <div className="grid gap-4">
          <Ergebniskarte ton="erfolg" icon={CircleCheckIcon} titel="Erfolg" titelEbene={3} kopfzusatz="Zusatz im Kopf">
            <p>Inhalt der Karte, etwa ein Datensatz.</p>
          </Ergebniskarte>
          <Ergebniskarte ton="gefahr" icon={BanIcon} titel="Gefahr" titelEbene={3} kopfzusatz="Zusatz im Kopf" />
          <Ergebniskarte
            ton="warnung"
            icon={TriangleAlertIcon}
            titel="Warnung"
            titelEbene={3}
            kopfzusatz="Zusatz im Kopf"
          />
          <Ergebniskarte ton="neutral" icon={SearchXIcon} titel="Neutral" titelEbene={3} kopfzusatz="Zusatz im Kopf" />
        </div>
      </Abschnitt>
    </>
  )
}
