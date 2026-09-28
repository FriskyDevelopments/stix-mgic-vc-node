import { ArrowDown, ArrowUpRight, AudioLines, Radio, SlidersHorizontal, UserRound } from 'lucide-react'
import BlurText from '@/components/react-bits/BlurText'
import '@/styles/studio-shell.css'

type Props = {
  signedIn: boolean
  onOpenAccount: () => void
  onOpenMusic: () => void
  onOpenBroadcast: () => void
  onOpenOverlays?: () => void
}

export function StudioMasthead({ signedIn, onOpenAccount, onOpenMusic, onOpenBroadcast, onOpenOverlays }: Props) {
  return <header className="studio-masthead">
    <div className="studio-masthead__brand-row">
      <a className="studio-masthead__brand" href="#room-studio" aria-label="VC Node studio">
        <span className="studio-masthead__mark" aria-hidden="true">vc<span>↗</span></span>
        <span>Frisky Developments<small>VC Node · Creator studio</small></span>
      </a>
      <button className="studio-masthead__account" type="button" onClick={onOpenAccount}><UserRound size={15} aria-hidden="true" />{signedIn ? 'Your account' : 'Sign in'}<ArrowUpRight size={14} aria-hidden="true" /></button>
    </div>
    <div className="studio-masthead__intro">
      <div><p className="studio-masthead__eyebrow">Picture. Sound. People.</p><h1><BlurText text="Set the scene." delay={55} stepDuration={0.18} direction="bottom" /></h1></div>
      <p className="studio-masthead__description">Your picture and sound, in one place.<br />Prepare your output, then bring people in.</p>
    </div>
    <nav className="studio-masthead__navigation" aria-label="Studio shortcuts">
      <a href="#room-studio" className="is-primary"><SlidersHorizontal size={16} aria-hidden="true" />Studio<ArrowDown size={13} aria-hidden="true" /></a>
      <button type="button" onClick={onOpenMusic}><AudioLines size={17} aria-hidden="true" />Music</button>
      <button type="button" onClick={onOpenBroadcast}><Radio size={17} aria-hidden="true" />Broadcast</button>
      {onOpenOverlays ? <button type="button" onClick={onOpenOverlays}>Overlays<ArrowUpRight size={14} aria-hidden="true" /></button> : <a href="/overlay-studio">Overlays<ArrowUpRight size={14} aria-hidden="true" /></a>}
      <span className="studio-masthead__note">Made for the moment.</span>
    </nav>
  </header>
}
