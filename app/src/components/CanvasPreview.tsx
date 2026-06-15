import { useEffect, useRef, useState } from 'react'
import { Download, ImageIcon, LoaderCircle } from 'lucide-react'
import type { ImageAsset } from '../lib/imageAsset'
import type { AdjustmentValues } from '../lib/imageAdjustments'
import { processImageDataInWorker } from '../lib/adjustmentWorkerClient'
import {
  createExportFilename,
  downloadBlob,
  renderAdjustedImageBlob,
} from '../lib/imageExport'

const MAX_RENDER_EDGE = 1800

interface CanvasPreviewProps {
  image: ImageAsset | null
  adjustments: AdjustmentValues
}

export function CanvasPreview({ image, adjustments }: CanvasPreviewProps) {
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
  }, [adjustments, image, sourceVersion])

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
          <span className="panel-kicker">效果预览</span>
          <h2>{image ? image.file.name : '等待上传实拍照'}</h2>
        </div>
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

      <div className="canvas-stage">
        {!image && (
          <div className="canvas-empty">
            <ImageIcon size={28} />
            <strong>上传实拍照开始调色</strong>
            <span>调节参数后，效果会实时显示在这里</span>
          </div>
        )}
        <canvas ref={canvasRef} className={image ? 'visible' : ''} />
      </div>
    </section>
  )
}
