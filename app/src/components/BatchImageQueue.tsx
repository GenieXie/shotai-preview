import { useRef, useState, type ChangeEvent } from 'react'
import {
  CheckCircle,
  Download,
  ImagePlus,
  LoaderCircle,
  Trash2,
  XCircle,
} from 'lucide-react'
import { createImageAsset, type ImageAsset } from '../lib/imageAsset'

export const MAX_BATCH_IMAGES = 20
export const MAX_BATCH_TOTAL_SIZE = 200 * 1024 * 1024

export type BatchExportStatus = 'idle' | 'processing' | 'done' | 'error'

export interface BatchImageItem {
  id: string
  asset: ImageAsset
  exportStatus: BatchExportStatus
  exportError?: string
}

interface BatchImageQueueProps {
  items: BatchImageItem[]
  selectedId: string | null
  exporting: boolean
  onAdd: (assets: ImageAsset[]) => void
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onClear: () => void
  onExportAll: () => void
  onCancelExport: () => void
  exportMessage: string
}

export function BatchImageQueue({
  items,
  selectedId,
  exporting,
  onAdd,
  onSelect,
  onRemove,
  onClear,
  onExportAll,
  onCancelExport,
  exportMessage,
}: BatchImageQueueProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (!files.length) return

    const remaining = MAX_BATCH_IMAGES - items.length
    if (remaining <= 0) {
      setMessage('批量队列已达到 20 张上限。')
      return
    }

    const accepted: ImageAsset[] = []
    const errors: string[] = []
    const seen = new Set(
      items.map(
        (item) =>
          `${item.asset.file.name}:${item.asset.file.size}:${item.asset.file.lastModified}`,
      ),
    )
    let duplicateCount = 0
    let ignoredCount = 0
    let totalSize = items.reduce((sum, item) => sum + item.asset.file.size, 0)

    for (const file of files) {
      const fingerprint = `${file.name}:${file.size}:${file.lastModified}`
      if (seen.has(fingerprint)) {
        duplicateCount += 1
        continue
      }
      if (accepted.length >= remaining || totalSize + file.size > MAX_BATCH_TOTAL_SIZE) {
        ignoredCount += 1
        continue
      }
      try {
        accepted.push(await createImageAsset(file))
        seen.add(fingerprint)
        totalSize += file.size
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : '读取失败'}`)
      }
    }
    onAdd(accepted)

    const notes = []
    if (accepted.length) notes.push(`已加入 ${accepted.length} 张图片`)
    if (duplicateCount) notes.push(`${duplicateCount} 张重复图片未加入`)
    if (ignoredCount) notes.push(`${ignoredCount} 张因数量或 200MB 总容量上限未加入`)
    if (errors.length) notes.push(`${errors.length} 张读取失败`)
    setMessage(notes.join('；') + (notes.length ? '。' : ''))
  }

  return (
    <section className="batch-panel">
      <div className="batch-heading">
        <div>
          <span className="panel-kicker">批量队列</span>
          <h2>我的实拍照 · {items.length}/{MAX_BATCH_IMAGES}</h2>
        </div>
        <div className="batch-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => inputRef.current?.click()}
            disabled={items.length >= MAX_BATCH_IMAGES || exporting}
          >
            <ImagePlus size={16} />
            添加图片
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={exporting ? onCancelExport : onExportAll}
            disabled={!items.length}
          >
            {exporting ? <XCircle size={16} /> : <Download size={16} />}
            {exporting ? '取消处理' : '批量导出 ZIP'}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onClear}
            disabled={!items.length || exporting}
            title="清空队列"
            aria-label="清空批量队列"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        multiple
        accept=".jpg,.jpeg,.png,.webp,.heic,image/jpeg,image/png,image/webp,image/heic"
        onChange={handleFiles}
      />

      {items.length ? (
        <div className="batch-list">
          {items.map((item) => (
            <article
              key={item.id}
              className={item.id === selectedId ? 'batch-item active' : 'batch-item'}
            >
              <button
                type="button"
                className="batch-select"
                onClick={() => onSelect(item.id)}
                aria-label={`预览 ${item.asset.file.name}`}
              >
                <img src={item.asset.url} alt="" />
                <span>
                  <strong>{item.asset.file.name}</strong>
                  <small>
                    {item.asset.width} × {item.asset.height}
                    {item.asset.warnings.length ? ' · 有提示' : ''}
                  </small>
                </span>
              </button>
              <ExportState status={item.exportStatus} error={item.exportError} />
              <button
                type="button"
                className="mini-icon-button danger"
                onClick={() => onRemove(item.id)}
                disabled={exporting}
                title="移除图片"
                aria-label={`移除 ${item.asset.file.name}`}
              >
                <Trash2 size={13} />
              </button>
            </article>
          ))}
        </div>
      ) : (
        <button
          type="button"
          className="batch-empty"
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus size={22} />
          <strong>选择多张实拍照</strong>
          <span>最多 20 张，统一应用当前参数和预设</span>
        </button>
      )}
      {message && <p className="batch-message">{message}</p>}
      {exportMessage && <p className="batch-message export">{exportMessage}</p>}
      {items.some((item) => item.asset.warnings.length) && (
        <p className="batch-message warning">
          队列中部分图片存在低清、超长图、大文件或 PNG 色差风险；仍可手动调色和导出。
        </p>
      )}
    </section>
  )
}

function ExportState({
  status,
  error,
}: {
  status: BatchExportStatus
  error?: string
}) {
  if (status === 'processing') {
    return <LoaderCircle size={15} className="spin batch-state" aria-label="处理中" />
  }
  if (status === 'done') {
    return <CheckCircle size={15} className="batch-state success" aria-label="已导出" />
  }
  if (status === 'error') {
    return <XCircle size={15} className="batch-state error" aria-label={error ?? '导出失败'} />
  }
  return <span className="batch-state idle" aria-hidden="true" />
}
