# VC Node broadcast overlays

Design a family of broadcast graphics over real video. The master is intentionally empty. Scene names are selectable inventory entries, not finished designs or detected broadcast states.

## Canvas and empty master

- Logical canvas: **1920 × 1080**, 16:9, transparent background.
- Export surface: `#overlay-root[data-overlay-root]` in `empty.html`.
- `empty-master` contains no authored layers, text, logo, frame, timer, placeholder image, or background fill. Its pack has `layers: []`.
- Keep the page and root transparent. A browser may display transparency as white; that is not a white canvas fill.
- `?guides=1` shows reference guides outside the export root. Omit that query for capture; exclude every `[data-export-exclude]` element when exporting. Never flatten the guides into artwork.
- Suggested text safe inset: 96px horizontally, 54px vertically. This is guidance, not an exported border.

## Visual language

| Token | Value | Role in authored scenes |
| --- | --- | --- |
| Ink | `#111a1c` | Compact title plates and readable text on paper |
| Paper | `#f5f2ec` | Main type and occasional light plates |
| Mint | `#70c8ac` | Small accents, selected emphasis, rules |
| Line | `#334144` | Quiet dividers and frame details |

Use Georgia for editorial titles, the local system sans stack for names and supporting copy, and the local system mono stack for timing or short metadata. No remote font dependency. The pack renderer currently maps `serif` to Georgia, `sans` to Arial, and `mono` to Courier New; check type wrapping in the renderer before accepting a design.

Start with 56–88px scene titles, 28–40px names, and 22–28px metadata at 1080p. Keep shared baselines, generous spacing, quiet rules, and a restrained mint accent. Prioritize readable faces, slides, and screen content. Avoid dense dashboard chrome, neon effects, or decorative telemetry.

## Real media and text

A **source slot** is reserved transparent space where VC Node supplies camera, screen, or studio video beneath the graphics. It is not a baked image, a simulated player, or permission to acquire a device. `data-source-slot="primary"` is an optional HTML design convention; it is not a supported pack layer type. Secondary camera/guest slots are composition specifications until runtime support is confirmed.

Place graphics around the source area. Do not cover shared-screen content with a full-canvas opaque rectangle. Preview media belongs in a separate reference/composition layer and must be excluded from exported graphics.

Runtime-supported text bindings are `session.title`, `host.name`, `guest.name`, `track.title`, `track.artist`, and `scene.title`. Use empty fallback text when a value is unavailable. Never invent a host name, guest, song, viewer count, connection indicator, or service status. Choosing an Offline or Technical Pause scene is an operator action, not a detected outage. Countdown behavior needs a real operator-controlled timer; a mock time is not a working timer.

## Pack contract and delivery

`src/lib/overlays/index.ts` is the authoritative pack API. Generate metadata with `generate-pack.ts`; do not maintain a second handwritten schema. The empty master and all 20 starter scenes initially have zero layers.

The current portable drawing vocabulary is **rect, line, text** with explicit bounds. Keep camera/screen slots transparent by leaving those areas unpainted. Translate reviewed design output into that vocabulary and validate it before importing into VC Node. HTML/CSS output is a design reference, not automatically an importable pack. Images, video, arbitrary scripts, effects, and new data bindings require separate implementation.

Keep author metadata blank until supplied. New packs stay `status: "draft"` and `commercialStatus: "unreviewed"`. These fields make future pack inventory possible; they do not grant licenses, approve sale, or implement a store. Track asset/font rights and review the finished pack separately before any commercial release.
