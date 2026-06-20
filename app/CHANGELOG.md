# Changelog

## 2.2.0 - 2026-06-20

Shotai V2.2 stabilizes the color workbench around the V2.2 PRD (P0 + P1):

- Fixes the main preview container so image load, switching, and parameter
  updates no longer cause layout jumps, and keeps the previous frame while a
  new render is in flight.
- Stabilizes all four preview modes (original, adjusted, side-by-side, split);
  side-by-side always shows original and adjusted together, and split only
  changes the mask ratio while dragging.
- Makes the current parameters the single source of truth for preview and
  export, with per-image adjustment state preserved when switching images.
- Adds preview render-status feedback (updating / updated / failed-retry) and a
  source label (manual / AI / preset / AI+manual).
- Removes pseudo AI suggestions before analysis, leaving only an empty state
  and a "start analysis" entry.
- Adds an AI soft timeout (~18s) with continue-waiting, re-analyze, and cancel;
  only cancel aborts. Classifies analysis errors (network, timeout,
  invalid-image, bad-response, configuration, quota, service) with per-code
  recovery actions.
- Moves the image queue into the material-selection area (material → preview →
  controls) and shows selected, adjusted, analyzing, and failed states on
  thumbnails.
- Simplifies the adjustment panel to a single numeric input and adds per-group
  and global reset.
- Adds AI apply strength (25% / 50% / 100% and a continuous slider) that blends
  AI suggestions into current parameters instead of overwriting them.
- Adds highlight-clipping, crushed-shadow, and saturation-banding risk
  detection with badges next to the preview (detection only, no auto-fix).

Out of scope (deferred): preset center expansion, project/history records, and
the debug log panel (PRD P2).

## 2.1.0 - 2026-06-16

Shotai V2.1 makes AI color transfer more conservative:

- Scales AI-recommended adjustments before showing or applying them.
- Caps positive exposure, brightness, highlights, whites, contrast, saturation,
  vibrance, clarity, dehaze, and sharpness to prevent harsh output.
- Further compresses highlights and whites when multiple brightening controls
  are positive at the same time.
- Reduces Canvas adjustment mapping strength for exposure, brightness,
  highlights, shadows, whites, blacks, and sharpness.
- Updates the Gemini color-analysis prompt to protect highlights, white walls,
  snow, and skin tones, avoiding blown highlights and excessive contrast.

## 2.0.0 - 2026-06-16

Shotai V2.0 rebuilds the editor around a high-fidelity photography workbench:

- Replaces the vertical V1 flow with a target/current/preview/control workbench.
- Displays uploaded, queued, and preview images without cropping by default.
- Adds a large-image viewer with fit, 100%, zoom in, and zoom out controls.
- Adds original, adjusted, side-by-side, and split comparison preview modes.
- Expands the adjustment model with grouped V2 controls, numeric inputs,
  per-parameter reset, undo/redo, and AI/preset restore actions.
- Upgrades AI color analysis to structured suggestions that require explicit
  user application.
- Adds batch selection, filters, per-photo overrides, selected export,
  successful-item export, and failed-item retry.
- Preserves V1 preset compatibility by migrating missing V2 parameters to
  defaults.

## 1.0.0 - 2026-06-15

Shotai V1.0 completes the first production-ready photography workflow:

- Generate structured pre-shoot scene, lighting, composition, camera-setting,
  and execution guidance from a reference image.
- Compare a target-style image with user photos and apply AI-recommended color
  adjustments.
- Preview and manually tune brightness, contrast, saturation, temperature,
  shadows, and highlights locally in the browser.
- Apply built-in or saved presets, process up to 20 photos, and export JPG or
  batch ZIP results.
- Keep API keys on the server, require upload consent before AI analysis, and
  avoid persisting source images.
- Handle cancellation, malformed model responses, temporary service failures,
  unsupported files, oversized images, and partial batch failures.

Release validation:

- `npm run verify`
- Production Docker and Render deployment configuration included
- `/health` endpoint available for deployment health checks
