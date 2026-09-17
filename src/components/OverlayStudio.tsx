import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Download, Grid2X2, Layers, Minus, Plus, Send, Square, Type, Undo2, Upload } from 'lucide-react'
import { createBlankPack, createStarterPack, drawOverlayScreen, exportOverlayPack, exportSVG, importOverlayPack, validateOverlayPack, type OverlayLayer, type OverlayPack, type OverlayScreen } from '@/lib/overlays'
import { clearOverlayOutput, readOverlayDraft, readOverlayOutput, saveOverlayDraft, sendOverlayOutput, subscribeOverlayOutput, type OverlayOutput } from '@/lib/overlay-session'
import '@/styles/overlay-studio.css'

function download(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function outputHTML(pack: OverlayPack, screenId: string) {
  return `<!doctype html>\n<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>VC Node overlay</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}svg{width:100%;height:100%;display:block}</style><body>${exportSVG(pack, screenId)}</body></html>\n`
}

function PreviewCanvas({ pack, screenId }: { pack: OverlayPack; screenId: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const context = ref.current?.getContext('2d')
    if (context) drawOverlayScreen(context, pack, screenId, { clear: true })
  }, [pack, screenId])
  return <canvas ref={ref} width={pack.canvas.width} height={pack.canvas.height} aria-label="Transparent scene preview" />
}

export function OverlayOutputView() {
  const [output, setOutput] = useState<OverlayOutput | null>(() => readOverlayOutput())
  useEffect(() => subscribeOverlayOutput(() => setOutput(readOverlayOutput())), [])
  return <main className="overlay-output" aria-label="Transparent overlay output">
    {output && <PreviewCanvas pack={output.pack} screenId={output.screenId} />}
  </main>
}

export function OverlayStudio() {
  const [initial] = useState(() => {
    try { return { pack: readOverlayDraft() ?? createStarterPack(), error: '' } }
    catch (cause) { return { pack: createStarterPack(), error: cause instanceof Error ? cause.message : 'Browser storage is unavailable. Download your pack to keep it.' } }
  })
  const [pack, setPack] = useState(initial.pack)
  const [screenId, setScreenId] = useState(initial.pack.screens[0].id)
  const [layerId, setLayerId] = useState<string | null>(null)
  const [history, setHistory] = useState<OverlayPack[]>([])
  const [guides, setGuides] = useState(true)
  const [message, setMessage] = useState(initial.error || 'Empty master · 20 broadcast scenes · ready for your artwork')
  const [output, setOutput] = useState<OverlayOutput | null>(() => readOverlayOutput())
  const importRef = useRef<HTMLInputElement>(null)
  const screen = pack.screens.find(item => item.id === screenId) ?? pack.screens[0]
  const layer = screen.layers.find(item => item.id === layerId)
  const outputScreen = output?.pack.screens.find(item => item.id === output.screenId)
  const outputMatches = output && output.screenId === screen.id && JSON.stringify(output.pack) === JSON.stringify(pack)

  useEffect(() => subscribeOverlayOutput(() => setOutput(readOverlayOutput())), [])

  function commit(next: OverlayPack, note = 'Draft saved in this browser.') {
    const checked = validateOverlayPack(next)
    if (!checked.ok) { setMessage(checked.errors.map(error => `${error.path}: ${error.message}`).slice(0, 3).join(' ')); return false }
    try { exportOverlayPack(checked.pack) }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'This pack is too large to save.'); return false }
    setHistory(previous => [...previous.slice(-19), pack])
    setPack(checked.pack)
    try { saveOverlayDraft(checked.pack); setMessage(note) }
    catch { setMessage('Draft updated. Browser storage is unavailable; download the pack to keep it.') }
    return true
  }

  function updateScreen(next: OverlayScreen) {
    commit({ ...pack, screens: pack.screens.map(item => item.id === screen.id ? next : item) })
  }

  function updateLayer(next: OverlayLayer) {
    updateScreen({ ...screen, layers: screen.layers.map(item => item.id === next.id ? next : item) })
  }

  function addLayer(type: OverlayLayer['type']) {
    const id = `layer-${crypto.randomUUID()}`
    const bounds = { unit: 'normalized' as const, x: .05, y: .8, width: .4, height: .12 }
    const next: OverlayLayer = type === 'text'
      ? { id, type, bounds, text: 'Your title', color: 'paper', fontFamily: 'serif', fontSize: 48, fontWeight: 500 }
      : type === 'rect'
        ? { id, type, bounds, fill: 'ink', opacity: .9 }
        : { id, type, bounds: { ...bounds, y: .79, height: 0 }, color: 'mint', strokeWidth: 3 }
    if (commit({ ...pack, screens: pack.screens.map(item => item.id === screen.id ? { ...item, layers: [...item.layers, next] } : item) })) setLayerId(id)
  }

  async function importFile(file?: File) {
    if (!file) return
    if (file.size > 2_000_000) { setMessage('Choose a pack smaller than 2 MB.'); return }
    try {
      const result = importOverlayPack(await file.text())
      if (!result.ok) { setMessage(result.errors.slice(0, 3).map(error => `${error.path}: ${error.message}`).join(' ')); return }
      if (commit(result.pack, 'Pack imported. Output stays on its last sent scene.')) { setScreenId(result.pack.screens[0].id); setLayerId(null) }
    } catch { setMessage('The file could not be read. Choose a local JSON pack.') }
  }

  function undo() {
    const previous = history[history.length - 1]
    if (!previous) return
    setPack(previous)
    setHistory(history.slice(0, -1))
    if (!previous.screens.some(item => item.id === screenId)) setScreenId(previous.screens[0].id)
    setLayerId(null)
    try { saveOverlayDraft(previous); setMessage('Draft change undone. Output is unchanged.') }
    catch { setMessage('Change undone. Download the pack to keep it.') }
  }

  function send() {
    try { sendOverlayOutput(pack, screen.id); setMessage(`${screen.title} sent to overlay output in this browser.`) }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not send output.') }
  }

  return <main className="overlay-studio">
    <header className="overlay-studio__header">
      <a href="/" className="overlay-studio__brand"><ArrowLeft size={16} /><span>VC NODE<small>FRISKY DEVELOPMENTS</small></span></a>
      <span className="overlay-studio__edition">OVERLAY SYSTEM / 01</span>
      <a href="/overlay-output" target="_blank" rel="noreferrer">Open output preview <ArrowUpRight size={16} /></a>
    </header>

    <section className="overlay-studio__intro">
      <div><p className="overlay-studio__eyebrow">THE BROADCAST COLLECTION</p><h1>One system. Every scene.</h1><p>Your empty master for a complete broadcast pack. Design in Stitch, then bring the artwork home.</p></div>
      <div className="overlay-studio__count"><strong>{String(pack.screens.length).padStart(2, '0')}</strong><span>SCENES<br />ONE PACK</span></div>
    </section>

    <div className="overlay-studio__toolbar">
      <div className="overlay-studio__pack-name"><label htmlFor="pack-title">Collection</label><input id="pack-title" key={`title-${pack.title}`} defaultValue={pack.title} maxLength={120} onBlur={event => { if (event.target.value !== pack.title) commit({ ...pack, title: event.target.value }) }} /><span>{pack.status} · v{pack.version}</span></div>
      <div className="overlay-studio__actions">
        <button onClick={undo} disabled={!history.length}><Undo2 size={15} /> Undo</button>
        <button onClick={() => importRef.current?.click()}><Upload size={15} /> Import pack</button>
        <input ref={importRef} type="file" accept="application/json,.json" aria-label="Import overlay pack JSON" hidden onChange={event => { void importFile(event.target.files?.[0]); event.target.value = '' }} />
        <button onClick={() => download(exportOverlayPack(pack), `${pack.packId}.json`, 'application/json')}><Download size={15} /> Download pack</button>
      </div>
    </div>

    <div className="overlay-studio__workspace">
      <aside className="overlay-studio__deck" aria-label="Broadcast scenes">
        <div className="overlay-studio__section-title"><Grid2X2 size={15} /><h2>Scene library</h2><span>{pack.screens.length}</span></div>
        <div className="overlay-studio__scene-list">{pack.screens.map((item, index) => <button key={item.id} className="overlay-studio__scene" aria-pressed={screen.id === item.id} onClick={() => { setScreenId(item.id); setLayerId(null) }}>
          <span className="overlay-studio__scene-number">{String(index + 1).padStart(2, '0')}</span>
          <span><strong>{item.title}</strong><small>{item.layers.length ? `${item.layers.length} layers` : 'Empty canvas'}</small></span>
          <i data-has-layers={item.layers.length > 0} />
        </button>)}</div>
        <p className="overlay-studio__deck-note">Pick a scene to edit.<br />Send it when you’re ready.</p>
      </aside>

      <section className="overlay-studio__stage-section" aria-label="Scene editor">
        <div className="overlay-studio__stage-heading"><div><span className="overlay-studio__eyebrow">PREVIEW</span><h2>{screen.title}</h2></div><button aria-pressed={guides} onClick={() => setGuides(!guides)}><Grid2X2 size={15} /> Guides {guides ? 'on' : 'off'}</button></div>
        <div className="overlay-studio__canvas" style={{ aspectRatio: `${pack.canvas.width}/${pack.canvas.height}` }}>
          <PreviewCanvas pack={pack} screenId={screen.id} />
          {guides && <div className="overlay-studio__guides" aria-hidden="true"><span>SAFE AREA / 5%</span></div>}
          {!screen.layers.length && <div className="overlay-studio__empty" aria-hidden="true"><Plus size={27} strokeWidth={1} /><span>An empty beginning.</span><small>Camera and screen remain underneath your artwork.</small></div>}
        </div>
        <div className="overlay-studio__canvas-meta"><span>{pack.canvas.width} × {pack.canvas.height} · transparent</span><span>Guides and editor labels never appear in output.</span></div>
        <div className="overlay-studio__stage-actions"><div><button onClick={() => download(exportSVG(pack, screen.id), `${screen.id}.svg`, 'image/svg+xml')}><Download size={15} /> Scene SVG</button><button onClick={() => download(outputHTML(pack, screen.id), `${screen.id}.html`, 'text/html')}>Scene HTML</button></div><button className="overlay-studio__primary" onClick={send}><Send size={15} /> {outputMatches ? 'Resend scene' : 'Send to output'}</button></div>
        <div className="overlay-studio__program"><span className="overlay-studio__eyebrow">OVERLAY OUTPUT</span><strong>{outputScreen?.title ?? 'No scene sent'}</strong><small>{output ? `${output.pack.title} · saved snapshot` : 'Send a scene to prepare its graphics.'}</small>{output && <button onClick={() => { try { clearOverlayOutput(); setMessage('Overlay output cleared.') } catch { setMessage('Could not clear browser storage.') } }}>Clear output</button>}</div>
        <div className="overlay-studio__handoff"><div><span className="overlay-studio__eyebrow">START IN STITCH</span><h3>Keep the canvas. Make it yours.</h3><p>Use the empty master with DESIGN.md and the 20-scene brief in the starter folder. Import the reviewed JSON pack here when it’s ready.</p></div><button onClick={() => { const blank = createBlankPack(); download(outputHTML(blank, 'empty-master'), 'vc-node-empty.html', 'text/html'); setMessage('Empty HTML downloaded. It is intentionally transparent and contains no artwork.') }}><Download size={15} /> Empty master</button></div>
      </section>

      <aside className="overlay-studio__inspector" aria-label="Scene properties">
        <div className="overlay-studio__section-title"><Layers size={15} /><h2>Scene properties</h2></div>
        <label>Scene name<input key={`${screen.id}-${screen.title}`} defaultValue={screen.title} maxLength={120} onBlur={event => { if (event.target.value !== screen.title) updateScreen({ ...screen, title: event.target.value }) }} /></label>
        <p className="overlay-studio__eyebrow">ADD A LAYER</p>
        <div className="overlay-studio__add-layers"><button onClick={() => addLayer('text')}><Type size={17} />Text</button><button onClick={() => addLayer('rect')}><Square size={17} />Panel</button><button onClick={() => addLayer('line')}><Minus size={17} />Line</button></div>
        <div className="overlay-studio__layer-list">{screen.layers.length ? [...screen.layers].reverse().map(item => <button key={item.id} aria-pressed={layerId === item.id} onClick={() => setLayerId(item.id)}><span>{item.type === 'text' ? item.text.slice(0, 25) || 'Empty text' : item.type === 'rect' ? 'Panel' : 'Line'}</span><small>{item.visible === false ? 'hidden' : item.type}</small></button>) : <p>No layers yet.<br />This scene exports completely empty.</p>}</div>
        {layer && <div className="overlay-studio__layer-editor" key={layer.id}>
          {layer.type === 'text' && <><label>Text<textarea key={layer.text} defaultValue={layer.text} maxLength={2000} onBlur={event => updateLayer({ ...layer, text: event.target.value })} /></label><label>Typeface<select value={layer.fontFamily} onChange={event => updateLayer({ ...layer, fontFamily: event.target.value as 'sans' | 'serif' | 'mono' })}><option value="serif">Georgia</option><option value="sans">Arial</option><option value="mono">Courier New</option></select></label><label>Font size<input key={layer.fontSize} type="number" min={1} max={512} defaultValue={layer.fontSize} onBlur={event => updateLayer({ ...layer, fontSize: Number(event.target.value) })} /></label></>}
          <label>{layer.type === 'rect' ? 'Fill' : 'Color'}<input key={layer.type === 'rect' ? layer.fill : layer.color} defaultValue={layer.type === 'rect' ? layer.fill : layer.color} onBlur={event => updateLayer(layer.type === 'rect' ? { ...layer, fill: event.target.value as typeof layer.fill } : { ...layer, color: event.target.value as typeof layer.color })} /><small>ink, paper, mint, line, transparent or #hex</small></label>
          <div className="overlay-studio__bounds">{(['x', 'y', 'width', 'height'] as const).map(field => <label key={field}>{field}<input key={`${layer.id}-${field}-${layer.bounds[field]}`} type="number" step={layer.bounds.unit === 'normalized' ? .01 : 1} min={0} defaultValue={layer.bounds[field]} onBlur={event => updateLayer({ ...layer, bounds: { ...layer.bounds, [field]: Number(event.target.value) } })} /></label>)}</div>
          <p className="overlay-studio__unit">Position units: {layer.bounds.unit === 'normalized' ? '0–1 of canvas size' : 'pixels'}</p>
          <label>Opacity<input type="range" min={0} max={1} step={.05} value={layer.opacity ?? 1} onChange={event => updateLayer({ ...layer, opacity: Number(event.target.value) })} /></label>
          <div className="overlay-studio__actions"><button onClick={() => updateLayer({ ...layer, visible: layer.visible === false })}>{layer.visible === false ? 'Show' : 'Hide'}</button><button onClick={() => { updateScreen({ ...screen, layers: screen.layers.filter(item => item.id !== layer.id) }); setLayerId(null) }}>Remove layer</button></div>
          <button onClick={() => { updateScreen({ ...screen, layers: [...screen.layers.filter(item => item.id !== layer.id), layer] }) }}>Bring to front</button>
        </div>}
        <div className="overlay-studio__contract"><span className="overlay-studio__eyebrow">PACK FORMAT / V1</span><p>Text, panels and lines.<br />One renderer for preview, exports and the VC Node compositor.</p><p>Saved in this browser. Download your pack to move it to another device.</p></div>
      </aside>
    </div>
    <footer className="overlay-studio__footer"><span role="status" aria-live="polite">{message}</span><span>VC NODE · GRAPHICS COLLECTION</span></footer>
  </main>
}
