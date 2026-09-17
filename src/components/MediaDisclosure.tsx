import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import '@/styles/creator-folios.css'

export function MediaDisclosure({ title, children, id, status }: { title: string; children: ReactNode; id?: string; status?: string }) {
  // Native details keeps media components mounted while hiding their controls.
  return <details id={id} className="media-disclosure">
    <summary>
      <span>{title}{status && <span className="media-disclosure__status">{status}</span>}</span>
      <span className="media-disclosure__action" aria-hidden="true">
        <span className="when-closed">Expand</span><span className="when-open">Collapse</span>
        <ChevronDown size={16} />
      </span>
    </summary>
    <div className="media-disclosure__body">{children}</div>
  </details>
}

export function openMediaDisclosure(id: string) {
  const panel = document.getElementById(id)
  if (!(panel instanceof HTMLDetailsElement)) return
  panel.open = true
  panel.querySelector('summary')?.focus({ preventScroll: true })
  panel.scrollIntoView({ block: 'start', behavior: 'auto' })
}
