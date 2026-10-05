// Läuft nach dem Start der webServer und vor dem ersten Test (AK-1, AK-5).
// Nur löschbare TS-Syntax verwenden (wird auch per Node-Type-Stripping geladen).
import type { FullConfig } from '@playwright/test'
import { pruefeSystemtestDatenbankLeer } from './scripts/leer-pruefung.mjs'

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await pruefeSystemtestDatenbankLeer()
}
