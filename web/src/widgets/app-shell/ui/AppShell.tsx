import type { ReactNode } from 'react'
import { ThemeUmschalter } from '@/features/theme-umschalten'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/shared/ui/sidebar'
import { AppSidebar } from './AppSidebar'

export interface AppShellProps {
  children: ReactNode
}

/** Layout der App: Seitenleiste, Kopfzeile mit Umschaltern und Seiteninhalt (AK-14 bis AK-16). */
export function AppShell({ children }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger />
          <div className="ml-auto">
            <ThemeUmschalter />
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
