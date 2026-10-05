import type { ReactNode } from 'react'
import { ThemeUmschalter } from '@/features/theme-umschalten'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/shared/ui/sidebar'
import { AppSidebar } from './AppSidebar'
import { AnmeldeBereich, type BenutzerZustand } from './Kopfzeile'

export interface AppShellProps {
  /** Anmeldezustand für die Kopfzeile (Anmelden bzw. Name und Abmelden). */
  benutzerZustand: BenutzerZustand
  children: ReactNode
}

/** Layout der App: Seitenleiste, Kopfzeile mit Anmeldung und Umschaltern und Seiteninhalt (AK-14 bis AK-16, AK-30). */
export function AppShell({ benutzerZustand, children }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div className="ml-auto flex min-w-0 items-center gap-2">
            <AnmeldeBereich zustand={benutzerZustand} />
            <ThemeUmschalter />
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
