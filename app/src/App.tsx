import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Aperture,
  Camera,
  CheckCircle,
  Clipboard,
  ClipboardCheck,
  ImageIcon,
  Server,
  ServerOff,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
} from 'lucide-react'
import { AdjustmentPanel } from './components/AdjustmentPanel'
import {
  BatchImageQueue,
  type BatchImageItem,
} from './components/BatchImageQueue'
import { CanvasPreview } from './components/CanvasPreview'
import { ImageUploader } from './components/ImageUploader'
import { PresetPanel } from './components/PresetPanel'
import {
  DEFAULT_ADJUSTMENTS,
  type AdjustmentValues,
} from './lib/imageAdjustments'
import { colorAnalysis } from './lib/mockAnalysis'
import { analyzeBeforeShoot, analyzeColorMatch, getApiHealth } from './lib/analysisApi'
import type {
  BeforeAnalysisResult,
  ColorAnalysisResult,
} from './lib/analysisContract'
import {
  applyPresetStrength,
  BUILT_IN_PRESETS,
  createCustomPreset,
  exportPresetCollection,
  loadCustomPresets,
  MAX_CUSTOM_PRESETS,
  parsePresetExport,
  saveCustomPresets,
  type StylePreset,
} from './lib/presets'
import {
  createExportFilename,
  downloadBlob,
  renderAdjustedImageBlob,
} from './lib/imageExport'
import type { ImageAsset } from './lib/imageAsset'
import { createZipBlob } from './lib/zipExport'

type ActiveTab = 'before' | 'after'
type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error'
type ApiHealth = 'checking' | 'ready' | 'degraded' | 'offline'

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('after')
  const [beforeImage, setBeforeImage] = useState<ImageAsset | null>(null)
  const [targetImage, setTargetImage] = useState<ImageAsset | null>(null)
  const [batchImages, setBatchImages] = useState<BatchImageItem[]>([])
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [batchExporting, setBatchExporting] = useState(false)
  const [batchExportMessage, setBatchExportMessage] = useState('')
  const [apiHealth, setApiHealth] = useState<ApiHealth>('checking')
  const [adjustments, setAdjustments] =
    useState<AdjustmentValues>(DEFAULT_ADJUSTMENTS)
  const [customPresets, setCustomPresets] = useState<StylePreset[]>(() =>
    loadCustomPresets(),
  )
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [presetStrength, setPresetStrength] = useState(100)
  const [presetModified, setPresetModified] = useState(false)
  const [presetMessage, setPresetMessage] = useState('')
  const [privacyAccepted, setPrivacyAccepted] = useState(false)
  const [beforePrivacyAccepted, setBeforePrivacyAccepted] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>('idle')
  const [analysisError, setAnalysisError] = useState('')
  const [aiAnalysis, setAiAnalysis] = useState<ColorAnalysisResult | null>(null)
  const [beforeStatus, setBeforeStatus] = useState<AnalysisStatus>('idle')
  const [beforeError, setBeforeError] = useState('')
  const [beforeResult, setBeforeResult] = useState<BeforeAnalysisResult | null>(
    null,
  )
  const [beforeCopied, setBeforeCopied] = useState(false)
  const imagesRef = useRef({
    beforeImage: null as ImageAsset | null,
    targetImage: null as ImageAsset | null,
    batchImages: [] as BatchImageItem[],
  })
  const colorAnalysisControllerRef = useRef<AbortController | null>(null)
  const beforeAnalysisControllerRef = useRef<AbortController | null>(null)
  const batchExportControllerRef = useRef<AbortController | null>(null)
  const userImage =
    batchImages.find((item) => item.id === selectedImageId)?.asset ?? null

  useEffect(() => {
    imagesRef.current = {
      beforeImage,
      targetImage,
      batchImages,
    }
  }, [beforeImage, targetImage, batchImages])

  useEffect(() => {
    return () => {
      const { beforeImage: before, targetImage: target, batchImages: batch } =
        imagesRef.current
      if (before) URL.revokeObjectURL(before.url)
      if (target) URL.revokeObjectURL(target.url)
      batch.forEach((item) => URL.revokeObjectURL(item.asset.url))
    }
  }, [])

  useEffect(() => {
    saveCustomPresets(customPresets)
  }, [customPresets])

  useEffect(() => {
    getApiHealth()
      .then((health) => {
        setApiHealth(
          health.status === 'ok' && health.apiKeyConfigured ? 'ready' : 'degraded',
        )
      })
      .catch(() => setApiHealth('offline'))
  }, [])

  const replaceImage =
    (
      current: ImageAsset | null,
      setter: (value: ImageAsset | null) => void,
    ) =>
    (next: ImageAsset) => {
      if (current) URL.revokeObjectURL(current.url)
      setter(next)
    }

  const clearColorAnalysis = () => {
    setAiAnalysis(null)
    setAnalysisError('')
    setAnalysisStatus('idle')
  }

  const clearBeforeAnalysis = () => {
    setBeforeResult(null)
    setBeforeError('')
    setBeforeStatus('idle')
    setBeforeCopied(false)
  }

  const addBatchImages = (assets: ImageAsset[]) => {
    if (!assets.length) return
    const nextItems = assets.map((asset) => ({
      id: crypto.randomUUID(),
      asset,
      exportStatus: 'idle' as const,
    }))
    setBatchImages((current) => [...current, ...nextItems])
    setSelectedImageId((current) => current ?? nextItems[0].id)
    setBatchExportMessage('')
    clearColorAnalysis()
  }

  const removeBatchImage = (id: string) => {
    setBatchImages((current) => {
      const removed = current.find((item) => item.id === id)
      if (removed) URL.revokeObjectURL(removed.asset.url)
      const next = current.filter((item) => item.id !== id)
      if (selectedImageId === id) setSelectedImageId(next[0]?.id ?? null)
      return next
    })
    setBatchExportMessage('')
    clearColorAnalysis()
  }

  const clearBatchImages = () => {
    batchImages.forEach((item) => URL.revokeObjectURL(item.asset.url))
    setBatchImages([])
    setSelectedImageId(null)
    setBatchExportMessage('')
    clearColorAnalysis()
  }

  const exportBatch = async () => {
    if (!batchImages.length || batchExporting) return
    setBatchExporting(true)
    const controller = new AbortController()
    batchExportControllerRef.current = controller
    setBatchExportMessage(`正在处理 ${batchImages.length} 张图片...`)
    setBatchImages((current) =>
      current.map((item) => ({ ...item, exportStatus: 'idle', exportError: undefined })),
    )

    const exported: { name: string; blob: Blob }[] = []
    try {
      for (const [index, item] of batchImages.entries()) {
        if (controller.signal.aborted) {
          throw new DOMException('批量处理已取消。', 'AbortError')
        }
        setBatchImages((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, exportStatus: 'processing', exportError: undefined }
              : candidate,
          ),
        )
        try {
          const blob = await renderAdjustedImageBlob(
            item.asset,
            adjustments,
            controller.signal,
          )
          exported.push({
            name: createExportFilename(item.asset.file.name, index),
            blob,
          })
          setBatchImages((current) =>
            current.map((candidate) =>
              candidate.id === item.id
                ? { ...candidate, exportStatus: 'done', exportError: undefined }
                : candidate,
            ),
          )
        } catch (error) {
          setBatchImages((current) =>
            current.map((candidate) =>
              candidate.id === item.id
                ? {
                    ...candidate,
                    exportStatus: 'error',
                    exportError:
                      error instanceof Error ? error.message : '图片导出失败。',
                  }
                : candidate,
            ),
          )
        }
      }
      if (!exported.length) throw new Error('没有图片成功完成处理。')
      if (controller.signal.aborted) {
        throw new DOMException('批量处理已取消。', 'AbortError')
      }

      setBatchExportMessage('图片处理完成，正在打包 ZIP...')
      const zip = await createZipBlob(exported)
      downloadBlob(zip, `shotai-batch-${Date.now()}.zip`)
      const failed = batchImages.length - exported.length
      setBatchExportMessage(
        failed
          ? `已导出 ${exported.length} 张；${failed} 张处理失败，可查看队列状态。`
          : `已将 ${exported.length} 张图片打包为 ZIP。`,
      )
    } catch (error) {
      setBatchExportMessage(
        controller.signal.aborted
          ? '批量处理已取消；已完成的状态仍保留。'
          : error instanceof Error
            ? error.message
            : '批量导出失败，请重试。',
      )
    } finally {
      batchExportControllerRef.current = null
      setBatchExporting(false)
    }
  }

  const cancelBatchExport = () => {
    batchExportControllerRef.current?.abort()
  }

  const resetAdjustments = () => {
    setAdjustments(DEFAULT_ADJUSTMENTS)
    setActivePresetId(null)
    setPresetModified(false)
    setPresetMessage('已重置全部调色参数。')
  }

  const updateAdjustments = (next: AdjustmentValues) => {
    setAdjustments(next)
    if (activePresetId) setPresetModified(true)
  }

  const applyPreset = (preset: StylePreset) => {
    setActivePresetId(preset.id)
    setPresetStrength(100)
    setPresetModified(false)
    setAdjustments(preset.adjustments)
    setPresetMessage(`已应用“${preset.name}”。`)
  }

  const changePresetStrength = (strength: number) => {
    const preset = [...BUILT_IN_PRESETS, ...customPresets].find(
      (item) => item.id === activePresetId,
    )
    if (!preset) return
    setPresetStrength(strength)
    setPresetModified(false)
    setAdjustments(applyPresetStrength(preset.adjustments, strength))
  }

  const savePreset = (name: string) => {
    if (customPresets.length >= MAX_CUSTOM_PRESETS) {
      setPresetMessage('本地预设已达到 100 套上限，请先删除或导出备份。')
      return
    }
    const preset = createCustomPreset(name, adjustments)
    setCustomPresets((current) => [preset, ...current])
    setActivePresetId(preset.id)
    setPresetStrength(100)
    setPresetModified(false)
    setPresetMessage(`已保存“${preset.name}”到本地。`)
  }

  const renamePreset = (preset: StylePreset) => {
    const nextName = window.prompt('输入新的预设名称', preset.name)?.trim()
    if (!nextName || nextName === preset.name) return
    setCustomPresets((current) =>
      current.map((item) =>
        item.id === preset.id
          ? { ...item, name: nextName.slice(0, 48), updatedAt: new Date().toISOString() }
          : item,
      ),
    )
    setPresetMessage(`已重命名为“${nextName.slice(0, 48)}”。`)
  }

  const deletePreset = (preset: StylePreset) => {
    if (!window.confirm(`删除自定义预设“${preset.name}”？`)) return
    setCustomPresets((current) => current.filter((item) => item.id !== preset.id))
    if (activePresetId === preset.id) {
      setActivePresetId(null)
      setPresetModified(false)
    }
    setPresetMessage(`已删除“${preset.name}”。`)
  }

  const exportPresets = () => {
    const blob = new Blob([exportPresetCollection(customPresets)], {
      type: 'application/json',
    })
    const anchor = document.createElement('a')
    anchor.href = URL.createObjectURL(blob)
    anchor.download = `shotai-presets-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(anchor.href)
    setPresetMessage(`已导出 ${customPresets.length} 套自定义预设。`)
  }

  const importPresets = async (file: File) => {
    try {
      const imported = parsePresetExport(JSON.parse(await file.text()))
      const existingIds = new Set(customPresets.map((preset) => preset.id))
      const merged = [
        ...customPresets,
        ...imported.filter((preset) => !existingIds.has(preset.id)),
      ].slice(0, MAX_CUSTOM_PRESETS)
      setCustomPresets(merged)
      setPresetMessage(`已导入 ${merged.length - customPresets.length} 套预设。`)
    } catch (error) {
      setPresetMessage(
        error instanceof Error ? error.message : '预设文件导入失败。',
      )
    }
  }

  const runColorAnalysis = async () => {
    if (!targetImage || !userImage) {
      setAnalysisStatus('error')
      setAnalysisError('请先上传目标风格照和我的实拍照。')
      return
    }

    if (!privacyAccepted) {
      setAnalysisStatus('error')
      setAnalysisError('请先确认图片会发送到本地 API proxy 并转发给 Gemini API。')
      return
    }

    setAnalysisStatus('loading')
    setAnalysisError('')
    const controller = new AbortController()
    colorAnalysisControllerRef.current = controller

    try {
      const result = await analyzeColorMatch(targetImage, userImage, controller.signal)
      setAiAnalysis(result)
      setAdjustments(result.adjustments)
      setActivePresetId(null)
      setPresetModified(false)
      setPresetMessage('已应用 AI 推荐参数，可保存为自定义预设。')
      setAnalysisStatus('success')
    } catch (error) {
      setAnalysisStatus('error')
      setAnalysisError(
        error instanceof Error
          ? error.message
          : 'AI 调色分析失败，请稍后重试。',
      )
    } finally {
      colorAnalysisControllerRef.current = null
    }
  }

  const cancelColorAnalysis = () => {
    colorAnalysisControllerRef.current?.abort()
  }

  const runBeforeAnalysis = async () => {
    if (!beforeImage) {
      setBeforeStatus('error')
      setBeforeError('请先上传参考照片。')
      return
    }

    if (!beforePrivacyAccepted) {
      setBeforeStatus('error')
      setBeforeError('请先确认参考照片会发送到 Gemini API。')
      return
    }

    setBeforeStatus('loading')
    setBeforeError('')
    setBeforeCopied(false)
    const controller = new AbortController()
    beforeAnalysisControllerRef.current = controller

    try {
      const result = await analyzeBeforeShoot(beforeImage, controller.signal)
      setBeforeResult(result)
      setBeforeStatus('success')
    } catch (error) {
      setBeforeStatus('error')
      setBeforeError(
        error instanceof Error ? error.message : 'AI 拍摄方案分析失败，请稍后重试。',
      )
    } finally {
      beforeAnalysisControllerRef.current = null
    }
  }

  const cancelBeforeAnalysis = () => {
    beforeAnalysisControllerRef.current?.abort()
  }

  const copyBeforeAnalysis = async () => {
    if (!beforeResult) return
    await navigator.clipboard.writeText(formatBeforeAnalysis(beforeResult))
    setBeforeCopied(true)
  }

  const colorSections = aiAnalysis
    ? [
        {
          title: 'AI 调色说明',
          content: aiAnalysis.explanation,
        },
        {
          title: '推荐参数',
          content: formatAdjustmentSummary(aiAnalysis.adjustments),
        },
      ]
    : userImage
      ? colorAnalysis
      : []

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Aperture size={19} strokeWidth={2.2} />
          </span>
          <span>Shotai</span>
          <span className="version-tag">V0.5</span>
        </div>
        <p className="topbar-note">本地预览 · API Proxy 分析</p>
        <span className={`api-health ${apiHealth}`}>
          {apiHealth === 'ready' ? <Server size={13} /> : <ServerOff size={13} />}
          {formatApiHealth(apiHealth)}
        </span>
      </header>

      <main>
        <nav className="tabs" aria-label="摄影助手模式">
          <button
            type="button"
            className={activeTab === 'before' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('before')}
          >
            <Camera size={17} />
            拍前分析
          </button>
          <button
            type="button"
            className={activeTab === 'after' ? 'tab active' : 'tab'}
            onClick={() => setActiveTab('after')}
          >
            <SlidersHorizontal size={17} />
            拍后调色
          </button>
        </nav>

        {activeTab === 'before' ? (
          <section className="workspace before-workspace">
            <div className="section-heading">
              <div>
                <span className="eyebrow">拍前准备</span>
                <h1>从参考图提取拍摄思路</h1>
              </div>
              <p>上传一张喜欢的照片，生成现场可执行的构图、光线和参数建议。</p>
            </div>

            <div className="before-grid">
              <ImageUploader
                label="参考照片"
                description="上传你想参考的构图或光线风格"
                image={beforeImage}
                onImageChange={(next) => {
                  replaceImage(beforeImage, setBeforeImage)(next)
                  clearBeforeAnalysis()
                }}
              />
              <BeforeAnalysisPanel
                imageReady={!!beforeImage}
                privacyAccepted={beforePrivacyAccepted}
                onPrivacyChange={setBeforePrivacyAccepted}
                status={beforeStatus}
                error={beforeError}
                result={beforeResult}
                copied={beforeCopied}
                onAnalyze={runBeforeAnalysis}
                onCancel={cancelBeforeAnalysis}
                onCopy={copyBeforeAnalysis}
              />
            </div>
          </section>
        ) : (
          <section className="workspace">
            <div className="section-heading">
              <div>
                <span className="eyebrow">调色工作台</span>
                <h1>让照片靠近你喜欢的风格</h1>
              </div>
              <p>上传照片并微调六项参数。所有处理均在当前浏览器内完成。</p>
            </div>

            <div className="upload-row target-upload-row">
              <ImageUploader
                compact
                label="目标风格照"
                description="用于记录你想靠近的视觉方向"
                image={targetImage}
                onImageChange={(next) => {
                  replaceImage(targetImage, setTargetImage)(next)
                  clearColorAnalysis()
                }}
              />
            </div>
            <BatchImageQueue
              items={batchImages}
              selectedId={selectedImageId}
              exporting={batchExporting}
              onAdd={addBatchImages}
              onSelect={(id) => {
                setSelectedImageId(id)
                clearColorAnalysis()
              }}
              onRemove={removeBatchImage}
              onClear={clearBatchImages}
              onExportAll={exportBatch}
              onCancelExport={cancelBatchExport}
              exportMessage={batchExportMessage}
            />

            <div className="editor-grid">
              <CanvasPreview image={userImage} adjustments={adjustments} />

              <aside className="control-column">
                <div className="panel-heading">
                  <div>
                    <span className="panel-kicker">手动调整</span>
                    <h2>调色参数</h2>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={resetAdjustments}
                    title="重置参数"
                    aria-label="重置参数"
                  >
                    <RotateCcw size={17} />
                  </button>
                </div>
                <AdjustmentPanel
                  values={adjustments}
                  onChange={updateAdjustments}
                />
                <PresetPanel
                  customPresets={customPresets}
                  activePresetId={activePresetId}
                  strength={presetStrength}
                  modified={presetModified}
                  onApply={applyPreset}
                  onStrengthChange={changePresetStrength}
                  onSave={savePreset}
                  onRename={renamePreset}
                  onDelete={deletePreset}
                  onExport={exportPresets}
                  onImport={importPresets}
                  message={presetMessage}
                />
                <section className="ai-action-panel">
                  <div className="privacy-check">
                    <input
                      id="privacyAccepted"
                      type="checkbox"
                      checked={privacyAccepted}
                      onChange={(event) =>
                        setPrivacyAccepted(event.target.checked)
                      }
                    />
                    <label htmlFor="privacyAccepted">
                      我确认分析时会将两张图片发送到本地 API proxy，并由 proxy
                      转发给 Gemini API。
                    </label>
                  </div>
                  <button
                    type="button"
                    className="analysis-button"
                    onClick={
                      analysisStatus === 'loading'
                        ? cancelColorAnalysis
                        : runColorAnalysis
                    }
                    disabled={
                      analysisStatus !== 'loading' && (!targetImage || !userImage)
                    }
                  >
                    {analysisStatus === 'loading' ? (
                      <AlertCircle size={17} />
                    ) : (
                      <WandSparkles size={17} />
                    )}
                    {analysisStatus === 'loading'
                      ? '取消分析'
                      : 'AI 分析调色方案'}
                  </button>
                  {analysisStatus === 'success' && (
                    <StatusMessage tone="success">
                      已应用 AI 推荐参数，可继续手动微调。
                    </StatusMessage>
                  )}
                  {analysisStatus === 'error' && analysisError && (
                    <StatusMessage tone="error">{analysisError}</StatusMessage>
                  )}
                </section>
                <MockAnalysis
                  compact
                  title={aiAnalysis ? 'AI 调色提示' : '本地调色提示'}
                  emptyText="上传实拍照后查看基础调色建议"
                  sections={colorSections}
                  badge={aiAnalysis ? 'AI' : 'LOCAL'}
                />
              </aside>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

interface MockAnalysisProps {
  title: string
  emptyText: string
  sections: { title: string; content: string }[]
  compact?: boolean
  badge?: string
}

function MockAnalysis({
  title,
  emptyText,
  sections,
  compact = false,
  badge = 'MOCK',
}: MockAnalysisProps) {
  return (
    <section className={compact ? 'analysis-panel compact' : 'analysis-panel'}>
      <div className="analysis-title">
        <Sparkles size={17} />
        <h2>{title}</h2>
        <span>{badge}</span>
      </div>
      {sections.length ? (
        <div className="analysis-list">
          {sections.map((section) => (
            <article key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.content}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="analysis-empty">
          <ImageIcon size={20} />
          <p>{emptyText}</p>
        </div>
      )}
    </section>
  )
}

interface BeforeAnalysisPanelProps {
  imageReady: boolean
  privacyAccepted: boolean
  onPrivacyChange: (value: boolean) => void
  status: AnalysisStatus
  error: string
  result: BeforeAnalysisResult | null
  copied: boolean
  onAnalyze: () => void
  onCancel: () => void
  onCopy: () => void
}

function BeforeAnalysisPanel({
  imageReady,
  privacyAccepted,
  onPrivacyChange,
  status,
  error,
  result,
  copied,
  onAnalyze,
  onCancel,
  onCopy,
}: BeforeAnalysisPanelProps) {
  return (
    <section className="analysis-panel before-analysis-panel">
      <div className="analysis-title">
        <Sparkles size={17} />
        <h2>AI 拍摄建议</h2>
        <span>{result ? 'AI' : 'READY'}</span>
      </div>

      <div className="before-actions">
        <div className="privacy-check">
          <input
            id="beforePrivacyAccepted"
            type="checkbox"
            checked={privacyAccepted}
            onChange={(event) => onPrivacyChange(event.target.checked)}
          />
          <label htmlFor="beforePrivacyAccepted">
            我确认分析时会将参考照片发送到本地 API proxy，并由 proxy 转发给
            Gemini API。
          </label>
        </div>
        <div className="before-action-buttons">
          <button
            type="button"
            className="analysis-button"
            disabled={status !== 'loading' && !imageReady}
            onClick={status === 'loading' ? onCancel : onAnalyze}
          >
            {status === 'loading' ? (
              <AlertCircle size={17} />
            ) : (
              <WandSparkles size={17} />
            )}
            {status === 'loading'
              ? '取消分析'
              : result
                ? '重新分析拍摄方案'
                : '分析拍摄方案'}
          </button>
          {result && (
            <button type="button" className="secondary-button" onClick={onCopy}>
              {copied ? <ClipboardCheck size={16} /> : <Clipboard size={16} />}
              {copied ? '已复制' : '复制建议'}
            </button>
          )}
        </div>
        {status === 'success' && (
          <StatusMessage tone="success">
            已生成拍摄方案，参数为视觉推测，请结合现场调整。
          </StatusMessage>
        )}
        {status === 'error' && error && (
          <StatusMessage tone="error">{error}</StatusMessage>
        )}
      </div>

      {result ? (
        <div className="before-result">
          <div className="confidence-row">
            <span>建议可信度</span>
            <strong>{Math.round(result.confidence * 100)}%</strong>
            <div className="confidence-track">
              <span style={{ width: `${result.confidence * 100}%` }} />
            </div>
          </div>
          <ResultSection title="场景与环境" content={result.scene} />
          <ResultSection title="光线与曝光" content={result.lighting} />
          <ResultSection title="构图方向" content={result.composition} />
          <ResultList title="参数起点" items={result.cameraSettings} />
          <ResultList title="现场执行建议" items={result.executionTips} />
          <ResultSection title="不确定性提示" content={result.uncertainty} warning />
        </div>
      ) : (
        <div className="analysis-empty before-empty">
          <ImageIcon size={20} />
          <p>{imageReady ? '确认图片发送后，点击分析拍摄方案' : '上传参考照片后开始分析'}</p>
        </div>
      )}
    </section>
  )
}

function ResultSection({
  title,
  content,
  warning = false,
}: {
  title: string
  content: string
  warning?: boolean
}) {
  return (
    <article className={warning ? 'result-section warning' : 'result-section'}>
      <h3>{title}</h3>
      <p>{content}</p>
    </article>
  )
}

function ResultList({ title, items }: { title: string; items: string[] }) {
  return (
    <article className="result-section">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  )
}

interface StatusMessageProps {
  tone: 'success' | 'error'
  children: string
}

function StatusMessage({ tone, children }: StatusMessageProps) {
  const Icon = tone === 'success' ? CheckCircle : AlertCircle
  return (
    <p className={`status-message ${tone}`}>
      <Icon size={14} />
      {children}
    </p>
  )
}

function formatApiHealth(health: ApiHealth) {
  if (health === 'ready') return 'AI 服务就绪'
  if (health === 'degraded') return 'AI 未配置'
  if (health === 'offline') return 'API 离线'
  return '检查服务'
}

function formatAdjustmentSummary(adjustments: AdjustmentValues) {
  const labels: Record<keyof AdjustmentValues, string> = {
    brightness: '亮度',
    contrast: '对比度',
    saturation: '饱和度',
    temperature: '色温',
    shadows: '阴影',
    highlights: '高光',
  }

  return Object.entries(adjustments)
    .map(([key, value]) => {
      const signedValue = value > 0 ? `+${value}` : String(value)
      return `${labels[key as keyof AdjustmentValues]} ${signedValue}`
    })
    .join('，')
}

function formatBeforeAnalysis(result: BeforeAnalysisResult) {
  return [
    'Shotai 拍摄方案',
    '',
    `场景与环境：${result.scene}`,
    `光线与曝光：${result.lighting}`,
    `构图方向：${result.composition}`,
    '',
    '参数起点：',
    ...result.cameraSettings.map((item) => `- ${item}`),
    '',
    '现场执行建议：',
    ...result.executionTips.map((item) => `- ${item}`),
    '',
    `不确定性提示：${result.uncertainty}`,
    `建议可信度：${Math.round(result.confidence * 100)}%`,
  ].join('\n')
}

export default App
