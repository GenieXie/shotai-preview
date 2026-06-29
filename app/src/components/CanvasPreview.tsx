import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react'
import {
  AlertCircle,
  Columns2,
  Download,
  Eye,
  ImageIcon,
  LoaderCircle,
  PanelLeft,
  SquareSplitHorizontal,
} from 'lucide-react'
import type { ImageAsset } from '../lib/imageAsset'
import {
  type AdjustmentValues,
  type PreviewRisk,
} from '../lib/imageAdjustments'
import { processImageDataWithRisksInWorker } from '../lib/adjustmentWorkerClient'
import {
  createExportFilename,
  downloadBlob,
  type ExportQuality,
  renderAdjustedImageBlob,
} from '../lib/imageExport'

const MAX_RENDER_EDGE = 1800
const FAST_RENDER_EDGE = 720
const FAST_PREVIEW_RENDER_DELAY_MS = 30
const FINAL_PREVIEW_RENDER_DELAY_MS = 180

export type PreviewMode = 'adjusted' | 'original' | 'side-by-side' | 'split'
export type PreviewRenderStatus =
  | 'idle'
  | 'loading-source'
  | 'rendering'
  | 'ready'
  | 'error'

interface CanvasPreviewProps {
  image: ImageAsset | null
  adjustments: AdjustmentValues
  mode: PreviewMode
  risks?: PreviewRisk[]
  renderStatus?: PreviewRenderStatus
  exportQuality?: ExportQuality
  exportMaxEdge?: number
  onModeChange: (mode: PreviewMode) => void
  onPreview?: (image: Pick<ImageAsset, 'url' | 'width' | 'height'> & { revokeOnClose?: boolean }) => void
  onRenderStatusChange?: (status: PreviewRenderStatus) => void
  onRisksChange?: (risks: PreviewRisk[]) => void
  onRenderMetric?: (metric: {
    pass: 'fast' | 'final'
    durationMs: number
    width: number
    height: number
  }) => void
}

export function CanvasPreview({
  image,
  adjustments,
  mode,
  risks = [],
  renderStatus,
  exportQuality = 'standard',
  exportMaxEdge = 4096,
  onModeChange,
  onPreview,
  onRenderStatusChange,
  onRisksChange,
  onRenderMetric,
}: CanvasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourcePixelsRef = useRef<ImageData | null>(null)
  const fastSourcePixelsRef = useRef<ImageData | null>(null)
  const renderSeqRef = useRef(0)
  const [localStatus, setLocalStatus] = useState<PreviewRenderStatus>('idle')
  const [sourceVersion, setSourceVersion] = useState(0)
  const [exporting, setExporting] = useState(false)
  const [splitPercent, setSplitPercent] = useState(50)
  const status = renderStatus ?? localStatus
  const canExport = !!image && status === 'ready' && !exporting

  const updateStatus = useCallback((next: PreviewRenderStatus) => {
    setLocalStatus(next)
    onRenderStatusChange?.(next)
  }, [onRenderStatusChange])

  useEffect(() => {
    const canvas = canvasRef.current
    sourcePixelsRef.current = null
    fastSourcePixelsRef.current = null
    onRisksChange?.([])

    if (!canvas || !image) {
      updateStatus('idle')
      return
    }

    let cancelled = false
    updateStatus('loading-source')
    const source = new Image()
    source.onload = () => {
      if (cancelled) return
      const scale = Math.min(1, MAX_RENDER_EDGE / Math.max(source.width, source.height))
      const fastScale = Math.min(1, FAST_RENDER_EDGE / Math.max(source.width, source.height))
      canvas.width = Math.max(1, Math.round(source.width * scale))
      canvas.height = Math.max(1, Math.round(source.height * scale))
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) {
        updateStatus('error')
        return
      }

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      sourcePixelsRef.current = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      )
      const fastCanvas = document.createElement('canvas')
      fastCanvas.width = Math.max(1, Math.round(source.width * fastScale))
      fastCanvas.height = Math.max(1, Math.round(source.height * fastScale))
      const fastContext = fastCanvas.getContext('2d', { willReadFrequently: true })
      if (fastContext) {
        fastContext.fillStyle = '#ffffff'
        fastContext.fillRect(0, 0, fastCanvas.width, fastCanvas.height)
        fastContext.drawImage(source, 0, 0, fastCanvas.width, fastCanvas.height)
        fastSourcePixelsRef.current = fastContext.getImageData(
          0,
          0,
          fastCanvas.width,
          fastCanvas.height,
        )
      }
      setSourceVersion((current) => current + 1)
    }
    source.onerror = () => {
      if (!cancelled) updateStatus('error')
    }
    source.src = image.url

    return () => {
      cancelled = true
    }
    // image.url is stable for the asset lifetime and avoids rerunning on object identity churn.
  }, [image, image?.url, onRisksChange, updateStatus])

  useEffect(() => {
    const canvas = canvasRef.current
    const sourcePixels = sourcePixelsRef.current
    const fastSourcePixels = fastSourcePixelsRef.current
    if (!canvas || !sourcePixels || !image) return

    const sequence = renderSeqRef.current + 1
    renderSeqRef.current = sequence
    const fastController = new AbortController()
    const finalController = new AbortController()

    const renderPixels = async (
      pixels: ImageData,
      controller: AbortController,
      finalPass: boolean,
    ) => {
      try {
        const startedAt = performance.now()
        updateStatus('rendering')
        const adjusted = await processImageDataWithRisksInWorker(
          pixels,
          adjustments,
          controller.signal,
        )
        if (renderSeqRef.current !== sequence) return
        const context = canvas.getContext('2d')
        if (context) {
          if (finalPass) {
            context.putImageData(adjusted.imageData, 0, 0)
          } else {
            const fastCanvas = document.createElement('canvas')
            fastCanvas.width = adjusted.imageData.width
            fastCanvas.height = adjusted.imageData.height
            fastCanvas.getContext('2d')?.putImageData(adjusted.imageData, 0, 0)
            context.imageSmoothingEnabled = true
            context.imageSmoothingQuality = 'medium'
            context.drawImage(fastCanvas, 0, 0, canvas.width, canvas.height)
          }
        }
        onRisksChange?.(adjusted.risks)
        onRenderMetric?.({
          pass: finalPass ? 'final' : 'fast',
          durationMs: performance.now() - startedAt,
          width: adjusted.imageData.width,
          height: adjusted.imageData.height,
        })
        if (finalPass) updateStatus('ready')
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          updateStatus('error')
        }
      }
    }

    const fastTimer = window.setTimeout(() => {
      void renderPixels(fastSourcePixels ?? sourcePixels, fastController, false)
    }, FAST_PREVIEW_RENDER_DELAY_MS)
    const finalTimer = window.setTimeout(() => {
      void renderPixels(sourcePixels, finalController, true)
    }, FINAL_PREVIEW_RENDER_DELAY_MS)

    return () => {
      window.clearTimeout(fastTimer)
      window.clearTimeout(finalTimer)
      fastController.abort()
      finalController.abort()
    }
  }, [adjustments, image, onRenderMetric, onRisksChange, sourceVersion, updateStatus])

  const exportImage = async () => {
    if (!image || exporting) return
    setExporting(true)
    try {
      const blob = await renderAdjustedImageBlob(image, adjustments, {
        quality: exportQuality,
        maxEdge: exportMaxEdge,
      })
      downloadBlob(blob, createExportFilename(image.file.name))
    } finally {
      setExporting(false)
    }
  }

  const previewAdjustedImage = () => {
    const canvas = canvasRef.current
    if (!image || !canvas || status !== 'ready') return
    canvas.toBlob((blob) => {
      if (!blob) return
      onPreview?.({
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
        revokeOnClose: true,
      })
    }, 'image/png')
  }

  const updateSplit = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const next = ((event.clientX - bounds.left) / bounds.width) * 100
    setSplitPercent(Math.max(12, Math.min(88, next)))
  }

  return (
    <section className="preview-panel">
      <div className="preview-toolbar">
        <div>
          <span className="panel-kicker">主预览</span>
          <h2>{image ? image.file.name : '等待上传实拍照'}</h2>
        </div>
        <div className="preview-actions">
          <ViewButton mode="adjusted" active={mode === 'adjusted'} onClick={onModeChange} label="调整后" />
          <ViewButton mode="original" active={mode === 'original'} onClick={onModeChange} label="原图" />
          <ViewButton mode="side-by-side" active={mode === 'side-by-side'} onClick={onModeChange} label="并排" />
          <ViewButton mode="split" active={mode === 'split'} onClick={onModeChange} label="分割" />
          <button
            type="button"
            className="secondary-button icon-text"
            onClick={previewAdjustedImage}
            disabled={!image || status !== 'ready'}
          >
            <Eye size={15} />
            查看
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={exportImage}
            disabled={!canExport}
          >
            {exporting ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}
            {exporting ? '处理中...' : '导出 JPG'}
          </button>
        </div>
      </div>

      <div
        className={`canvas-stage mode-${mode}`}
        style={{ '--split-percent': `${splitPercent}%` } as CSSProperties}
        onPointerMove={(event) => {
          if (mode === 'split' && event.buttons === 1) updateSplit(event)
        }}
        onPointerDown={(event) => {
          if (mode === 'split') updateSplit(event)
        }}
      >
        {!image && (
          <div className="canvas-empty">
            <ImageIcon size={28} />
            <strong>上传实拍照开始调色</strong>
            <span>调节参数后，效果会实时显示在这里</span>
          </div>
        )}
        {image && (
          <>
            <div className="preview-original-pane">
              <img className="preview-original" src={image.url} alt="原图预览" />
              <span className="split-label before">原图</span>
            </div>
            <div className="preview-adjusted-pane">
              <canvas ref={canvasRef} className="visible" />
              <span className="split-label after">调整后</span>
            </div>
            {mode === 'split' && (
              <span className="split-handle" aria-hidden="true" />
            )}
            <PreviewStatus status={status} />
            <RiskBadges risks={risks} />
          </>
        )}
      </div>
    </section>
  )
}

function PreviewStatus({ status }: { status: PreviewRenderStatus }) {
  if (status === 'idle' || status === 'ready') {
    return (
      <span className="preview-status ready">
        {status === 'ready' ? '已更新' : '等待图片'}
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="preview-status error">
        <AlertCircle size={13} />
        未生效，可重试
      </span>
    )
  }
  return (
    <span className="preview-status loading">
      <LoaderCircle size={13} className="spin" />
      {status === 'loading-source' ? '读取图片' : '更新中'}
    </span>
  )
}

function RiskBadges({ risks }: { risks: PreviewRisk[] }) {
  if (!risks.length) return null
  return (
    <div className="preview-risks" aria-label="画面风险提示">
      {risks.map((risk) => (
        <span key={risk.type} className={`risk-badge ${risk.type}`} title={`${risk.message}${risk.suggestion}`}>
          {risk.label}
        </span>
      ))}
    </div>
  )
}

function ViewButton({
  mode,
  active,
  label,
  onClick,
}: {
  mode: PreviewMode
  active: boolean
  label: string
  onClick: (mode: PreviewMode) => void
}) {
  const Icon =
    mode === 'side-by-side'
      ? Columns2
      : mode === 'split'
        ? SquareSplitHorizontal
        : PanelLeft
  return (
    <button
      type="button"
      className={active ? 'view-button active' : 'view-button'}
      onClick={() => onClick(mode)}
      aria-pressed={active}
    >
      <Icon size={14} />
      {label}
    </button>
  )
}
