import { MarkdownText } from '@/shared/ui/markdown'

/** Infotext als Karte `<section aria-label="Information">` ohne Überschrift, nur über MarkdownText (AK-21, AK-23). */
export function InfotextBlock({ text }: { text: string }) {
  return (
    <section aria-label="Information" className="rounded-xl border bg-card p-4 text-card-foreground shadow-xs md:p-6">
      <div className="max-w-reading">
        <MarkdownText text={text} />
      </div>
    </section>
  )
}
