import { useRef, useState, type ChangeEvent } from 'react'
import {
  CheckCircle,
  Download,
  Eye,
  LoaderCircle,
  ImagePlus,
  RotateCcw,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react'
import type {
  AdjustmentSource,
  AdjustmentValues,
} from '../lib/imageAdjustments'
import { createImageAsset, type ImageAsset } from '../lib/imageAsset'
import type { ExportQuality } from '../lib/imageExport'

export const MAX_BATCH_IMAGES = 5
export const MAX_BATCH_TOTAL_SIZE = 200 * 1024 * 1024

export type BatchExportStatus =
  | 'idle'
  | 'queued'
  | 'decoding'
  | 'processing'
  | 'encoding'
  | 'packaging'
  | 'done'
  | 'error'
export type BatchAnalysisStatus = 'idle' | 'loading' | 'success' | 'error'
export type BatchFilter = 'all' | 'selected' | 'customized' | 'error'

export interface BatchImageItem {
  id: string
  asset: ImageAsset
  selected: boolean
  exportStatus: BatchExportStatus
  exportError?: string
  overrideAdjustments?: AdjustmentValues
  adjustmentSource?: AdjustmentSource
  analysisStatus?: BatchAnalysisStatus
}

interface BatchImageQueueProps {
  items: BatchImageItem[]
  selectedId: string | null
  exporting: boolean
  exportMessage: string
  exportQuality: ExportQuality
  exportMaxEdge: number
  filter: BatchFilter
  onExportQualityChange: (quality: ExportQuality) => void
  onExportMaxEdgeChange: (maxEdge: number) => void
  onFilterChange: (filter: BatchFilter) => void
  onAdd: (assets: ImageAsset[]) => void
  onSelect: (id: string) => void
  onToggleSelect: (id: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onRemove: (id: string) => void
  onClear: () => void
  onExportAll: () => void
  onExportSelected: () => void
  onExportSuccessful: () => void
  onCancelExport: () => void
  onRetryFailed: () => void
  onPreview: (asset: ImageAsset) => void
}

export function BatchImageQueue({
  items,
  selectedId,
  exporting,
  exportMessage,
  exportQuality,
  exportMaxEdge,
  filter,
  onExportQualityChange,
  onExportMaxEdgeChange,
  onFilterChange,
  onAdd,
  onSelect,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onRemove,
  onClear,
  onExportAll,
  onExportSelected,
  onExportSuccessful,
  onCancelExport,
  onRetryFailed,
  onPreview,
}: BatchImageQueueProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const selectedCount = items.filter((item) => item.selected).length
  const failedCount = items.filter((item) => item.exportStatus === 'error').length
  const visibleItems = items.filter((item) => {
    if (filter === 'selected') return item.selected
    if (filter === 'customized') return !!item.overrideAdjustments
    if (filter === 'error') return item.exportStatus === 'error'
    return true
  })

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    if (!files.length) return

    const remaining = MAX_BATCH_IMAGES - items.length
    if (remaining <= 0) {
      setMessage('批量队列已达到 5 张上限。')
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
          <span className="panel-kicker">图片队列</span>
          <h2>
            我的实拍照 · {items.length}/{MAX_BATCH_IMAGES}
            {selectedCount ? ` · 已选 ${selectedCount}` : ''}
          </h2>
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
          <button type="button" className="secondary-button" onClick={onSelectAll} disabled={!items.length}>
            全选
          </button>
          <button type="button" className="secondary-button" onClick={onClearSelection} disabled={!selectedCount}>
            取消选择
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onRetryFailed}
            disabled={!failedCount || exporting}
          >
            <RotateCcw size={15} />
            重试失败
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onExportSuccessful}
            disabled={!items.some((item) => item.exportStatus === 'done') || exporting}
          >
            仅成功项
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={exporting ? onCancelExport : onExportSelected}
            disabled={!items.length || (!exporting && !selectedCount)}
          >
            {exporting ? <XCircle size={16} /> : <Download size={16} />}
            {exporting ? '取消处理' : '导出选中'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={onExportAll}
            disabled={!items.length || exporting}
          >
            全部导出
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

      <div className="batch-filters" aria-label="图片筛选">
        {(['all', 'selected', 'customized', 'error'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={filter === value ? 'active' : ''}
            onClick={() => onFilterChange(value)}
          >
            {filterLabel(value)}
          </button>
        ))}
      </div>

      <div className="export-options" aria-label="导出配置">
        <label>
          <span>质量</span>
          <select
            value={exportQuality}
            onChange={(event) =>
              onExportQualityChange(event.target.value as ExportQuality)
            }
            disabled={exporting}
          >
            <option value="high">高质量</option>
            <option value="standard">标准</option>
            <option value="light">轻量</option>
          </select>
        </label>
        <label>
          <span>最长边</span>
          <select
            value={exportMaxEdge}
            onChange={(event) => onExportMaxEdgeChange(Number(event.target.value))}
            disabled={exporting}
          >
            <option value={4096}>4096</option>
            <option value={3000}>3000</option>
            <option value={2000}>2000</option>
          </select>
        </label>
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
          {visibleItems.map((item) => (
            <article
              key={item.id}
              className={[
                'batch-item',
                item.id === selectedId ? 'active' : '',
                item.selected ? 'checked' : '',
                item.overrideAdjustments ? 'customized' : '',
                item.analysisStatus === 'loading' ? 'analysis-loading' : '',
                item.analysisStatus === 'error' ? 'analysis-error' : '',
              ].join(' ')}
            >
              <label className="batch-check">
                <input
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => onToggleSelect(item.id)}
                  aria-label={`选择 ${item.asset.file.name}`}
                />
              </label>
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
                    {item.asset.width} x {item.asset.height}
                    {item.adjustmentSource ? ` · ${sourceLabel(item.adjustmentSource)}` : ''}
                    {item.asset.warnings.length ? ' · 有提示' : ''}
                  </small>
                  <StatusTags item={item} />
                </span>
              </button>
              <button
                type="button"
                className="mini-icon-button"
                onClick={() => onPreview(item.asset)}
                title="查看大图"
                aria-label={`查看 ${item.asset.file.name}`}
              >
                <Eye size={13} />
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
          <span>最多 5 张，可按当前、选中或全部图片同步参数</span>
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
    return (
      <span className="batch-state-label active">
        <LoaderCircle size={14} className="spin" />
        处理
      </span>
    )
  }
  if (status === 'queued' || status === 'decoding' || status === 'encoding' || status === 'packaging') {
    return (
      <span className="batch-state-label active">
        <LoaderCircle size={14} className="spin" />
        {exportStatusLabel(status)}
      </span>
    )
  }
  if (status === 'done') {
    return <CheckCircle size={15} className="batch-state success" aria-label="已导出" />
  }
  if (status === 'error') {
    return <XCircle size={15} className="batch-state error" aria-label={error ?? '导出失败'} />
  }
  return <span className="batch-state idle" aria-hidden="true" />
}

function StatusTags({ item }: { item: BatchImageItem }) {
  const tags: string[] = []
  if (item.selected) tags.push('已选')
  if (item.adjustmentSource) tags.push(sourceLabel(item.adjustmentSource))
  if (item.analysisStatus === 'loading') tags.push('AI 分析中')
  if (item.analysisStatus === 'success') tags.push('AI 已生成')
  if (item.analysisStatus === 'error') tags.push('AI 失败')
  if (item.exportStatus === 'error') tags.push('导出失败')
  if (item.exportStatus === 'queued') tags.push('等待导出')
  if (item.exportStatus === 'decoding') tags.push('解码中')
  if (item.exportStatus === 'processing') tags.push('处理中')
  if (item.exportStatus === 'encoding') tags.push('编码中')
  if (item.exportStatus === 'packaging') tags.push('打包中')
  if (!tags.length) return null

  return (
    <span className="batch-tags">
      {tags.slice(0, 3).map((tag) => (
        <em key={tag}>
          {tag.includes('AI') ? <Sparkles size={10} /> : null}
          {tag}
        </em>
      ))}
    </span>
  )
}

function exportStatusLabel(status: BatchExportStatus) {
  if (status === 'queued') return '等待'
  if (status === 'decoding') return '解码'
  if (status === 'encoding') return '编码'
  if (status === 'packaging') return '打包'
  if (status === 'processing') return '处理'
  return ''
}

function sourceLabel(source: AdjustmentSource) {
  if (source === 'ai') return 'AI'
  if (source === 'preset') return '预设'
  if (source === 'mixed') return 'AI+手动'
  return '手动'
}

function filterLabel(filter: BatchFilter) {
  if (filter === 'selected') return '已选'
  if (filter === 'customized') return '已自定义'
  if (filter === 'error') return '失败'
  return '全部'
}
