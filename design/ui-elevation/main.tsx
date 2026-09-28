// The design preview has been replaced by the real, same-origin VC Node UI.
const target = new URL('https://vc.friskydev.com/assets/studio-20260908g.html')
const requested = new URLSearchParams(window.location.search)
if (requested.get('room')) target.searchParams.set('room', requested.get('room')!)
else if (requested.get('action') === 'new-room') target.searchParams.set('action', 'new-room')
target.hash = window.location.hash
window.location.replace(target.toString())
