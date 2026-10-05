// Typdeklarationen für leer-pruefung.mjs (für global-setup.ts und `tsc --noEmit`).
export const ABBRUCH_MELDUNG: string
export function pruefeSystemtestDatenbankLeer(opts?: { url?: string; fetch?: typeof fetch }): Promise<void>
