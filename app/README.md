# Shotai

Shotai is an AI-assisted photography and color-grading workspace.

## Current Version

V3.2.0 prototype-aligned workbench review build. Building on V3.1's model
fallback and multi-round AI refine work, V3.2 tightens the post-shoot layout
around the V3 prototype: a compact material strip, larger preview workspace,
and denser right-side controls for review.
See `CHANGELOG.md` for the full version history.

Core workbench capabilities:

- Upload a target-style image and up to 20 user photos (200MB total).
- Use a desktop workbench layout with target image, current photo, preview,
  queue, AI suggestions, presets, and manual controls visible together.
- Preview every image with contain-fit display and open any image in a zoomable
  large-image viewer.
- Compare original and adjusted output with original, adjusted, side-by-side,
  and split preview modes.
- Manually adjust grouped V2 parameters with sliders, numeric inputs,
  per-parameter reset, undo/redo, and AI/preset restore.
- Generate structured AI color suggestions and apply them only after user
  confirmation.
- Select any queued photo for preview and AI analysis, apply adjustments to the
  current, selected, or all photos, and mark per-photo overrides.
- Export the current image as JPG, selected photos, successful photos, or the
  whole batch as one ZIP with quality and max-edge controls.
- Track per-image batch export progress across queued, decoding, processing,
  encoding, packaging, done, and error states.
- Process batch exports with limited concurrency and retry failed items without
  blocking already successful photos.
- Skip duplicate files and recover cleanly from partial processing failures.
- Reject images above 40MP and warn about panoramas, low resolution, large
  files, PNG transparency, and possible wide-gamut color differences.
- Process pixel adjustments in a reusable cancellable Worker queue.
- Render previews in a fast low-resolution pass followed by a final high-quality
  pass to improve slider responsiveness on large images.
- Detect highlight, shadow, and saturation risks during the same pixel pass used
  for preview adjustments.
- Cancel in-flight AI analysis and batch export without clearing user work.
- Check API proxy health and classify timeout, quota, authentication, and
  service errors.
- Confirm image-upload consent before requesting AI analysis.
- Send model requests through a local API proxy so the browser never receives the API key.
- Upload a reference image and generate structured scene, lighting, composition,
  camera-setting, and execution guidance.
- Copy the generated pre-shoot plan and review its confidence and uncertainty.
- Automatically retry temporary Gemini capacity and network failures.
- Apply six built-in style presets and adjust their strength.
- Save, rename, delete, import, and export up to 100 local custom presets.
- Preserve custom presets across browser refreshes without storing source images.

## Local Development

Requirements:

- Node.js 24+
- npm 11+
- A Gemini API key for live AI analysis

Install dependencies:

```bash
npm install
```

Run the web app and API proxy together:

```bash
cp .env.example .env.local
# Edit .env.local and set GEMINI_API_KEY.
# If direct access to Gemini is unavailable, keep the Clash proxy settings.
npm run dev:full
```

Then open [http://127.0.0.1:5173](http://127.0.0.1:5173).

Without `GEMINI_API_KEY`, the app remains usable for upload, manual adjustment,
Canvas preview, and JPG export. AI analysis returns a clear configuration error.

Optional environment variables:

```bash
GEMINI_MODEL=gemini-2.5-flash
SHOTAI_API_PORT=8787
SHOTAI_WEB_ORIGIN=http://127.0.0.1:5173
HTTPS_PROXY=http://127.0.0.1:7897
HTTP_PROXY=http://127.0.0.1:7897
NO_PROXY=127.0.0.1,localhost
```

`npm run dev:api` and `npm run dev:full` enable Node's environment-proxy
support. After changing `.env.local` or the Clash port, stop and restart
`npm run dev:full`; hot reload does not reload process-level proxy settings.

For Clash running on port `7897`, you can start without editing proxy variables:

```bash
npm run dev:full:clash
```

Run services separately:

```bash
npm run dev:api
npm run dev
```

## Verification

```bash
npm run verify
```

Production deployment files are documented in [DEPLOYMENT.md](./DEPLOYMENT.md).
The current privacy behavior is summarized in [PRIVACY.md](./PRIVACY.md).
Release history is documented in [CHANGELOG.md](./CHANGELOG.md).
