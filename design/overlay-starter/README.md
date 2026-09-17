# VC Node overlay starter

An empty transparent master and a design brief for 20 broadcast scenes. No finished scene artwork is bundled in this starter.

## Handoff to Google Stitch

1. Use **DESIGN.md** as design context, then paste **STITCH-PROMPT.md** as the request.
2. Provide the contents of **empty.html** as the structural reference using the text/context inputs available in your Stitch workflow. If that workflow supports reference files, attach the relevant files there. This handoff does not assume that Stitch accepts or imports an HTML upload.
3. Open `empty.html` locally to inspect the master. It is intentionally blank. Add `?guides=1` to the local URL for a clearly labeled 1920 × 1080 reference view. A whole-page screenshot with guides enabled contains the guides; remove the query before capturing graphics.
4. Review the proposed scenes, then translate accepted graphics into VC Node pack layers and validate them with the canonical API. Keep all source media and guide layers outside the export. Stitch output does not automatically become a working VC Node pack.

The HTML works offline with no installation or network dependencies. Its CSS exposes the shared tokens and local font stacks. `#overlay-root` is the only export surface; its initial content is empty. Camera/screen/studio sources come from the application underneath it.

## Generate the empty pack files

Run from the repository root with the existing local `tsx` dependency:

```sh
node --import tsx design/overlay-starter/generate-pack.ts
node --import tsx design/overlay-starter/generate-pack.ts --check
```

The generator imports `src/lib/overlays/index.ts` and produces:

- `empty-master.pack.json`: one transparent `empty-master`, with zero layers.
- `broadcast-scenes.pack.json`: the 20 named broadcast scenes, each with zero layers.

Both use the validated canonical schema and remain draft / commercially unreviewed. The script only creates missing files; it refuses to overwrite files whose content differs from the current factories. Save authored packs separately. `--check` verifies that generated files still match the canonical empty starters without writing.

Scene IDs and names come from the canonical starter factory. The prompt repeats them for the design handoff; keep it aligned when that factory changes. Source-slot notes are composition guidance and must not be added as unsupported JSON fields.

## Review before using a designed pack

Confirm transparent media areas, readable text over real video, correct dimensions, and no exported guides or preview imagery. Confirm that bound text comes from actual supplied values and that proposed timers or new source arrangements have been implemented before treating them as working features. Validate and review each authored pack before marking it ready.

Future sellable packs need separate asset/font rights review and commercial decisions. This starter implements no licensing grant, checkout, billing, or store.
