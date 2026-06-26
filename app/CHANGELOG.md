# Changelog

## 3.1.0 - 2026-06-26

Shotai V3.1 — model fallback safety net + multi-round conversational refine:

- **Model fallback**: when the selected Gemini model returns 404 / NOT_FOUND
  (deprecated, renamed, or temporarily unavailable — preview ids churn), the
  backend now auto-retries once with a stable model (`gemini-2.5-flash`) instead
  of surfacing a hard error, and tells the user it switched. New pure,
  unit-tested helpers in `server/modelFallback.mjs`; `requestGemini` split into
  an outer model-fallback loop + inner per-model retry. All three endpoints
  benefit; a `modelNotice` is surfaced in the result views.
- **AI 精修 is now multi-round / conversational** (拍后): each applied turn is
  kept as context, so follow-ups like “刚才有点过，回一点暖” / “再冷一点” / “不够”
  are understood relative to what was already done. The panel is now a thread of
  numbered applied turns + a pending suggestion (预览 / 应用) + 重新开始 /
  撤回上一轮. Backend `/api/color-refine` accepts an optional, bounded `history`;
  switching the source photo starts a fresh conversation. Single-round callers
  are unchanged.
- Palette unchanged (warm green, per product choice) — only the new model-fallback
  notice was tied to the existing `--amber` token for consistency.
- Verified: lint + 25 tests (incl. fallback + notice passthrough) + vite build +
  backend syntax check; color-refine smoke-tested with a malformed history payload.

## 3.0.0 - 2026-06-25

Shotai V3.0 — AI 精修, model switching, and a rebuilt pre-shoot workbench:

- Adds a page-level AI model selector in the top bar. Users can switch between
  `gemini-3.1-pro-preview`, `gemini-3.5-flash`, `gemini-3.1-flash-lite`
  (default), and `gemini-2.5-flash`; the choice is persisted to localStorage and
  sent per request. The backend validates the requested model against an
  allowlist and falls back to the default otherwise. Previously the model could
  only be changed via the `GEMINI_MODEL` env var on the server.
- Raises Gemini `temperature` from 0.2 (color) / 0.3 (before-shoot) to 0.8.
- Lets AI apply strength go from 0–100% up to 0–200% (adds 125% / 150% / 200%
  presets and extends the slider), so users can push AI/preset effects beyond 100%.
- Loosens the AI adjustment safety scaling (was halve-then-cap, which made AI
  edits feel too weak): scale 0.5 → 0.85 and caps raised ~1.8×. Values are
  tunable knobs in `imageAdjustments.ts`.
- Adds the natural-language **AI 精修** module (拍后): type an instruction (e.g.
  “再冷一点，但保留肤色”), get a clamped adjustment delta, then 预览 / 应用 /
  撤回上一轮. Single-round; results are retained and cached per image+instruction.
- Disambiguates reversal now that there are two AI sources: undo/redo steps are
  labeled by source (撤销：AI 精修 / 手动调整 …) and the old “恢复 AI” is split into
  恢复调色建议 / 恢复精修 / 恢复预设.
- 拍后 IA: top nav trimmed to 拍前参考 / 调色工作台 / 预设中心 / 历史记录; the
  scope control is now a segmented 当前图 / 选中图 / 全部.
- Rebuilds the **拍前 workbench**: a multi-reference queue (pick one to analyze),
  a large preview of the selected reference, EXIF extraction
  (camera / ISO / focal / aperture / shutter / exposure via `exifr`, no AI), a
  structured 6-dimension visual analysis, and a 拍前 → 拍后 闭环
  (保存为拍后预设 / 发送到拍后调色).

## 2.3.1 - 2026-06-21

Shotai V2.3.1 speeds up AI analysis and closes the V2.3 PRD gaps:

- Compresses AI analysis images more aggressively before upload.
- Shortens the color-analysis prompt and response schema while preserving the
  existing result shape.
- Lowers front-end and Gemini request timeouts so slow calls fail faster instead
  of leaving the user waiting.
- Reduces Gemini retry delay to one short retry for transient failures.
- Shows AI analysis phases and reuses recent same-image color-analysis results
  from an in-memory cache.
- Adds a collapsible performance panel with preview/export timings, Worker
  queue state, current-image dimensions, and resource-management notes.

## 2.3.0 - 2026-06-21

Shotai V2.3 improves performance and production batch workflows:

- Reuses a cancellable image-adjustment Worker queue instead of creating a new
  Worker for every preview render.
- Adds fast preview rendering followed by a final high-quality pass so slider
  changes feel more responsive on large images.
- Combines preview adjustment and highlight/shadow/saturation risk detection in
  one pixel pass.
- Adds batch export quality and max-edge controls for high-quality, standard,
  and lightweight outputs.
- Processes batch exports with limited concurrency and shows queued, decoding,
  processing, encoding, packaging, completed, and failed states per image.
- Preserves successful batch results when cancellation or per-image failures
  happen, with failed-item retry still available.

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
