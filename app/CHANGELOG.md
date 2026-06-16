# Changelog

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
