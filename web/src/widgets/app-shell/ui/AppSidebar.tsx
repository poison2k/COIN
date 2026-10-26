import { Link, useLocation } from '@tanstack/react-router'
import { HouseIcon, LayoutDashboardIcon, ListIcon, UsersIcon, type LucideIcon } from 'lucide-react'
import { hatBerechtigung, type Berechtigung } from '@/entities/benutzer'
import { ROUTEN } from '@/shared/config'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
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

const NAVIGATION: readonly NavEintrag[] = [
  { titel: 'Startseite', pfad: ROUTEN.start, icon: HouseIcon },
  { titel: 'Katalog', pfad: ROUTEN.coinListe, icon: ListIcon },
  { titel: 'Benutzerverwaltung', pfad: ROUTEN.benutzerverwaltung, icon: UsersIcon, berechtigung: 'users.manage' },
  // startseite (AK-25): nur mit startpage.manage.
  {
    titel: 'Startseite verwalten',
    pfad: ROUTEN.startseiteVerwaltung,
    icon: LayoutDashboardIcon,
    berechtigung: 'startpage.manage',
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
 * Seitenleiste mit Titel und Navigation (AK-14). Navigiert clientseitig über den Router. Einträge mit Berechtigung
 * erscheinen nur, wenn /api/me sie liefert; sonst fehlen sie im DOM (AK-24).
 */
export function AppSidebar({ benutzerZustand }: AppSidebarProps) {
  const pfad = useLocation({ select: (ort) => ort.pathname })
  const { isMobile, setOpenMobile } = useSidebar()
  const benutzer = benutzerZustand.art === 'angemeldet' ? benutzerZustand.benutzer : null
  const eintraege = NAVIGATION.filter((e) => !e.berechtigung || hatBerechtigung(benutzer, e.berechtigung))

  return (
    <Sidebar>
      <SidebarHeader>
        <span className="px-2 py-1 text-lg font-semibold">C.O.I.N.</span>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Hauptnavigation">
              <SidebarMenu>
                {eintraege.map((eintrag) => (
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
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
