# Prompt for Google Stitch

Create a coherent family of **20 selectable BROADCAST overlay scenes for VC Node**, using the accompanying DESIGN.md and empty.html source as the canvas contract and visual reference. This is a broadcast overlay design task. Keep account, authentication, payment, billing, and application settings interfaces outside this deliverable.

First preserve an **EMPTY MASTER**: 1920 × 1080, fully transparent, zero visible graphics or text, semantic root `#overlay-root[data-overlay-root]`, scene ID `empty-master`. Do not decorate this master. Reference guides and source placeholders must live outside the exported artwork and be clearly excluded from export.

Then propose the following exact scene family. Keep names and order unchanged. Scene IDs match the starter pack; retain them through design iteration.

| ID | Scene | Design intent |
| --- | --- | --- |
| screen-01 | Starting Soon | Session title area with calm opening composition |
| screen-02 | Live Camera | Maximum transparent camera area with a restrained name plate |
| screen-03 | Just Chatting | Conversational camera framing and optional topic text |
| screen-04 | Screen Share | Prioritize a large unobstructed transparent screen area |
| screen-05 | Presentation | Clear slide area with space for a presentation title |
| screen-06 | Interview | Specify two transparent speaker areas and optional names |
| screen-07 | Guest Spotlight | Prioritize a guest source with a clear name/title hierarchy |
| screen-08 | Panel | Specify a flexible arrangement of transparent participant areas |
| screen-09 | Co-host | Balanced paired source layout with matching name treatments |
| screen-10 | Music Session | Preserve performer video with optional session/track text |
| screen-11 | DJ Set | Preserve studio video with restrained set identification |
| screen-12 | Now Playing | Legible track title/artist treatment using supplied values |
| screen-13 | Intermission | A calm pause composition with editable session copy |
| screen-14 | Be Right Back | Brief operator-selected pause message |
| screen-15 | Technical Pause | Clear operator-selected pause message without fake diagnostics |
| screen-16 | Countdown | Reserved timing area; specify a real timer binding as future work |
| screen-17 | Announcement | A readable headline with optional supporting copy |
| screen-18 | Credits | An orderly text hierarchy for supplied credits |
| screen-19 | Ending | Closing session copy with room for supplied acknowledgments |
| screen-20 | Offline | An operator-selected closing slate with editable text |

Use ink `#111a1c`, paper `#f5f2ec`, mint `#70c8ac`, and line `#334144`. Use Georgia titles, local system sans supporting text, and local system mono metadata. Follow the spacious editorial styling of DESIGN.md: quiet dividers, readable labels, restrained accents, consistent type and spacing. Suggest a 96px horizontal / 54px vertical text safe inset without painting a safe-area border into the art.

Camera, screen, guest, and studio areas are **transparent source slots** for underlying real media. Do not substitute stock photos, screenshots, gradients, or simulated video players in those slots. Multiple source arrangements are design specifications pending runtime integration, not a claim that new media routing already works. If a presentation needs sample media for review, keep it in a separate, explicitly non-exported reference layer.

Use supplied runtime text only. The existing bindings are `session.title`, `host.name`, `guest.name`, `track.title`, `track.artist`, and `scene.title`; unknown values remain blank. Do not invent a person's name, track, chat, live indicator, service connection, viewer count, or timer value. Static sample copy must be marked as a design example outside the exported overlay. Do not request credentials or reconstruct authentication/billing interfaces.

Deliver a scene overview and editable per-scene designs with dimensions, text styles, layer bounds, and transparent source-slot notes. Keep the empty master separate and untouched. Prefer rect, line, and text graphics so the designs can be translated into VC Node's existing validated pack format. Supply implementation notes for anything that exceeds those primitives. Design output still needs translation and validation; it must not be labeled a ready-to-import pack until that work passes.

Treat the family as a **draft, commercially unreviewed** starting point for future packs. Do not invent a license, a price, purchase flow, or commercial approval. The current starter manifest contains 20 empty scenes; this prompt asks for design proposals, not an assertion that finished artwork already exists.
