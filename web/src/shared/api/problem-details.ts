/** Fehlerantwort nach RFC 9457. */
export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  errors?: Record<string, string[]>
  /** Maschinenlesbarer Grund, z. B. `benutzer_deaktiviert`, `letzter_administrator` (rollen-benutzerverwaltung). */
  code?: string
}
