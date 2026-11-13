import { Link, useLocation } from '@tanstack/react-router'
import {
  CoinsIcon,
  HouseIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  ShieldCheckIcon,
  UsersIcon,
  type LucideIcon,
} from 'lucide-react'
import { useId } from 'react'
import { hatBerechtigung, type Berechtigung } from '@/entities/benutzer'
import { ROUTEN } from '@/shared/config'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/shared/ui/sidebar'
import type { BenutzerZustand } from './Kopfzeile'

interface NavEintrag {
  titel: string
  pfad: (typeof ROUTEN)[keyof typeof ROUTEN]
  icon: LucideIcon
  /** Nur sichtbar mit dieser Berechtigung (rollen-benutzerverwaltung, AK-24); ohne Angabe für alle. */
  berechtigung?: Berechtigung
}

interface NavGruppe {
  label: string
  eintraege: readonly NavEintrag[]
}

/** Gruppen in fester Reihenfolge, nur bestehende Routen (design-fundament, Abschnitt 6.2, D4). */
const NAVIGATION: readonly NavGruppe[] = [
  { label: 'Übersicht', eintraege: [{ titel: 'Startseite', pfad: ROUTEN.start, icon: HouseIcon }] },
  { label: 'Coins', eintraege: [{ titel: 'Katalog', pfad: ROUTEN.coinListe, icon: LibraryIcon }] },
  {
    label: 'Prüfung',
    // hologrammnummer (AK-28): für alle drei Rollen über coins.read.
    eintraege: [
      { titel: 'Zertifikat prüfen', pfad: ROUTEN.pruefung, icon: ShieldCheckIcon, berechtigung: 'coins.read' },
    ],
  },
  {
    label: 'Verwaltung',
    eintraege: [
      { titel: 'Benutzerverwaltung', pfad: ROUTEN.benutzerverwaltung, icon: UsersIcon, berechtigung: 'users.manage' },
      // startseite (AK-25): nur mit startpage.manage.
      {
        titel: 'Startseite verwalten',
        pfad: ROUTEN.startseiteVerwaltung,
        icon: LayoutDashboardIcon,
        berechtigung: 'startpage.manage',
      },
    ],
  },
]

/**
 * Aktiv auf dem eigenen Pfad und auf Unterseiten (z. B. „Katalog“ auf /coins/neu und /coins/{id}, katalog-seiten
 * AK-25). `aria-current` setzt der Link selbst, nur auf dem exakten Pfad.
 */
function istAktiv(pfad: string, ziel: string): boolean {
  return pfad === ziel || (ziel !== ROUTEN.start && pfad.startsWith(`${ziel}/`))
}

export interface AppSidebarProps {
  benutzerZustand: BenutzerZustand
}

/**
 * Seitenleiste mit Titel und gruppierter Navigation (design-fundament, Abschnitt 6.2, AK-27/AK-28). Navigiert
 * clientseitig über den Router. Einträge mit Berechtigung erscheinen nur, wenn /api/me sie liefert; Gruppen ohne
 * sichtbaren Eintrag fehlen im DOM. Jede Gruppenliste trägt ihr Label als zugänglichen Namen.
 */
export function AppSidebar({ benutzerZustand }: AppSidebarProps) {
  const pfad = useLocation({ select: (ort) => ort.pathname })
  const { isMobile, setOpenMobile } = useSidebar()
  const idPraefix = useId()
  const benutzer = benutzerZustand.art === 'angemeldet' ? benutzerZustand.benutzer : null
  const gruppen = NAVIGATION.map((gruppe) => ({
    ...gruppe,
    eintraege: gruppe.eintraege.filter((e) => !e.berechtigung || hatBerechtigung(benutzer, e.berechtigung)),
  })).filter((gruppe) => gruppe.eintraege.length > 0)

  return (
    <Sidebar>
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-4">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <CoinsIcon aria-hidden="true" className="size-5 text-sidebar-primary" />
          C.O.I.N.
        </span>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Hauptnavigation" className="flex flex-col gap-1 py-2">
          {gruppen.map((gruppe, index) => {
            const labelId = `${idPraefix}-gruppe-${index}`
            return (
              <SidebarGroup key={gruppe.label}>
                <SidebarGroupLabel id={labelId}>{gruppe.label}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu aria-labelledby={labelId}>
                    {gruppe.eintraege.map((eintrag) => (
                      <SidebarMenuItem key={eintrag.pfad}>
                        <SidebarMenuButton
                          isActive={istAktiv(pfad, eintrag.pfad)}
                          render={
                            <Link
                              to={eintrag.pfad}
                              activeOptions={{ exact: true, includeSearch: false }}
                              onClick={() => {
                                // Auf schmalen Bildschirmen schließt das Overlay nach der Auswahl.
                                if (isMobile) setOpenMobile(false)
                              }}
                            />
                          }
                        >
                          <eintrag.icon aria-hidden="true" />
                          <span>{eintrag.titel}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )
          })}
        </nav>
      </SidebarContent>
    </Sidebar>
  )
}
