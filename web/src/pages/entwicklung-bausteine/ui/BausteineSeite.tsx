import { InboxIcon, PlusIcon, SaveIcon, SearchIcon, Trash2Icon, CircleCheckIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/shared/ui/alert'
import { Badge } from '@/shared/ui/badge'
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/ui/breadcrumb'
import { Button } from '@/shared/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/shared/ui/card'
import { Checkbox } from '@/shared/ui/checkbox'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog'
import { Formularfeld } from '@/shared/ui/formularfeld'
import { Input } from '@/shared/ui/input'
import { Label } from '@/shared/ui/label'
import { Seitenkopf } from '@/shared/ui/seitenkopf'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select'
import { Spinner } from '@/shared/ui/spinner'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table'
import { Textarea } from '@/shared/ui/textarea'
import { useToast } from '@/shared/ui/toast'
import { Fehlerzustand, Ladeanzeige, Leerzustand } from '@/shared/ui/zustaende'

// Bausteinübersicht (design-fundament, Abschnitt 9, ADR-0036 Punkt 8): lebende Referenz aller Bausteine aus
// shared/ui mit Varianten, Größen und Zuständen. Nur in der Entwicklungsumgebung, ohne API-Aufrufe, nur synthetische
// Daten. Toast-Provider und Toaster stellt die App-Shell bereit.

/** Farbtokens mit statischen Klassen (Tailwind erkennt nur vollständige Klassennamen). */
const FARBEN: ReadonlyArray<{ token: string; klasse: string }> = [
  { token: 'background', klasse: 'bg-background' },
  { token: 'foreground', klasse: 'bg-foreground' },
  { token: 'card', klasse: 'bg-card' },
  { token: 'card-foreground', klasse: 'bg-card-foreground' },
  { token: 'popover', klasse: 'bg-popover' },
  { token: 'popover-foreground', klasse: 'bg-popover-foreground' },
  { token: 'primary', klasse: 'bg-primary' },
  { token: 'primary-foreground', klasse: 'bg-primary-foreground' },
  { token: 'primary-hover', klasse: 'bg-primary-hover' },
  { token: 'secondary', klasse: 'bg-secondary' },
  { token: 'secondary-foreground', klasse: 'bg-secondary-foreground' },
  { token: 'muted', klasse: 'bg-muted' },
  { token: 'muted-foreground', klasse: 'bg-muted-foreground' },
  { token: 'accent', klasse: 'bg-accent' },
  { token: 'accent-foreground', klasse: 'bg-accent-foreground' },
  { token: 'destructive', klasse: 'bg-destructive' },
  { token: 'destructive-foreground', klasse: 'bg-destructive-foreground' },
  { token: 'destructive-subtle', klasse: 'bg-destructive-subtle' },
  { token: 'success', klasse: 'bg-success' },
  { token: 'success-foreground', klasse: 'bg-success-foreground' },
  { token: 'success-subtle', klasse: 'bg-success-subtle' },
  { token: 'warning', klasse: 'bg-warning' },
  { token: 'warning-foreground', klasse: 'bg-warning-foreground' },
  { token: 'warning-subtle', klasse: 'bg-warning-subtle' },
  { token: 'info', klasse: 'bg-info' },
  { token: 'info-foreground', klasse: 'bg-info-foreground' },
  { token: 'info-subtle', klasse: 'bg-info-subtle' },
  { token: 'border', klasse: 'bg-border' },
  { token: 'input', klasse: 'bg-input' },
  { token: 'ring', klasse: 'bg-ring' },
  { token: 'sidebar', klasse: 'bg-sidebar' },
  { token: 'sidebar-foreground', klasse: 'bg-sidebar-foreground' },
  { token: 'sidebar-primary', klasse: 'bg-sidebar-primary' },
  { token: 'sidebar-primary-foreground', klasse: 'bg-sidebar-primary-foreground' },
  { token: 'sidebar-accent', klasse: 'bg-sidebar-accent' },
  { token: 'sidebar-accent-foreground', klasse: 'bg-sidebar-accent-foreground' },
  { token: 'sidebar-border', klasse: 'bg-sidebar-border' },
  { token: 'sidebar-ring', klasse: 'bg-sidebar-ring' },
  { token: 'overlay', klasse: 'bg-overlay' },
  { token: 'logo-surface', klasse: 'bg-logo-surface' },
  { token: 'chart-1', klasse: 'bg-chart-1' },
  { token: 'chart-2', klasse: 'bg-chart-2' },
  { token: 'chart-3', klasse: 'bg-chart-3' },
  { token: 'chart-4', klasse: 'bg-chart-4' },
  { token: 'chart-5', klasse: 'bg-chart-5' },
]

const SCHRIFT: ReadonlyArray<{ klasse: string; beschreibung: string }> = [
  { klasse: 'text-xs', beschreibung: '12/16 px – Metadaten und Badges' },
  { klasse: 'text-sm', beschreibung: '14/20 px – Bedienelemente und Tabellen' },
  { klasse: 'text-base', beschreibung: '16/24 px – Fließtext' },
  { klasse: 'text-lg', beschreibung: '18/28 px – Unterabschnitt (h3)' },
  { klasse: 'text-xl', beschreibung: '20/28 px – Abschnitt (h2)' },
  { klasse: 'text-2xl', beschreibung: '24/32 px – Seitentitel (h1, schmal)' },
  { klasse: 'text-3xl', beschreibung: '30/36 px – Seitentitel (h1, ab 768 px)' },
]

/** Synthetische Coin-Daten für die Beispieltabelle (keine Personendaten). */
const COINS = [
  { kennung: 'C0001', name: 'Coin Alpha', herausgeber: 'Herausgeber Beispiel', auflage: 250, ausgegeben: 12 },
  { kennung: 'C0002', name: 'Coin Bravo', herausgeber: 'Dienststelle Beispiel', auflage: 100, ausgegeben: 100 },
  { kennung: 'C0003', name: 'Coin Charlie', herausgeber: 'Herausgeber Muster', auflage: 40, ausgegeben: 0 },
]

const AUSWAHL = [
  { value: 'alle', label: 'Alle Exemplare' },
  { value: 'verfuegbar', label: 'Verfügbar' },
  { value: 'ausgegeben', label: 'Ausgegeben' },
]

function Abschnitt({ titel, beschreibung, children }: { titel: string; beschreibung?: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="grid min-w-0 gap-4">
      <div className="grid gap-1">
        <h2 id={id} className="text-xl font-semibold">
          {titel}
        </h2>
        {beschreibung && <p className="text-sm text-muted-foreground">{beschreibung}</p>}
      </div>
      {children}
    </section>
  )
}

function Zeile({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>
}

function ToastBeispiele() {
  const { zeige } = useToast()
  return (
    <Zeile>
      <Button
        type="button"
        onClick={() =>
          zeige({ titel: 'Gespeichert', beschreibung: 'Die Änderungen wurden übernommen.', art: 'erfolg' })
        }
      >
        Erfolgsmeldung zeigen
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => zeige({ titel: 'Hinweis', beschreibung: 'Die Liste wurde aktualisiert.', art: 'info' })}
      >
        Hinweis zeigen
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() => zeige({ titel: 'Auflage fast erreicht', beschreibung: 'Nur noch 3 Exemplare.', art: 'warnung' })}
      >
        Warnung zeigen
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={() =>
          zeige({ titel: 'Speichern fehlgeschlagen', beschreibung: 'Bitte später erneut versuchen.', art: 'fehler' })
        }
      >
        Fehler zeigen
      </Button>
    </Zeile>
  )
}

/** Bausteinübersicht unter /entwicklung/bausteine (nur Entwicklung). */
export function BausteineSeite() {
  const eingabeId = useId()
  const auswahlId = useId()

  return (
    <div className="grid min-w-0 gap-10">
      <Seitenkopf
        titel="Bausteinübersicht"
        beschreibung="Alle Bausteine aus shared/ui mit Varianten, Größen und Zuständen. Nur in der Entwicklungsumgebung."
      />

      <Abschnitt titel="Farben" beschreibung="Semantische Tokens aus src/app/styles/index.css (ADR-0035).">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {FARBEN.map(({ token, klasse }) => (
            <li key={token} className="grid min-w-0 gap-1">
              <div aria-hidden="true" className={`h-10 rounded-md border ${klasse}`} />
              <span className="text-xs break-all">--{token}</span>
            </li>
          ))}
        </ul>
      </Abschnitt>

      <Abschnitt titel="Schrift" beschreibung="Geist Variable, Grundgröße 16 px; Stufen text-xs bis text-3xl.">
        <ul className="grid gap-2">
          {SCHRIFT.map(({ klasse, beschreibung }) => (
            <li key={klasse} className="grid min-w-0 gap-0.5">
              <span className={`${klasse} break-words`}>{klasse}</span>
              <span className="text-xs text-muted-foreground">{beschreibung}</span>
            </li>
          ))}
        </ul>
      </Abschnitt>

      <Abschnitt titel="Button" beschreibung="Varianten primär, sekundär, gefährlich und Text; Größen und Zustände.">
        <Zeile>
          <Button type="button">Primär</Button>
          <Button type="button" variant="outline">
            Sekundär
          </Button>
          <Button type="button" variant="destructive">
            <Trash2Icon aria-hidden="true" />
            Gefährlich
          </Button>
          <Button type="button" variant="ghost">
            Text
          </Button>
          <Button type="button" variant="secondary">
            Ruhig
          </Button>
          <Button type="button" variant="link">
            Verweis
          </Button>
        </Zeile>
        <Zeile>
          <Button type="button" size="sm">
            Klein
          </Button>
          <Button type="button">Standard</Button>
          <Button type="button" size="lg">
            Groß
          </Button>
          <Button type="button" size="icon" aria-label="Hinzufügen">
            <PlusIcon aria-hidden="true" />
          </Button>
        </Zeile>
        <Zeile>
          <Button type="button" disabled>
            Deaktiviert
          </Button>
          <Button type="button" laedt>
            <SaveIcon aria-hidden="true" />
            Speichern
          </Button>
          <Button type="button" variant="outline" laedt>
            Wird geladen
          </Button>
        </Zeile>
      </Abschnitt>

      <Abschnitt titel="Eingabefeld">
        <div className="grid max-w-reading gap-4">
          <div className="grid gap-2">
            <Label htmlFor={`${eingabeId}-normal`}>Name</Label>
            <Input id={`${eingabeId}-normal`} defaultValue="Coin Alpha" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${eingabeId}-suche`}>Suche</Label>
            <div className="relative">
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-3 left-3 size-4 text-muted-foreground"
              />
              <Input id={`${eingabeId}-suche`} type="search" placeholder="Name oder Herausgeber" className="pl-9" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${eingabeId}-fehler`}>Auflage (fehlerhaft)</Label>
            <Input
              id={`${eingabeId}-fehler`}
              defaultValue="-3"
              aria-invalid="true"
              aria-describedby={`${eingabeId}-fehler-text`}
            />
            <p id={`${eingabeId}-fehler-text`} className="text-sm text-destructive">
              Fehler: Die Auflage muss mindestens 1 sein.
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`${eingabeId}-gesperrt`}>Kennung (deaktiviert)</Label>
            <Input id={`${eingabeId}-gesperrt`} defaultValue="C0001" disabled />
          </div>
        </div>
      </Abschnitt>

      <Abschnitt titel="Textbereich">
        <div className="grid max-w-reading gap-2">
          <Label htmlFor={`${eingabeId}-text`}>Beschreibung</Label>
          <Textarea id={`${eingabeId}-text`} defaultValue="Gedenk-Coin zum Jubiläum des Verbands." />
        </div>
      </Abschnitt>

      <Abschnitt titel="Auswahl">
        <div className="grid max-w-reading gap-2">
          <Label id={`${auswahlId}-label`}>Status</Label>
          <Select items={AUSWAHL} defaultValue="alle">
            <SelectTrigger aria-labelledby={`${auswahlId}-label`} className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUSWAHL.map((eintrag) => (
                <SelectItem key={eintrag.value} value={eintrag.value}>
                  {eintrag.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Abschnitt>

      <Abschnitt titel="Checkbox" beschreibung="Zustände aus, an, unbestimmt und deaktiviert.">
        <div className="grid gap-1">
          <label className="flex min-h-10 w-fit items-center gap-3 text-sm">
            <Checkbox />
            Nur verfügbare Exemplare
          </label>
          <label className="flex min-h-10 w-fit items-center gap-3 text-sm">
            <Checkbox defaultChecked />
            Mit Motivbild
          </label>
          <label className="flex min-h-10 w-fit items-center gap-3 text-sm">
            <Checkbox indeterminate />
            Alle Coins (teilweise gewählt)
          </label>
          <label className="flex min-h-10 w-fit items-center gap-3 text-sm">
            <Checkbox disabled />
            Archiviert (deaktiviert)
          </label>
        </div>
      </Abschnitt>

      <Abschnitt titel="Formularfeld" beschreibung="Label, Hilfetext, Fehler und Pflicht in einem Baustein.">
        <div className="grid max-w-reading gap-6">
          <Formularfeld label="Herausgeber" hilfetext="Wie auf dem Coin geprägt." pflicht>
            {(feld) => <Input {...feld} defaultValue="Herausgeber Beispiel" />}
          </Formularfeld>
          <Formularfeld
            label="Auflage"
            hilfetext="Ganze Zahl ab 1."
            fehler="Bitte eine Auflage von mindestens 1 angeben."
            pflicht
          >
            {(feld) => <Input {...feld} inputMode="numeric" defaultValue="0" />}
          </Formularfeld>
        </div>
      </Abschnitt>

      <Abschnitt titel="Karte">
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle ebene={3}>Stammdaten</CardTitle>
              <CardDescription>Angaben zum Coin</CardDescription>
              <CardAction>
                <Button type="button" variant="outline" size="sm">
                  Bearbeiten
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <p>Coin Alpha, Herausgeber Beispiel, Auflage 250.</p>
            </CardContent>
            <CardFooter>
              <span className="text-xs text-muted-foreground">Erfasst am 05.10.2026</span>
            </CardFooter>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle ebene={3}>Kleine Karte</CardTitle>
              <CardDescription>Mit geringerem Innenabstand</CardDescription>
            </CardHeader>
            <CardContent>
              <p>Inhalt der kleinen Karte.</p>
            </CardContent>
          </Card>
        </div>
      </Abschnitt>

      <Abschnitt titel="Tabelle" beschreibung="Breite Tabellen scrollen in ihrem Container, nie die Seite.">
        <Table>
          <TableCaption>Beispielhafte Coins (synthetische Daten)</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Kennung</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Herausgeber</TableHead>
              <TableHead className="text-right">Auflage</TableHead>
              <TableHead className="text-right">Ausgegeben</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {COINS.map((coin) => (
              <TableRow key={coin.kennung}>
                <TableCell className="font-mono">{coin.kennung}</TableCell>
                <TableCell>{coin.name}</TableCell>
                <TableCell>{coin.herausgeber}</TableCell>
                <TableCell className="text-right tabular-nums">{coin.auflage}</TableCell>
                <TableCell className="text-right tabular-nums">{coin.ausgegeben}</TableCell>
                <TableCell>
                  {coin.ausgegeben >= coin.auflage ? (
                    <Badge variant="warning">Vergriffen</Badge>
                  ) : (
                    <Badge variant="success">Verfügbar</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Abschnitt>

      <Abschnitt titel="Badge / Status-Chip" beschreibung="Die Bedeutung steht immer im Text.">
        <Zeile>
          <Badge variant="neutral">Entwurf</Badge>
          <Badge variant="info">In Prüfung</Badge>
          <Badge variant="success">
            <CircleCheckIcon aria-hidden="true" />
            Aktiv
          </Badge>
          <Badge variant="warning">Fast vergriffen</Badge>
          <Badge variant="destructive">Storniert</Badge>
          <Badge>Standard</Badge>
          <Badge variant="secondary">Sekundär</Badge>
          <Badge variant="outline">Umriss</Badge>
        </Zeile>
      </Abschnitt>

      <Abschnitt titel="Dialog" beschreibung="Titel, Fokusfalle, Escape schließt, Fokus kehrt zum Auslöser zurück.">
        <Zeile>
          <Dialog>
            <DialogTrigger render={<Button type="button" variant="outline" />}>Dialog öffnen</DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Auflage ändern</DialogTitle>
                <DialogDescription>Die neue Auflage gilt für alle künftigen Exemplare.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-2">
                <Label htmlFor={`${eingabeId}-dialog`}>Neue Auflage</Label>
                <Input id={`${eingabeId}-dialog`} inputMode="numeric" defaultValue="250" />
              </div>
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>Abbrechen</DialogClose>
                <DialogClose render={<Button type="button" />}>Übernehmen</DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Zeile>
      </Abschnitt>

      <Abschnitt titel="Hinweisbanner" beschreibung="Je Variante ein festes Icon; der Titel trägt die Bedeutung.">
        <div className="grid gap-3">
          <Alert variant="info" role="status">
            <AlertTitle>Hinweis</AlertTitle>
            <AlertDescription>Neue Zertifikatsvorlagen gelten erst für künftige Ausgaben.</AlertDescription>
          </Alert>
          <Alert variant="success" role="status">
            <AlertTitle>Gespeichert</AlertTitle>
            <AlertDescription>Die Änderungen wurden übernommen.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTitle>Warnung</AlertTitle>
            <AlertDescription>Die Auflage ist fast erreicht.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Fehler</AlertTitle>
            <AlertDescription>Die Ausgabe konnte nicht gespeichert werden.</AlertDescription>
          </Alert>
          <Alert role="status">
            <AlertTitle>Neutral</AlertTitle>
            <AlertDescription>Ein statischer Hinweis ohne Status.</AlertDescription>
          </Alert>
        </div>
      </Abschnitt>

      <Abschnitt titel="Leerzustand">
        <Leerzustand
          titel="Noch keine Coins"
          titelEbene={3}
          beschreibung="Legen Sie den ersten Coin im Katalog an."
          icon={<InboxIcon />}
          aktion={
            <Button type="button">
              <PlusIcon aria-hidden="true" />
              Coin hinzufügen
            </Button>
          }
        />
      </Abschnitt>

      <Abschnitt titel="Ladeanzeige" beschreibung="Skeleton mit Text nur für Screenreader.">
        <div className="grid gap-6 md:grid-cols-2">
          <Ladeanzeige text="Coin wird geladen …" form="karte" />
          <Ladeanzeige text="Exemplare werden geladen …" form="tabelle" />
        </div>
      </Abschnitt>

      <Abschnitt titel="Fehlerzustand">
        <Fehlerzustand
          titel="Laden fehlgeschlagen"
          meldung="Der Coin konnte nicht geladen werden. Bitte später erneut versuchen."
          onErneutVersuchen={() => {}}
        />
      </Abschnitt>

      <Abschnitt titel="Spinner">
        <Zeile>
          <Spinner className="size-6 text-primary" />
        </Zeile>
      </Abschnitt>

      <Abschnitt titel="Toast" beschreibung="Ergänzende Meldungen; Fehler und Warnungen bleiben stehen.">
        <ToastBeispiele />
      </Abschnitt>

      <Abschnitt
        titel="Seitenkopf"
        beschreibung="Genau ein h1 je Seite; optional Brotkrumen, Beschreibung und Aktionen."
      >
        <p className="text-sm">
          Der Kopf dieser Seite („Bausteinübersicht“ mit Beschreibung) ist ein Seitenkopf. Aktionen stehen ab 640 px
          rechts neben dem Titel, darunter unter dem Titel.
        </p>
      </Abschnitt>

      <Abschnitt titel="Brotkrumen">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Startseite</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbEllipsis />
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/coins">Katalog</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Coin Alpha</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Abschnitt>
    </div>
  )
}
