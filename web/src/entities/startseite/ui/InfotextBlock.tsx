import { MarkdownText } from '@/shared/ui/markdown'

/** Infotext als `<section aria-label="Information">` ohne Überschrift, nur über MarkdownText (AK-21, AK-23). */
export function InfotextBlock({ text }: { text: string }) {
  return (
    <section aria-label="Information">
      <MarkdownText text={text} />
    </section>
  )
}
