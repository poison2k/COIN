import { MoonIcon, SunIcon } from 'lucide-react'
import { useTheme, type Theme } from '@/shared/lib/theme'
import { Button } from '@/shared/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu'

const EINTRAEGE: ReadonlyArray<{ theme: Theme; text: string }> = [
  { theme: 'light', text: 'Hell' },
  { theme: 'dark', text: 'Dunkel' },
  { theme: 'system', text: 'System' },
]

/** Umschalter für das Farbschema (Hell/Dunkel/System) nach shadcn „Mode Toggle“ (AK-16). */
export function ThemeUmschalter() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="icon" />}>
        <SunIcon className="scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <MoonIcon className="absolute scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
        <span className="sr-only">Farbschema wählen</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        {EINTRAEGE.map((eintrag) => (
          <DropdownMenuItem key={eintrag.theme} onClick={() => setTheme(eintrag.theme)}>
            {eintrag.text}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
