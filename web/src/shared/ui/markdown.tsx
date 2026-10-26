import Markdown, { type Components } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import { cn } from '@/shared/lib/cn'

// Einzige Markdown-Stelle im Frontend (ADR-0031 Punkt 6, Entscheidung S4). react-markdown erzeugt React-Elemente und
// nie innerHTML; rohes HTML wird entfernt (skipHtml, kein Plugin für rohes HTML). Fest konfiguriert, nicht per Props änderbar.

/** Positivliste der Elemente; alle anderen werden durch ihren Textinhalt ersetzt, Bilder entfallen. */
const ERLAUBTE_ELEMENTE = ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a']

/** Leer- und Steuerzeichen im Ziel machen einen Link unzulässig (verschleierte Schemata wie „java\tscript:“). */
// eslint-disable-next-line no-control-regex -- Steuerzeichen sind hier genau das, was erkannt werden soll.
const LEER_ODER_STEUERZEICHEN = /[\s\u0000-\u001f\u007f-\u009f]/

/** Externe Links: http und https. */
function istExtern(ziel: string): boolean {
  return /^https?:/i.test(ziel)
}

/**
 * Positivliste der Link-Ziele: `http:`, `https:`, `mailto:` und relative Pfade mit genau einem führenden `/` (nicht
 * `//`, nicht `/\`, auch nicht kodiert). Alles andere (`javascript:`, `data:`, `vbscript:`, `file:` …) ist unzulässig.
 */
export function istErlaubtesZiel(ziel: string | null | undefined): ziel is string {
  if (!ziel || LEER_ODER_STEUERZEICHEN.test(ziel)) return false
  if (/^(https?|mailto):/i.test(ziel)) return true
  return /^\/(?![/\\])/.test(ziel) && !/^\/%5c/i.test(ziel) && !/^\/%2f/i.test(ziel)
}

/** Unzulässige Ziele werden entfernt; der Link erscheint dann als reiner Text (Komponente `a`). */
function urlPruefen(url: string): string | null {
  return istErlaubtesZiel(url) ? url : null
}

const KOMPONENTEN: Components = {
  a: ({ href, children }) => {
    if (!istErlaubtesZiel(href)) return <>{children}</>
    const extern = istExtern(href)
    return (
      <a
        href={href}
        rel="noopener noreferrer"
        target={extern ? '_blank' : undefined}
        className="font-medium text-primary underline underline-offset-4"
      >
        {children}
        {extern ? (
          <>
            {' '}
            <span className="sr-only">(öffnet in neuem Tab)</span>
          </>
        ) : null}
      </a>
    )
  },
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-6">{children}</ol>,
}

export interface MarkdownTextProps {
  /** Markdown-Quelle (z. B. der Infotext der Startseite); nie vertrauenswürdig. */
  text: string
  className?: string
}

/** Stellt eingeschränktes Markdown sicher dar: fett, kursiv, Listen, Absätze, Zeilenumbrüche und geprüfte Links. */
export function MarkdownText({ text, className }: MarkdownTextProps) {
  return (
    <div className={cn('grid gap-3 leading-relaxed', className)}>
      <Markdown
        remarkPlugins={[remarkBreaks]}
        allowedElements={ERLAUBTE_ELEMENTE}
        unwrapDisallowed
        skipHtml
        urlTransform={urlPruefen}
        components={KOMPONENTEN}
      >
        {text}
      </Markdown>
    </div>
  )
}
