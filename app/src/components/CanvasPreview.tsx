import { useEffect, useRef, useState } from 'react'
import {
  Columns2,
  Download,
  Eye,
  ImageIcon,
  LoaderCircle,
  PanelLeft,
  SquareSplitHorizontal,
} from 'lucide-react'
import type { ImageAsset } from '../lib/imageAsset'
import type { AdjustmentValues } from '../lib/imageAdjustments'
import { processImageDataInWorker } from '../lib/adjustmentWorkerClient'
import {
  createExportFilename,
  downloadBlob,
  renderAdjustedImageBlob,
} from '../lib/imageExport'

const MAX_RENDER_EDGE = 1800

export type PreviewMode = 'adjusted' | 'original' | 'side-by-side' | 'split'

interface CanvasPreviewProps {
  image: ImageAsset | null
  adjustments: AdjustmentValues
  mode: PreviewMode
  onModeChange: (mode: PreviewMode) => void
  onPreview?: (image: ImageAsset) => void
}

export function CanvasPreview({
  image,
  adjustments,
  mode,
  onModeChange,
  onPreview,
}: CanvasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sourcePixelsRef = useRef<ImageData | null>(null)
  const [ready, setReady] = useState(false)
  const [sourceVersion, setSourceVersion] = useState(0)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !image) {
      setReady(false)
      return
    }

    const source = new Image()
    source.onload = () => {
      const scale = Math.min(1, MAX_RENDER_EDGE / Math.max(source.width, source.height))
      canvas.width = Math.round(source.width * scale)
      canvas.height = Math.round(source.height * scale)
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      sourcePixelsRef.current = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      )
      setSourceVersion((current) => current + 1)
    }
    source.src = image.url
  }, [image])

  useEffect(() => {
    const canvas = canvasRef.current
    const sourcePixels = sourcePixelsRef.current
    if (!canvas || !sourcePixels || !image) return

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        setReady(false)
        const adjusted = await processImageDataInWorker(
          sourcePixels,
          adjustments,
          controller.signal,
        )
        const context = canvas.getContext('2d')
        context?.putImageData(adjusted, 0, 0)
        setReady(true)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setReady(false)
        }
      }
    }, 45)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [adjustments, image, mode, sourceVersion])

  const exportImage = async () => {
    if (!image || exporting) return
    setExporting(true)
    try {
      const blob = await renderAdjustedImageBlob(image, adjustments)
      downloadBlob(blob, createExportFilename(image.file.name))
    } finally {
      setExporting(false)
    }
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
            onClick={() => image && onPreview?.(image)}
            disabled={!image}
          >
            <Eye size={15} />
            查看
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={exportImage}
            disabled={!ready || exporting}
          >
            {exporting ? <LoaderCircle size={17} className="spin" /> : <Download size={17} />}
            {exporting ? '处理中...' : '导出 JPG'}
          </button>
        </div>
      </div>

      <div className={`canvas-stage mode-${mode}`}>
        {!image && (
          <div className="canvas-empty">
            <ImageIcon size={28} />
            <strong>上传实拍照开始调色</strong>
            <span>调节参数后，效果会实时显示在这里</span>
          </div>
        )}
        {image && mode === 'original' && (
          <img className="preview-original" src={image.url} alt="原图预览" />
        )}
        {image && mode === 'side-by-side' && (
          <div className="compare-pair">
            <figure>
              <img src={image.url} alt="原图" />
              <figcaption>原图</figcaption>
            </figure>
            <figure>
              <canvas ref={canvasRef} className="visible" />
              <figcaption>调整后</figcaption>
            </figure>
          </div>
        )}
        {image && mode === 'split' && (
          <div className="split-preview">
            <img src={image.url} alt="原图" />
            <div className="split-adjusted">
              <canvas ref={canvasRef} className="visible" />
            </div>
            <span className="split-handle" aria-hidden="true" />
            <span className="split-label before">原图</span>
            <span className="split-label after">调整后</span>
          </div>
        )}
        {mode === 'adjusted' && (
          <canvas ref={canvasRef} className={image ? 'visible' : ''} />
        )}
      </div>
    </section>
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
