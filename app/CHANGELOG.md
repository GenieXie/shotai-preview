# Changelog

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
