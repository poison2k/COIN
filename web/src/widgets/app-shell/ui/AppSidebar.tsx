import { Link, useLocation } from '@tanstack/react-router'
import { HouseIcon, ListIcon, type LucideIcon } from 'lucide-react'
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

interface NavEintrag {
  titel: string
  pfad: (typeof ROUTEN)[keyof typeof ROUTEN]
  icon: LucideIcon
}

const NAVIGATION: readonly NavEintrag[] = [
  { titel: 'Startseite', pfad: ROUTEN.start, icon: HouseIcon },
  { titel: 'Coin-Liste', pfad: ROUTEN.coinListe, icon: ListIcon },
]

/** Seitenleiste mit Titel und Navigation (AK-14). Navigiert clientseitig über den Router. */
export function AppSidebar() {
  const pfad = useLocation({ select: (ort) => ort.pathname })
  const { isMobile, setOpenMobile } = useSidebar()

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
                {NAVIGATION.map((eintrag) => (
                  <SidebarMenuItem key={eintrag.pfad}>
                    <SidebarMenuButton
                      isActive={pfad === eintrag.pfad}
                      render={
                        <Link
                          to={eintrag.pfad}
                          activeOptions={{ exact: true }}
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
