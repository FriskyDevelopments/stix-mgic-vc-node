# VC Node overlay system v1

One visual collection is one versioned pack. A collection contains broadcast scenes; each scene contains ordered graphic layers. Future collections reuse this contract and the VC Node renderer instead of forking camera, audio, authentication, or room controls.

```text
Stitch design + DESIGN.md
          ↓ reviewed graphics translated to supported layers
      OverlayPack JSON
          ↓ validated import
      Overlay Studio → preview / edit / export
          ↓ explicit Send to output
      saved scene snapshot
          ├─ transparent output preview, same browser profile
          └─ opt-in VC Node video compositor → existing media output
```

## Local application

Run `npm run dev:web` from the repository and open `/overlay-studio` on the local Vite address. The new route is additive. The app’s camera, sign-in, room and provider callback paths keep their existing owners.

- Select one of the 20 scenes. Names describe the intended broadcast moment; all starter layers are empty.
- Add text, a panel or a line. Select layers to edit position, size, color, opacity and visibility. Text and numeric fields apply when focus leaves the field. New layers use normalized 0–1 bounds; font size and line width use design pixels. Imported pixel bounds also work.
- Layers draw in array order. The inspector lists the frontmost layer first. Bring to front moves a layer to the end of the drawing order. Undo restores draft changes, including an imported pack.
- Download pack preserves editable JSON. Scene SVG and Scene HTML export the current scene as transparent, static graphics. Empty master downloads a zero-layer HTML export. The richer `empty.html` in this handoff is the editable reference for Stitch.
- Send to output creates an independent snapshot. Choosing another scene, changing artwork or undoing a draft does not alter that snapshot. Send again to replace it; Clear output removes it.
- In the existing video compositor controls, enable **Use sent scene in the video compositor** to apply the snapshot over media. A selected empty scene suppresses the default brand mark. Clearing output or disabling the checkbox restores the existing mark settings. This does not start a camera, join a room, or broadcast media.

The draft and output snapshot are browser-local and survive reload when local storage is available. They are not saved to the identity backend. JSON downloads are the portable copy. Different browser profiles, origins, devices, and OBS’s browser process do not share this storage.

## OBS and output preview

`/overlay-output` previews the last explicitly sent graphics on a transparent canvas in the same browser profile and origin. Keep that tab open to see subsequent sends. It is not a cross-device or OBS synchronization endpoint.

For OBS, export **Scene HTML** and choose it as a local file in a Browser Source, using the pack’s dimensions. The exported file is static. Re-export and reload the source after changing a scene. It includes graphics only; keep camera and other sources beneath it. The starter `empty.html` is intentionally transparent, so it displays no artwork until designed.

## Canonical implementation

| Surface | Source |
| --- | --- |
| Schema, limits, empty factories, JSON import/export | `src/lib/overlays/schema.ts` |
| Canvas and SVG rendering, safe text bindings | `src/lib/overlays/renderer.ts` |
| Editor and transparent output route | `src/components/OverlayStudio.tsx` |
| Browser draft/snapshot persistence | `src/lib/overlay-session.ts` |
| Explicit compositor selection control | `src/components/OverlayCompositorControl.tsx` |
| Graphics over real media | `src/lib/compositor/media-compositor.ts` |

`createOverlayPainter(pack, screenId)` validates and isolates the pack once. The video loop retains this painter rather than revalidating every scene on every frame. Canvas and SVG use the same centered, contained aspect-ratio policy. Guides and empty editor labels are separate UI and never enter exports.

Supported layer types are text, rectangle and line. The renderer accepts plain text binding values supplied by a caller; the editor and current compositor selection use the pack’s fallback text. Provider data, guest layouts, timers, animation, images and remote assets are not automatically wired by a scene name or a design. Add these capabilities explicitly to the shared engine when an approved design needs them.

## Future collection releases

Give each designed collection a stable `packId`, human-readable title, semantic version and supplied author. Keep the same scene IDs across versions where the broadcast purpose remains the same. Store authored packs separately from these generated starter files. Validate the finished pack and review its artwork before changing draft/commercial review metadata. Those metadata fields are inventory declarations; v1 implements no marketplace, entitlement enforcement or checkout.

The production deployment is separate from this local implementation. The existing running app is not replaced by an empty canvas.
