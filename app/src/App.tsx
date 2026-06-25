import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Aperture,
  Activity,
  Camera,
  CheckCircle,
  Clipboard,
  ClipboardCheck,
  Grid2X2,
  History,
  ImageIcon,
  LoaderCircle,
  Maximize2,
  RotateCcw,
  Server,
  ServerOff,
  SlidersHorizontal,
  Sparkles,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { AdjustmentPanel } from './components/AdjustmentPanel'
import {
  BatchImageQueue,
  type BatchFilter,
  type BatchImageItem,
} from './components/BatchImageQueue'
import {
  CanvasPreview,
  type PreviewMode,
  type PreviewRenderStatus,
} from './components/CanvasPreview'
import { ImageUploader } from './components/ImageUploader'
import { PresetPanel } from './components/PresetPanel'
import {
  ADJUSTMENT_LABELS,
  blendAdjustments,
  mapAdjustments,
  DEFAULT_ADJUSTMENTS,
  formatAdjustmentValue,
  normalizeAdjustmentValues,
  resetAdjustmentGroup,
  type AdjustmentGroupId,
  type AdjustmentKey,
  type AdjustmentSource,
  type AdjustmentValues,
  type PreviewRisk,
} from './lib/imageAdjustments'
import {
  AnalysisApiError,
  analyzeBeforeShoot,
  analyzeColorMatch,
  refineColorAdjustments,
  getApiHealth,
  type AnalysisErrorCode,
  type ColorAnalysisPhase,
} from './lib/analysisApi'
import type {
  BeforeAnalysisResult,
  ColorAnalysisResult,
  RefineResult,
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
  type ExportQuality,
  type ExportStage,
  renderAdjustedImageBlob,
} from './lib/imageExport'
import { getAdjustmentWorkerSnapshot } from './lib/adjustmentWorkerClient'
import { createImageAsset, type ImageAsset } from './lib/imageAsset'
import { readExif, exifEntries, type ExifInfo } from './lib/exif'
import { beforeAnalysisToAdjustments } from './lib/beforeMapping'
import { createZipBlob } from './lib/zipExport'

// V3.0：可在页面切换的 Gemini 模型（与后端白名单一致）
const MODEL_OPTIONS = [
  'gemini-3.1-pro-preview',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
] as const
const DEFAULT_MODEL = 'gemini-3.1-flash-lite'
const MODEL_STORAGE_KEY = 'shotai.model'

type ActiveTab = 'before' | 'after'
type AnalysisStatus = 'idle' | 'loading' | 'success' | 'error'
type ApiHealth = 'checking' | 'ready' | 'degraded' | 'offline'
type ApplyScope = 'current' | 'selected' | 'all'
type AnalysisCacheSource = 'fresh' | 'cached' | null

// V3.0：带来源标签的撤销/重做条目（消除 AI 与手动混淆）
interface HistoryEntry {
  values: AdjustmentValues
  label: string
}

interface PerformanceMetric {
  label: string
  durationMs: number
  detail: string
  createdAt: number
}

const SESSION_STORAGE_KEY = 'shotai.session.v2'
const MAX_SESSION_IMAGE_BYTES = 4 * 1024 * 1024
const AI_SOFT_TIMEOUT_MS = 8_000
const BATCH_EXPORT_CONCURRENCY = 2

interface LightboxState {
  image: ImageAsset
  title: string
}

interface StoredImageAsset {
  name: string
  type: string
  lastModified: number
  dataUrl: string | null
}

interface StoredBatchImageItem {
  id: string
  asset: StoredImageAsset
  selected: boolean
  overrideAdjustments?: AdjustmentValues
  adjustmentSource?: AdjustmentSource
}

interface StoredSession {
  version: 2
  activeTab: ActiveTab
  beforeImage: StoredImageAsset | null
  targetImage: StoredImageAsset | null
  batchImages: StoredBatchImageItem[]
  selectedImageId: string | null
  globalAdjustments: AdjustmentValues
  globalAdjustmentSource?: AdjustmentSource | null
  applyScope: ApplyScope
  activePresetId: string | null
  presetStrength: number
  previewMode: PreviewMode
  aiAnalysis: ColorAnalysisResult | null
  aiSnapshot: AdjustmentValues | null
  beforeResult: BeforeAnalysisResult | null
  exportQuality?: ExportQuality
  exportMaxEdge?: number
}

async function restoreStoredImage(
  stored: StoredImageAsset | null,
): Promise<ImageAsset | null> {
  if (!stored?.dataUrl) return null
  try {
    const response = await fetch(stored.dataUrl)
    const blob = await response.blob()
    const file = new File([blob], stored.name, {
      type: stored.type,
      lastModified: stored.lastModified,
    })
    return await createImageAsset(file)
  } catch {
    return null
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
        return
      }
      reject(new Error('图片缓存失败。'))
    }
    reader.onerror = () => reject(new Error('图片缓存失败。'))
    reader.readAsDataURL(file)
  })
}

function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('after')
  const [beforeImage, setBeforeImage] = useState<ImageAsset | null>(null)
  // V3.0 拍前：多参考图队列（分析仍以选中的单张为主）
  const [beforeQueue, setBeforeQueue] = useState<
    { id: string; asset: ImageAsset; exif: ExifInfo | null }[]
  >([])
  const [selectedBeforeId, setSelectedBeforeId] = useState<string | null>(null)
  const [targetImage, setTargetImage] = useState<ImageAsset | null>(null)
  const [batchImages, setBatchImages] = useState<BatchImageItem[]>([])
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null)
  const [batchExporting, setBatchExporting] = useState(false)
  const [batchExportMessage, setBatchExportMessage] = useState('')
  const [exportQuality, setExportQuality] = useState<ExportQuality>('standard')
  const [exportMaxEdge, setExportMaxEdge] = useState(4096)
  const [batchFilter, setBatchFilter] = useState<BatchFilter>('all')
  const [apiHealth, setApiHealth] = useState<ApiHealth>('checking')
  const [globalAdjustments, setGlobalAdjustments] =
    useState<AdjustmentValues>(DEFAULT_ADJUSTMENTS)
  const [globalAdjustmentSource, setGlobalAdjustmentSource] =
    useState<AdjustmentSource | null>(null)
  const [applyScope, setApplyScope] = useState<ApplyScope>('current')
  const [historyPast, setHistoryPast] = useState<HistoryEntry[]>([])
  const [historyFuture, setHistoryFuture] = useState<HistoryEntry[]>([])
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
  const [analysisErrorCode, setAnalysisErrorCode] =
    useState<AnalysisErrorCode | null>(null)
  const [analysisSoftTimedOut, setAnalysisSoftTimedOut] = useState(false)
  const [analysisPhase, setAnalysisPhase] =
    useState<ColorAnalysisPhase | null>(null)
  const [analysisCacheSource, setAnalysisCacheSource] =
    useState<AnalysisCacheSource>(null)
  const [aiAnalysis, setAiAnalysis] = useState<ColorAnalysisResult | null>(null)
  const [aiSnapshot, setAiSnapshot] = useState<AdjustmentValues | null>(null)
  const [aiApplyStrength, setAiApplyStrength] = useState(100)
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (typeof window === 'undefined') return DEFAULT_MODEL
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY)
    return saved && (MODEL_OPTIONS as readonly string[]).includes(saved)
      ? saved
      : DEFAULT_MODEL
  })
  // V3.0 AI 精修
  const [refineInstruction, setRefineInstruction] = useState('')
  const [refineStatus, setRefineStatus] = useState<AnalysisStatus>('idle')
  const [refineError, setRefineError] = useState('')
  const [refineSuggestion, setRefineSuggestion] = useState<RefineResult | null>(null)
  const [refinePreviewBaseline, setRefinePreviewBaseline] =
    useState<AdjustmentValues | null>(null)
  const refineSentImageRef = useRef<ImageAsset | null>(null)
  const refineControllerRef = useRef<AbortController | null>(null)
  // 最近一次精修的结果参数（命名恢复锚点："恢复精修"）
  const [lastRefineAdjustments, setLastRefineAdjustments] =
    useState<AdjustmentValues | null>(null)
  // 按图片缓存精修结果（同一图、同一指令不再重复调用）
  const refineCacheRef = useRef<{ image: ImageAsset | null; map: Map<string, RefineResult> }>({
    image: null,
    map: new Map(),
  })
  const [beforeStatus, setBeforeStatus] = useState<AnalysisStatus>('idle')
  const [beforeError, setBeforeError] = useState('')
  const [beforeResult, setBeforeResult] = useState<BeforeAnalysisResult | null>(
    null,
  )
  const [beforeCopied, setBeforeCopied] = useState(false)
  const [previewMode, setPreviewMode] = useState<PreviewMode>('adjusted')
  const [previewStatus, setPreviewStatus] =
    useState<PreviewRenderStatus>('idle')
  const [previewRisks, setPreviewRisks] = useState<PreviewRisk[]>([])
  const [showPerformancePanel, setShowPerformancePanel] = useState(false)
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetric[]>([])
  const [lightbox, setLightbox] = useState<LightboxState | null>(null)
  const [sessionMessage, setSessionMessage] = useState('')
  const imagesRef = useRef({
    beforeImage: null as ImageAsset | null,
    targetImage: null as ImageAsset | null,
    batchImages: [] as BatchImageItem[],
  })
  const sessionHydratedRef = useRef(false)
  const sessionImageCacheRef = useRef(new Map<string, string>())
  const colorAnalysisCacheRef = useRef(new Map<string, ColorAnalysisResult>())
  const colorAnalysisControllerRef = useRef<AbortController | null>(null)
  const colorAnalysisRequestRef = useRef(0)
  const colorAnalysisSoftTimeoutRef = useRef<number | null>(null)
  const beforeAnalysisControllerRef = useRef<AbortController | null>(null)
  const batchExportControllerRef = useRef<AbortController | null>(null)

  const currentItem =
    batchImages.find((item) => item.id === selectedImageId) ?? null
  const userImage = currentItem?.asset ?? null
  const currentAdjustments =
    currentItem?.overrideAdjustments ?? globalAdjustments
  const currentAdjustmentSource =
    currentItem?.adjustmentSource ?? globalAdjustmentSource
  const activePreset = [...BUILT_IN_PRESETS, ...customPresets].find(
    (preset) => preset.id === activePresetId,
  )
  const activePresetValues = activePreset
    ? applyPresetStrength(activePreset.adjustments, presetStrength)
    : null
  const selectedCount = batchImages.filter((item) => item.selected).length

  const recordPerformanceMetric = (metric: Omit<PerformanceMetric, 'createdAt'>) => {
    setPerformanceMetrics((current) =>
      [{ ...metric, createdAt: Date.now() }, ...current].slice(0, 10),
    )
  }

  const recordPreviewMetric = useCallback(
    (metric: { pass: 'fast' | 'final'; durationMs: number; width: number; height: number }) => {
      setPerformanceMetrics((current) =>
        [
          {
            label: metric.pass === 'fast' ? '快速预览' : '高清预览',
            durationMs: metric.durationMs,
            detail: `${metric.width} x ${metric.height}`,
            createdAt: Date.now(),
          },
          ...current,
        ].slice(0, 10),
      )
    },
    [],
  )

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
      if (colorAnalysisSoftTimeoutRef.current) {
        window.clearTimeout(colorAnalysisSoftTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    saveCustomPresets(customPresets)
  }, [customPresets])

  useEffect(() => {
    let cancelled = false

    async function restoreSession() {
      const rawSession = localStorage.getItem(SESSION_STORAGE_KEY)
      if (!rawSession) {
        sessionHydratedRef.current = true
        return
      }

      try {
        const stored = JSON.parse(rawSession) as StoredSession
        if (stored.version !== 2) {
          sessionHydratedRef.current = true
          return
        }

        const [nextBeforeImage, nextTargetImage] = await Promise.all([
          restoreStoredImage(stored.beforeImage),
          restoreStoredImage(stored.targetImage),
        ])
        const nextBatchImages: BatchImageItem[] = []
        for (const item of stored.batchImages) {
          const asset = await restoreStoredImage(item.asset)
          if (!asset) continue
          nextBatchImages.push({
            id: item.id,
            asset,
            selected: item.selected,
            overrideAdjustments: item.overrideAdjustments
              ? normalizeAdjustmentValues(item.overrideAdjustments)
              : undefined,
            adjustmentSource: item.adjustmentSource,
            exportStatus: 'idle',
          })
        }
        if (cancelled) return

        const missingImageCount =
          Number(!!stored.beforeImage && !nextBeforeImage) +
          Number(!!stored.targetImage && !nextTargetImage) +
          (stored.batchImages.length - nextBatchImages.length)

        setActiveTab(stored.activeTab)
        setBeforeImage(nextBeforeImage)
        setTargetImage(nextTargetImage)
        setBatchImages(nextBatchImages)
        setSelectedImageId(
          nextBatchImages.some((item) => item.id === stored.selectedImageId)
            ? stored.selectedImageId
            : nextBatchImages[0]?.id ?? null,
        )
        setGlobalAdjustments(normalizeAdjustmentValues(stored.globalAdjustments))
        setGlobalAdjustmentSource(stored.globalAdjustmentSource ?? null)
        setApplyScope(stored.applyScope)
        setActivePresetId(stored.activePresetId)
        setPresetStrength(stored.presetStrength)
        setPreviewMode(stored.previewMode)
        setAiAnalysis(stored.aiAnalysis)
        setAiSnapshot(
          stored.aiSnapshot ? normalizeAdjustmentValues(stored.aiSnapshot) : null,
        )
        setBeforeResult(stored.beforeResult)
        setExportQuality(stored.exportQuality ?? 'standard')
        setExportMaxEdge(stored.exportMaxEdge ?? 4096)
        setSessionMessage(
          missingImageCount
            ? `已恢复上次会话；${missingImageCount} 张大图需要重新上传授权。`
            : '已恢复上次本地会话。',
        )
      } catch {
        setSessionMessage('上次会话无法恢复，请重新上传图片。')
      } finally {
        sessionHydratedRef.current = true
      }
    }

    void restoreSession()

    return () => {
      cancelled = true
    }
  }, [])

  const persistImage = useCallback(async (asset: ImageAsset | null) => {
    if (!asset) return null
    const cacheKey = `${asset.file.name}:${asset.file.size}:${asset.file.lastModified}`
    let dataUrl = sessionImageCacheRef.current.get(cacheKey) ?? null
    if (!dataUrl && asset.file.size <= MAX_SESSION_IMAGE_BYTES) {
      dataUrl = await fileToDataUrl(asset.file)
      sessionImageCacheRef.current.set(cacheKey, dataUrl)
    }
    return {
      name: asset.file.name,
      type: asset.file.type,
      lastModified: asset.file.lastModified,
      dataUrl,
    }
  }, [])

  useEffect(() => {
    if (!sessionHydratedRef.current) return

    const timeout = window.setTimeout(() => {
      async function persistSession() {
        try {
          const storedBatchImages: StoredBatchImageItem[] = []
          for (const item of batchImages) {
            const asset = await persistImage(item.asset)
            if (!asset) continue
            storedBatchImages.push({
              id: item.id,
              asset,
              selected: item.selected,
              overrideAdjustments: item.overrideAdjustments,
              adjustmentSource: item.adjustmentSource,
            })
          }

          const stored: StoredSession = {
            version: 2,
            activeTab,
            beforeImage: await persistImage(beforeImage),
            targetImage: await persistImage(targetImage),
            batchImages: storedBatchImages,
            selectedImageId,
            globalAdjustments,
            globalAdjustmentSource,
            applyScope,
            activePresetId,
            presetStrength,
            previewMode,
            aiAnalysis,
            aiSnapshot,
            beforeResult,
            exportQuality,
            exportMaxEdge,
          }
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(stored))
        } catch {
          setSessionMessage('本地会话保存失败，可能是浏览器存储空间不足。')
        }
      }

      void persistSession()
    }, 500)

    return () => window.clearTimeout(timeout)
  }, [
    activePresetId,
    activeTab,
    aiAnalysis,
    aiSnapshot,
    applyScope,
    batchImages,
    beforeImage,
    beforeResult,
    exportMaxEdge,
    exportQuality,
    globalAdjustments,
    globalAdjustmentSource,
    persistImage,
    presetStrength,
    previewMode,
    selectedImageId,
    targetImage,
  ])

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
    setAiSnapshot(null)
    setAnalysisError('')
    setAnalysisErrorCode(null)
    setAnalysisSoftTimedOut(false)
    setAnalysisPhase(null)
    setAnalysisCacheSource(null)
    setAnalysisStatus('idle')
    if (colorAnalysisSoftTimeoutRef.current) {
      window.clearTimeout(colorAnalysisSoftTimeoutRef.current)
      colorAnalysisSoftTimeoutRef.current = null
    }
  }

  const clearBeforeAnalysis = () => {
    setBeforeResult(null)
    setBeforeError('')
    setBeforeStatus('idle')
    setBeforeCopied(false)
  }

  // V3.0 拍前：多参考图队列
  const addBeforeRef = async (asset: ImageAsset) => {
    const id = crypto.randomUUID()
    setBeforeQueue((current) => [...current, { id, asset, exif: null }])
    setSelectedBeforeId(id)
    setBeforeImage(asset)
    clearBeforeAnalysis()
    const exif = await readExif(asset)
    setBeforeQueue((current) =>
      current.map((item) => (item.id === id ? { ...item, exif } : item)),
    )
  }

  const selectBeforeRef = (id: string) => {
    const item = beforeQueue.find((entry) => entry.id === id)
    if (!item) return
    setSelectedBeforeId(id)
    setBeforeImage(item.asset)
    clearBeforeAnalysis()
  }

  // 闭环：拍前分析 → 拍后
  const sendBeforeToAfter = () => {
    if (!beforeResult) return
    setGlobalAdjustments(beforeAnalysisToAdjustments(beforeResult))
    setGlobalAdjustmentSource('ai')
    setActiveTab('after')
    setPresetMessage('已把拍前分析作为拍后起始调色参数。')
  }

  const saveBeforeAsPreset = () => {
    if (!beforeResult) return
    const preset = createCustomPreset('拍前建议', beforeAnalysisToAdjustments(beforeResult))
    setCustomPresets((current) => [preset, ...current])
    setPresetMessage('已把拍前分析保存为拍后预设“拍前建议”。')
  }

  const selectedBeforeItem =
    beforeQueue.find((item) => item.id === selectedBeforeId) ?? null
  const beforeExif = selectedBeforeItem?.exif ?? null
  const selectedBeforeAsset = selectedBeforeItem?.asset ?? beforeImage

  const remember = (label: string, value = currentAdjustments) => {
    setHistoryPast((current) => [...current.slice(-49), { values: value, label }])
    setHistoryFuture([])
  }

  const applyAdjustmentsToScope = (
    next: AdjustmentValues,
    options: {
      recordHistory?: boolean
      scope?: ApplyScope
      source?: AdjustmentSource | null
      label?: string
    } = {},
  ) => {
    const scope = options.scope ?? applyScope
    const source = options.source ?? currentAdjustmentSource
    if (options.recordHistory !== false) {
      remember(options.label ?? describeAdjustmentSource(source))
    }

    if (scope === 'all') {
      setGlobalAdjustments(next)
      setGlobalAdjustmentSource(source)
      setBatchImages((current) =>
        current.map((item) => ({
          ...item,
          overrideAdjustments: undefined,
          adjustmentSource: undefined,
        })),
      )
      return
    }

    if (scope === 'selected') {
      setBatchImages((current) =>
        current.map((item) =>
          item.selected
            ? { ...item, overrideAdjustments: next, adjustmentSource: source ?? undefined }
            : item,
        ),
      )
      return
    }

    if (!selectedImageId) {
      setGlobalAdjustments(next)
      setGlobalAdjustmentSource(source)
      return
    }

    setBatchImages((current) =>
      current.map((item) =>
        item.id === selectedImageId
          ? { ...item, overrideAdjustments: next, adjustmentSource: source ?? undefined }
          : item,
      ),
    )
  }

  const addBatchImages = (assets: ImageAsset[]) => {
    if (!assets.length) return
    const nextItems = assets.map((asset) => ({
      id: crypto.randomUUID(),
      asset,
      selected: false,
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

  const exportBatch = async (mode: 'all' | 'selected' | 'successful' | 'failed') => {
    if (!batchImages.length || batchExporting) return
    const candidates = batchImages.filter((item) => {
      if (mode === 'selected') return item.selected
      if (mode === 'successful') return item.exportStatus === 'done'
      if (mode === 'failed') return item.exportStatus === 'error'
      return true
    })
    if (!candidates.length) {
      setBatchExportMessage('没有符合条件的图片可导出。')
      return
    }

    setBatchExporting(true)
    const controller = new AbortController()
    batchExportControllerRef.current = controller
    const startedAt = performance.now()
    setBatchExportMessage(
      `正在处理 ${candidates.length} 张图片 · 最长边 ${exportMaxEdge}px · ${exportQualityLabel(exportQuality)}。`,
    )
    setBatchImages((current) =>
      current.map((item) =>
        candidates.some((candidate) => candidate.id === item.id)
          ? { ...item, exportStatus: 'queued', exportError: undefined }
          : item,
      ),
    )

    const exported: { name: string; blob: Blob }[] = []
    let cursor = 0
    try {
      const runNext = async (): Promise<void> => {
        if (controller.signal.aborted) {
          throw new DOMException('批量处理已取消。', 'AbortError')
        }
        const index = cursor
        const item = candidates[index]
        cursor += 1
        if (!item) return

        setBatchImages((current) =>
          current.map((candidate) =>
            candidate.id === item.id
              ? { ...candidate, exportStatus: 'decoding', exportError: undefined }
              : candidate,
          ),
        )
        try {
          const blob = await renderAdjustedImageBlob(
            item.asset,
            item.overrideAdjustments ?? globalAdjustments,
            {
              signal: controller.signal,
              quality: exportQuality,
              maxEdge: exportMaxEdge,
              onStageChange: (stage) => updateBatchExportStage(item.id, stage),
            },
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
                      controller.signal.aborted
                        ? '批量处理已取消。'
                        : error instanceof Error
                          ? error.message
                          : '图片导出失败。',
                  }
                : candidate,
            ),
          )
        }
        await runNext()
      }

      await Promise.all(
        Array.from({ length: Math.min(BATCH_EXPORT_CONCURRENCY, candidates.length) }, () =>
          runNext(),
        ),
      )
      if (!exported.length) throw new Error('没有图片成功完成处理。')
      if (controller.signal.aborted) {
        throw new DOMException('批量处理已取消。', 'AbortError')
      }

      setBatchExportMessage('图片处理完成，正在打包 ZIP...')
      setBatchImages((current) =>
        current.map((item) =>
          candidates.some((candidate) => candidate.id === item.id) &&
          item.exportStatus === 'done'
            ? { ...item, exportStatus: 'packaging' }
            : item,
        ),
      )
      const zip = await createZipBlob(exported)
      downloadBlob(zip, `shotai-batch-${Date.now()}.zip`)
      const failed = candidates.length - exported.length
      const elapsed = Math.max(0.1, (performance.now() - startedAt) / 1000)
      recordPerformanceMetric({
        label: '批量导出',
        durationMs: elapsed * 1000,
        detail: `${exported.length}/${candidates.length} 张 · ${exportMaxEdge}px · ${exportQualityLabel(exportQuality)}`,
      })
      setBatchImages((current) =>
        current.map((item) =>
          item.exportStatus === 'packaging' ? { ...item, exportStatus: 'done' } : item,
        ),
      )
      setBatchExportMessage(
        failed
          ? `已导出 ${exported.length} 张；${failed} 张处理失败，用时 ${elapsed.toFixed(1)} 秒。`
          : `已将 ${exported.length} 张图片打包为 ZIP，用时 ${elapsed.toFixed(1)} 秒。`,
      )
    } catch (error) {
      setBatchImages((current) =>
        current.map((item) =>
          item.exportStatus === 'queued' ||
          item.exportStatus === 'decoding' ||
          item.exportStatus === 'processing' ||
          item.exportStatus === 'encoding' ||
          item.exportStatus === 'packaging'
            ? { ...item, exportStatus: 'idle' }
            : item,
        ),
      )
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

  const updateBatchExportStage = (id: string, stage: ExportStage) => {
    setBatchImages((current) =>
      current.map((item) =>
        item.id === id ? { ...item, exportStatus: stage } : item,
      ),
    )
  }

  const resetAdjustments = () => {
    applyAdjustmentsToScope(DEFAULT_ADJUSTMENTS, { source: null, label: '重置' })
    setActivePresetId(null)
    setPresetModified(false)
    setPresetMessage('已重置当前作用范围的调色参数。')
  }

  const resetOneAdjustment = (key: AdjustmentKey) => {
    applyAdjustmentsToScope({
      ...currentAdjustments,
      [key]: DEFAULT_ADJUSTMENTS[key],
    }, { source: getManualSource(currentAdjustmentSource) })
    if (activePresetId) setPresetModified(true)
  }

  const resetGroupAdjustments = (groupId: AdjustmentGroupId) => {
    applyAdjustmentsToScope(
      resetAdjustmentGroup(currentAdjustments, groupId),
      { source: getManualSource(currentAdjustmentSource) },
    )
    if (activePresetId) setPresetModified(true)
  }

  const updateAdjustments = (next: AdjustmentValues) => {
    applyAdjustmentsToScope(next, { source: getManualSource(currentAdjustmentSource) })
    if (activePresetId) setPresetModified(true)
  }

  const undoAdjustments = () => {
    const previous = historyPast.at(-1)
    if (!previous) return
    setHistoryPast((current) => current.slice(0, -1))
    setHistoryFuture((current) =>
      [{ values: currentAdjustments, label: previous.label }, ...current].slice(0, 50),
    )
    applyAdjustmentsToScope(previous.values, {
      recordHistory: false,
      scope: 'current',
      source: getManualSource(currentAdjustmentSource),
    })
  }

  const redoAdjustments = () => {
    const next = historyFuture[0]
    if (!next) return
    setHistoryFuture((current) => current.slice(1))
    setHistoryPast((current) => [
      ...current.slice(-49),
      { values: currentAdjustments, label: next.label },
    ])
    applyAdjustmentsToScope(next.values, {
      recordHistory: false,
      scope: 'current',
      source: getManualSource(currentAdjustmentSource),
    })
  }

  const applyPreset = (preset: StylePreset) => {
    setActivePresetId(preset.id)
    setPresetStrength(100)
    setPresetModified(false)
    applyAdjustmentsToScope(preset.adjustments, { source: 'preset' })
    setPresetMessage(`已应用“${preset.name}”到${scopeLabel(applyScope)}。`)
  }

  const changePresetStrength = (strength: number) => {
    const preset = [...BUILT_IN_PRESETS, ...customPresets].find(
      (item) => item.id === activePresetId,
    )
    if (!preset) return
    setPresetStrength(strength)
    setPresetModified(false)
    applyAdjustmentsToScope(applyPresetStrength(preset.adjustments, strength), {
      source: 'preset',
    })
  }

  const savePreset = (name: string) => {
    if (customPresets.length >= MAX_CUSTOM_PRESETS) {
      setPresetMessage('本地预设已达到 100 套上限，请先删除或导出备份。')
      return
    }
    const preset = createCustomPreset(name, currentAdjustments)
    setCustomPresets((current) => [preset, ...current])
    setActivePresetId(preset.id)
    setPresetStrength(100)
    setPresetModified(false)
    setPresetMessage(`已保存“${preset.name}”到预设中心。`)
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
    downloadBlob(blob, `shotai-presets-${Date.now()}.json`)
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

  const clearColorSoftTimeout = () => {
    if (colorAnalysisSoftTimeoutRef.current) {
      window.clearTimeout(colorAnalysisSoftTimeoutRef.current)
      colorAnalysisSoftTimeoutRef.current = null
    }
  }

  const scheduleColorSoftTimeout = () => {
    clearColorSoftTimeout()
    colorAnalysisSoftTimeoutRef.current = window.setTimeout(() => {
      setAnalysisSoftTimedOut(true)
    }, AI_SOFT_TIMEOUT_MS)
  }

  const setCurrentImageAnalysisStatus = (
    status: BatchImageItem['analysisStatus'],
  ) => {
    if (!selectedImageId) return
    setBatchImages((current) =>
      current.map((item) =>
        item.id === selectedImageId ? { ...item, analysisStatus: status } : item,
      ),
    )
  }

  const runColorAnalysis = async (options: { restart?: boolean } = {}) => {
    if (!targetImage || !userImage) {
      setAnalysisStatus('error')
      setAnalysisError('请先上传目标风格照和我的实拍照。')
      setAnalysisErrorCode('invalid-image')
      return
    }

    if (!privacyAccepted) {
      setAnalysisStatus('error')
      setAnalysisError('请先确认图片会发送到本地 API proxy 并转发给 Gemini API。')
      setAnalysisErrorCode('configuration')
      return
    }

    if (options.restart) {
      colorAnalysisControllerRef.current?.abort()
    }

    const requestId = colorAnalysisRequestRef.current + 1
    colorAnalysisRequestRef.current = requestId
    const cacheKey = colorAnalysisCacheKey(targetImage, userImage)
    const cached = options.restart
      ? null
      : colorAnalysisCacheRef.current.get(cacheKey)
    if (cached) {
      setAiAnalysis(cached)
      setAnalysisStatus('success')
      setAnalysisError('')
      setAnalysisErrorCode(null)
      setAnalysisSoftTimedOut(false)
      setAnalysisPhase(null)
      setAnalysisCacheSource('cached')
      setAiApplyStrength(100)
      setAiSnapshot(currentAdjustments)
      setCurrentImageAnalysisStatus('success')
      setPresetMessage('已复用最近一次 AI 分析结果。')
      return
    }
    setAnalysisStatus('loading')
    setAnalysisError('')
    setAnalysisErrorCode(null)
    setAnalysisSoftTimedOut(false)
    setAnalysisPhase('encoding')
    setAnalysisCacheSource(null)
    setAiApplyStrength(100)
    setAiSnapshot(currentAdjustments)
    setCurrentImageAnalysisStatus('loading')
    scheduleColorSoftTimeout()
    const controller = new AbortController()
    colorAnalysisControllerRef.current = controller

    try {
      const result = await analyzeColorMatch(targetImage, userImage, {
        signal: controller.signal,
        onPhaseChange: setAnalysisPhase,
        model: selectedModel,
      })
      if (colorAnalysisRequestRef.current !== requestId) return
      colorAnalysisCacheRef.current.set(cacheKey, result)
      setAiAnalysis(result)
      setAnalysisStatus('success')
      setAnalysisSoftTimedOut(false)
      setAnalysisPhase(null)
      setAnalysisCacheSource('fresh')
      setCurrentImageAnalysisStatus('success')
      setPresetMessage('AI 建议已生成，点击“应用建议”后才会写入参数。')
    } catch (error) {
      if (colorAnalysisRequestRef.current !== requestId) return
      const apiError = normalizeAnalysisError(error)
      setAnalysisStatus('error')
      setAnalysisSoftTimedOut(false)
      setAnalysisPhase(null)
      setAnalysisCacheSource(null)
      setAnalysisError(apiError.message)
      setAnalysisErrorCode(apiError.code)
      setCurrentImageAnalysisStatus('error')
    } finally {
      if (colorAnalysisRequestRef.current === requestId) {
        clearColorSoftTimeout()
        colorAnalysisControllerRef.current = null
      }
    }
  }

  const cancelColorAnalysis = () => {
    colorAnalysisControllerRef.current?.abort()
  }

  const continueColorAnalysis = () => {
    setAnalysisSoftTimedOut(false)
    scheduleColorSoftTimeout()
  }

  const retryColorAnalysis = () => {
    void runColorAnalysis({ restart: true })
  }

  const applyAiSuggestion = () => {
    if (!aiAnalysis) return
    applyAdjustmentsToScope(
      blendAdjustments(
        aiSnapshot ?? currentAdjustments,
        aiAnalysis.adjustments,
        aiApplyStrength,
      ),
      { source: 'ai' },
    )
    setActivePresetId(null)
    setPresetModified(false)
    setPresetMessage(
      `已按 ${aiApplyStrength}% 强度应用 AI 推荐参数到${scopeLabel(applyScope)}。`,
    )
  }

  const restoreAiSnapshot = () => {
    if (!aiSnapshot) return
    applyAdjustmentsToScope(aiSnapshot, { source: null, label: '恢复分析前' })
    setPresetMessage('已恢复 AI 分析前的参数。')
  }

  // V3.0 AI 精修：自然语言微调当前参数（单轮 + 增量）
  const addRefineDelta = (base: AdjustmentValues, changes: AdjustmentValues) =>
    mapAdjustments(base, (value, key) => value + changes[key])

  const generateRefine = async () => {
    if (!userImage) return
    const instruction = refineInstruction.trim()
    if (!instruction) return
    if (refinePreviewBaseline) {
      applyAdjustmentsToScope(refinePreviewBaseline, { recordHistory: false })
      setRefinePreviewBaseline(null)
    }
    // 换图时重置缓存与"已传图"标记
    if (refineCacheRef.current.image !== userImage) {
      refineCacheRef.current = { image: userImage, map: new Map() }
      refineSentImageRef.current = null
    }
    // 命中缓存：同图同指令直接返回，不再调用
    const cached = refineCacheRef.current.map.get(instruction)
    if (cached) {
      setRefineSuggestion(cached)
      setRefineStatus('success')
      setRefineError('')
      return
    }
    setRefineStatus('loading')
    setRefineError('')
    const controller = new AbortController()
    refineControllerRef.current = controller
    // 首次传图，后续轮复用（同一张实拍图不再重复上传）
    const sendImage = refineSentImageRef.current !== userImage
    try {
      const result = await refineColorAdjustments(
        instruction,
        currentAdjustments,
        sendImage ? userImage : null,
        { model: selectedModel, signal: controller.signal },
      )
      if (sendImage) refineSentImageRef.current = userImage
      refineCacheRef.current.map.set(instruction, result)
      setRefineSuggestion(result)
      setRefineStatus('success')
    } catch (error) {
      setRefineStatus('error')
      setRefineError(normalizeAnalysisError(error).message)
    } finally {
      refineControllerRef.current = null
    }
  }

  const togglePreviewRefine = () => {
    if (!refineSuggestion) return
    if (refinePreviewBaseline) {
      applyAdjustmentsToScope(refinePreviewBaseline, { recordHistory: false })
      setRefinePreviewBaseline(null)
    } else {
      const baseline = currentAdjustments
      setRefinePreviewBaseline(baseline)
      applyAdjustmentsToScope(addRefineDelta(baseline, refineSuggestion.changes), {
        recordHistory: false,
        source: 'ai',
      })
    }
  }

  const applyRefine = () => {
    if (!refineSuggestion) return
    let applied: AdjustmentValues
    if (refinePreviewBaseline) {
      // 预览时实时值已是 baseline+delta；把 baseline 以"AI 精修"标签记入历史，撤回即回到 baseline
      applied = addRefineDelta(refinePreviewBaseline, refineSuggestion.changes)
      remember('AI 精修', refinePreviewBaseline)
      setRefinePreviewBaseline(null)
    } else {
      applied = addRefineDelta(currentAdjustments, refineSuggestion.changes)
      applyAdjustmentsToScope(applied, { source: 'ai', label: 'AI 精修' })
    }
    setLastRefineAdjustments(applied)
    setActivePresetId(null)
    setPresetModified(false)
    setPresetMessage('已应用 AI 精修建议。')
    // 保留 refineSuggestion 与指令：可再次应用 / 查看（你要的"可缓存、可返回"）
  }

  const undoRefine = () => {
    setRefinePreviewBaseline(null)
    undoAdjustments()
  }

  // 命名恢复锚点："恢复到上次 AI 精修结果"
  const restoreRefine = () => {
    if (!lastRefineAdjustments) return
    applyAdjustmentsToScope(lastRefineAdjustments, { source: 'ai', label: '恢复精修' })
    setPresetMessage('已恢复到上次 AI 精修结果。')
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
      const result = await analyzeBeforeShoot(beforeImage, selectedModel, controller.signal)
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Aperture size={19} strokeWidth={2.2} />
          </span>
          <span>Shotai</span>
          <span className="version-tag">V3.0</span>
        </div>
        <nav className="global-nav" aria-label="全局导航">
          <button type="button" className={activeTab === 'before' ? 'active' : ''} onClick={() => setActiveTab('before')}>
            <Camera size={16} />
            拍前参考
          </button>
          <button type="button" className={activeTab === 'after' ? 'active' : ''} onClick={() => setActiveTab('after')}>
            <SlidersHorizontal size={16} />
            调色工作台
          </button>
          <button type="button">
            <Grid2X2 size={15} />
            预设中心
          </button>
          <button type="button">
            <History size={15} />
            历史记录
          </button>
        </nav>
        <div className="topbar-right">
        <label className="model-select" title="选择 AI 模型（用于评测与按需切换）">
          <span className="model-select__label">模型</span>
          <select
            aria-label="选择 AI 模型"
            value={selectedModel}
            onChange={(event) => {
              const next = event.target.value
              setSelectedModel(next)
              try {
                window.localStorage.setItem(MODEL_STORAGE_KEY, next)
              } catch {
                /* localStorage 不可用时忽略，仅本次会话生效 */
              }
            }}
          >
            {MODEL_OPTIONS.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
        <span className={`api-health ${apiHealth}`}>
          {apiHealth === 'ready' ? <Server size={13} /> : <ServerOff size={13} />}
          {formatApiHealth(apiHealth)}
        </span>
        </div>
      </header>

      <main>
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
              <div className="before-left">
                <div className="ref-queue-head">
                  <span className="panel-kicker">参考图队列</span>
                  <small>可上传多张 · 分析以选中的单张为主</small>
                </div>
                <div className="ref-queue">
                  {beforeQueue.map((item, index) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`ref-thumb${item.id === selectedBeforeId ? ' selected' : ''}`}
                      onClick={() => selectBeforeRef(item.id)}
                      title={`选择参考 ${index + 1}`}
                    >
                      <img src={item.asset.url} alt={`参考 ${index + 1}`} />
                      <span className="ref-cap">
                        参考 {index + 1}
                        {item.id === selectedBeforeId ? ' · 当前分析图' : ''}
                      </span>
                    </button>
                  ))}
                  <div className="ref-add">
                    <ImageUploader
                      compact
                      label="上传参考照片"
                      description="可添加多张参考图"
                      image={null}
                      onPreview={(image) => setLightbox({ image, title: '参考照片' })}
                      onImageChange={(next) => {
                        if (next) void addBeforeRef(next)
                      }}
                    />
                  </div>
                </div>
                {selectedBeforeAsset ? (
                  <button
                    type="button"
                    className="before-preview"
                    onClick={() =>
                      setLightbox({ image: selectedBeforeAsset, title: '参考照片' })
                    }
                  >
                    <img src={selectedBeforeAsset.url} alt="选中的参考图" />
                  </button>
                ) : (
                  <div className="before-preview empty">
                    上传参考照片后在此预览
                  </div>
                )}
                {beforeExif && (
                  <div className="exif-strip">
                    <span className="exif-lead">📷 自带属性</span>
                    {exifEntries(beforeExif).map((entry) => (
                      <span className="exif-chip" key={entry}>
                        {entry}
                      </span>
                    ))}
                  </div>
                )}
              </div>
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
                onSaveToPreset={saveBeforeAsPreset}
                onSendToAfter={sendBeforeToAfter}
              />
            </div>
          </section>
        ) : (
          <section className="v2-workbench">
            <div className="workbench-main">
              <div className="material-section">
                <div className="reference-strip">
                  <ImageUploader
                    compact
                    label="目标风格照"
                    description="用于记录你想靠近的视觉方向"
                    image={targetImage}
                    onPreview={(image) => setLightbox({ image, title: '目标风格照' })}
                    onImageChange={(next) => {
                      replaceImage(targetImage, setTargetImage)(next)
                      clearColorAnalysis()
                    }}
                  />
                  <div className="current-card">
                    <span className="panel-kicker">当前实拍</span>
                    {userImage ? (
                      <button
                        type="button"
                        className="current-preview"
                        onClick={() => setLightbox({ image: userImage, title: '当前实拍照' })}
                      >
                        <img src={userImage.url} alt="当前实拍照" />
                        <span>
                          <strong>{userImage.file.name}</strong>
                          <small>
                            {userImage.width} x {userImage.height}
                            {currentAdjustmentSource ? ` · ${sourceLabel(currentAdjustmentSource)}` : ''}
                          </small>
                        </span>
                      </button>
                    ) : (
                      <div className="current-empty">
                        <ImageIcon size={22} />
                        <span>从图片队列选择一张实拍照</span>
                      </div>
                    )}
                  </div>
                </div>

                <BatchImageQueue
                  items={batchImages}
                  selectedId={selectedImageId}
                  exporting={batchExporting}
                  filter={batchFilter}
                  exportQuality={exportQuality}
                  exportMaxEdge={exportMaxEdge}
                  onFilterChange={setBatchFilter}
                  onExportQualityChange={setExportQuality}
                  onExportMaxEdgeChange={setExportMaxEdge}
                  onAdd={addBatchImages}
                  onSelect={(id) => {
                    setSelectedImageId(id)
                    clearColorAnalysis()
                  }}
                  onToggleSelect={(id) =>
                    setBatchImages((current) =>
                      current.map((item) =>
                        item.id === id ? { ...item, selected: !item.selected } : item,
                      ),
                    )
                  }
                  onSelectAll={() =>
                    setBatchImages((current) =>
                      current.map((item) => ({ ...item, selected: true })),
                    )
                  }
                  onClearSelection={() =>
                    setBatchImages((current) =>
                      current.map((item) => ({ ...item, selected: false })),
                    )
                  }
                  onRemove={removeBatchImage}
                  onClear={clearBatchImages}
                  onExportAll={() => exportBatch('all')}
                  onExportSelected={() => exportBatch('selected')}
                  onExportSuccessful={() => exportBatch('successful')}
                  onCancelExport={cancelBatchExport}
                  onRetryFailed={() => exportBatch('failed')}
                  exportMessage={batchExportMessage}
                  onPreview={(asset) => setLightbox({ image: asset, title: asset.file.name })}
                />
              </div>

              <CanvasPreview
                image={userImage}
                adjustments={currentAdjustments}
                mode={previewMode}
                risks={previewRisks}
                renderStatus={previewStatus}
                exportQuality={exportQuality}
                exportMaxEdge={exportMaxEdge}
                onModeChange={setPreviewMode}
                onPreview={(image) => setLightbox({ image, title: '主预览' })}
                onRenderStatusChange={setPreviewStatus}
                onRisksChange={setPreviewRisks}
                onRenderMetric={recordPreviewMetric}
              />
            </div>

            <aside className="control-column v2-controls">
              <section className="performance-panel">
                <button
                  type="button"
                  className="performance-toggle"
                  onClick={() => setShowPerformancePanel((current) => !current)}
                  aria-expanded={showPerformancePanel}
                >
                  <Activity size={15} />
                  性能
                  <span>{showPerformancePanel ? '收起' : '查看'}</span>
                </button>
                {showPerformancePanel && (
                  <PerformancePanel
                    currentImage={userImage}
                    queueCount={batchImages.length}
                    previewStatus={previewStatus}
                    metrics={performanceMetrics}
                    cacheCount={colorAnalysisCacheRef.current.size}
                  />
                )}
              </section>
              <section className="scope-panel">
                <div className="panel-heading compact">
                  <div>
                    <span className="panel-kicker">当前作用范围</span>
                    <h2>参数应用到哪里</h2>
                  </div>
                </div>
                {sessionMessage && (
                  <StatusMessage tone="success">{sessionMessage}</StatusMessage>
                )}
                <div className="scope-segmented" role="group" aria-label="当前作用范围">
                  <button
                    type="button"
                    className={applyScope === 'current' ? 'active' : ''}
                    onClick={() => setApplyScope('current')}
                  >
                    当前图
                  </button>
                  <button
                    type="button"
                    className={applyScope === 'selected' ? 'active' : ''}
                    disabled={!selectedCount}
                    onClick={() => setApplyScope('selected')}
                  >
                    选中图{selectedCount ? ` (${selectedCount})` : ''}
                  </button>
                  <button
                    type="button"
                    className={applyScope === 'all' ? 'active' : ''}
                    onClick={() => setApplyScope('all')}
                  >
                    全部
                  </button>
                </div>
              </section>

              <section className="ai-action-panel prominent">
                <div className="panel-heading compact">
                  <div>
                    <span className="panel-kicker">AI 调色建议</span>
                    <h2>生成后由你确认应用</h2>
                  </div>
                  <span className={`confidence-chip ${getColorAnalysisTone(analysisStatus, aiAnalysis)}`}>
                    {getColorAnalysisLabel(analysisStatus, aiAnalysis)}
                  </span>
                </div>
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
                    我确认分析时会将两张图片发送到本地 API proxy，并由 proxy 转发给 Gemini API。
                  </label>
                </div>
                <button
                  type="button"
                  className="analysis-button"
                  onClick={
                    analysisStatus === 'loading'
                      ? analysisSoftTimedOut
                        ? continueColorAnalysis
                        : cancelColorAnalysis
                      : () => void runColorAnalysis()
                  }
                  disabled={
                    analysisStatus !== 'loading' && (!targetImage || !userImage)
                  }
                >
                  {analysisStatus === 'loading' ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <WandSparkles size={17} />
                  )}
                  {getColorAnalysisButtonLabel(analysisStatus, analysisSoftTimedOut)}
                </button>
                {(analysisStatus === 'loading' || analysisCacheSource) && (
                  <p className="analysis-phase">
                    {analysisStatus === 'loading'
                      ? analysisPhaseLabel(analysisPhase)
                      : analysisCacheSource === 'cached'
                        ? '已复用同一组图片的最近分析结果。'
                        : 'AI 分析完成，本次结果已加入本地缓存。'}
                  </p>
                )}
                {analysisSoftTimedOut && analysisStatus === 'loading' && (
                  <AiTimeoutActions
                    onContinue={continueColorAnalysis}
                    onRetry={retryColorAnalysis}
                    onCancel={cancelColorAnalysis}
                  />
                )}
                {analysisStatus === 'error' && analysisError && (
                  <AnalysisErrorMessage
                    code={analysisErrorCode}
                    message={analysisError}
                    onRetry={retryColorAnalysis}
                  />
                )}
                {aiAnalysis && (
                  <AiSuggestionCard
                    result={aiAnalysis}
                    strength={aiApplyStrength}
                    onStrengthChange={setAiApplyStrength}
                    onApply={applyAiSuggestion}
                    onRestore={restoreAiSnapshot}
                    onCopy={() => navigator.clipboard.writeText(formatColorAnalysis(aiAnalysis))}
                  />
                )}
                {!aiAnalysis && analysisStatus !== 'error' && (
                  <div className="analysis-empty">
                    <Sparkles size={20} />
                    <p>
                      {targetImage && userImage
                        ? '点击开始分析，AI 建议生成前不会显示伪参数。'
                        : '上传目标风格照并选择实拍照后开始分析。'}
                    </p>
                  </div>
                )}
              </section>

              <section className="ai-refine-card">
                <div className="panel-heading">
                  <div>
                    <span className="panel-kicker">AI 精修</span>
                    <h2>自然语言调色</h2>
                  </div>
                </div>
                <div className="ai-refine-input">
                  <input
                    type="text"
                    value={refineInstruction}
                    onChange={(event) => setRefineInstruction(event.target.value)}
                    placeholder="再冷一点，但保留肤色"
                    disabled={!userImage || refineStatus === 'loading'}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void generateRefine()
                    }}
                  />
                  <button
                    type="button"
                    className="primary-inline"
                    onClick={() => void generateRefine()}
                    disabled={
                      !userImage || !refineInstruction.trim() || refineStatus === 'loading'
                    }
                  >
                    {refineStatus === 'loading' ? '生成中…' : '生成建议'}
                  </button>
                </div>
                {!userImage && (
                  <p className="ai-refine-hint">先选择一张实拍照，再用 AI 精修。</p>
                )}
                {refineStatus === 'error' && refineError && (
                  <p className="ai-refine-error">{refineError}</p>
                )}
                {refineSuggestion && (
                  <div className="ai-refine-result">
                    {refineSuggestion.rationale && (
                      <p className="ai-refine-rationale">{refineSuggestion.rationale}</p>
                    )}
                    <div className="ai-refine-changes">
                      {Object.entries(refineSuggestion.changes)
                        .filter(([, value]) => value !== 0)
                        .map(([key, value]) => (
                          <span key={key} className="ai-refine-chip">
                            {ADJUSTMENT_LABELS[key as AdjustmentKey]}{' '}
                            {formatAdjustmentValue(value)}
                          </span>
                        ))}
                      {Object.values(refineSuggestion.changes).every(
                        (value) => value === 0,
                      ) && <span className="ai-refine-chip muted">无明显变化</span>}
                    </div>
                    {refineSuggestion.note && (
                      <p className="ai-refine-note">{refineSuggestion.note}</p>
                    )}
                    <div className="ai-result-actions">
                      <button type="button" onClick={togglePreviewRefine}>
                        {refinePreviewBaseline ? '收起预览' : '预览建议'}
                      </button>
                      <button type="button" className="primary-inline" onClick={applyRefine}>
                        应用
                      </button>
                      <button
                        type="button"
                        onClick={undoRefine}
                        disabled={!historyPast.length}
                      >
                        撤回上一轮
                      </button>
                    </div>
                  </div>
                )}
              </section>

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
                values={currentAdjustments}
                aiValues={aiAnalysis?.adjustments ?? null}
                presetValues={activePresetValues}
                canUndo={!!historyPast.length}
                canRedo={!!historyFuture.length}
                onChange={updateAdjustments}
                onResetOne={resetOneAdjustment}
                onResetGroup={resetGroupAdjustments}
                onResetAll={resetAdjustments}
                onRestoreAi={() => aiAnalysis && applyAdjustmentsToScope(aiAnalysis.adjustments, { source: 'ai' })}
                onRestorePreset={() => activePresetValues && applyAdjustmentsToScope(activePresetValues, { source: 'preset' })}
                refineValues={lastRefineAdjustments}
                onRestoreRefine={restoreRefine}
                undoLabel={historyPast.at(-1)?.label}
                redoLabel={historyFuture[0]?.label}
                onUndo={undoAdjustments}
                onRedo={redoAdjustments}
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
            </aside>
          </section>
        )}
      </main>
      {lightbox && (
        <ImageLightbox
          state={lightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}

function AiSuggestionCard({
  result,
  strength,
  onStrengthChange,
  onApply,
  onRestore,
  onCopy,
}: {
  result: ColorAnalysisResult
  strength: number
  onStrengthChange: (strength: number) => void
  onApply: () => void
  onRestore: () => void
  onCopy: () => void
}) {
  return (
    <div className="ai-result-card">
      <article>
        <h3>风格摘要</h3>
        <p>{result.styleSummary}</p>
      </article>
      <article>
        <h3>关键差异</h3>
        <ul>{result.keyDifferences.map((item) => <li key={item}>{item}</li>)}</ul>
      </article>
      <article>
        <h3>调整策略</h3>
        <p>{result.strategy}</p>
      </article>
      <article>
        <h3>参数建议与理由</h3>
        <div className="parameter-rationales">
          {result.parameterRationales.map((item) => (
            <span key={item.key}>
              <strong>{item.label} {formatAdjustmentValue(item.value)}</strong>
              {item.reason}
            </span>
          ))}
        </div>
      </article>
      <article>
        <h3>风险与不确定性</h3>
        <ul>{result.risks.map((item) => <li key={item}>{item}</li>)}</ul>
      </article>
      <article className="ai-strength-card">
        <h3>应用强度</h3>
        <div className="ai-strength-actions" aria-label="AI 应用强度">
          {[25, 50, 100, 125, 150, 200].map((value) => (
            <button
              key={value}
              type="button"
              className={strength === value ? 'active' : ''}
              onClick={() => onStrengthChange(value)}
            >
              {value}%
            </button>
          ))}
        </div>
        <label className="ai-strength-slider">
          <input
            type="range"
            min="0"
            max="200"
            step="5"
            value={strength}
            onChange={(event) => onStrengthChange(Number(event.target.value))}
          />
          <strong>{strength}%</strong>
        </label>
      </article>
      <div className="ai-result-actions">
        <button type="button" className="primary-inline" onClick={onApply}>应用建议</button>
        <button type="button" onClick={onCopy}>复制调整</button>
        <button type="button" onClick={onRestore}>恢复分析前</button>
      </div>
    </div>
  )
}

function PerformancePanel({
  currentImage,
  queueCount,
  previewStatus,
  metrics,
  cacheCount,
}: {
  currentImage: ImageAsset | null
  queueCount: number
  previewStatus: PreviewRenderStatus
  metrics: PerformanceMetric[]
  cacheCount: number
}) {
  const worker = getAdjustmentWorkerSnapshot()
  return (
    <div className="performance-details">
      <div className="performance-grid">
        <span>
          <strong>{currentImage ? `${currentImage.width} x ${currentImage.height}` : '-'}</strong>
          当前图片
        </span>
        <span>
          <strong>{previewStatusLabel(previewStatus)}</strong>
          预览状态
        </span>
        <span>
          <strong>{queueCount}</strong>
          队列图片
        </span>
        <span>
          <strong>{worker.active ? `运行中 +${worker.queued}` : `${worker.queued} 等待`}</strong>
          Worker
        </span>
        <span>
          <strong>{cacheCount}</strong>
          AI 缓存
        </span>
      </div>
      <p className="resource-note">
        大图不写入持久缓存；删除、切换和清空队列会释放图片 URL，预览只保留当前图片源像素。
      </p>
      {metrics.length ? (
        <div className="performance-list">
          {metrics.slice(0, 5).map((metric) => (
            <span key={`${metric.createdAt}:${metric.label}`}>
              <strong>{metric.label}</strong>
              {metric.durationMs.toFixed(0)}ms · {metric.detail}
            </span>
          ))}
        </div>
      ) : (
        <p className="resource-note">完成一次预览或导出后会显示最近耗时。</p>
      )}
    </div>
  )
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
  onSaveToPreset,
  onSendToAfter,
}: {
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
  onSaveToPreset?: () => void
  onSendToAfter?: () => void
}) {
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
            我确认分析时会将参考照片发送到本地 API proxy，并由 proxy 转发给 Gemini API。
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
          <div className="visual-dimensions">
            <h3 className="vd-title">结构化视觉分析</h3>
            <div className="vd-grid">
              <div className="vd-item">
                <span className="vd-k">色彩倾向</span>
                <span className="vd-v">{result.visualDimensions.colorTendency}</span>
              </div>
              <div className="vd-item">
                <span className="vd-k">光线方向</span>
                <span className="vd-v">{result.visualDimensions.lightDirection}</span>
              </div>
              <div className="vd-item">
                <span className="vd-k">对比度</span>
                <span className="vd-v">{result.visualDimensions.contrast}</span>
              </div>
              <div className="vd-item">
                <span className="vd-k">影调</span>
                <span className="vd-v">{result.visualDimensions.tone}</span>
              </div>
              <div className="vd-item">
                <span className="vd-k">色温</span>
                <span className="vd-v">{result.visualDimensions.temperature}</span>
              </div>
              <div className="vd-item">
                <span className="vd-k">饱和度</span>
                <span className="vd-v">{result.visualDimensions.saturation}</span>
              </div>
            </div>
          </div>
          <ResultSection title="场景与环境" content={result.scene} />
          <ResultSection title="光线与曝光" content={result.lighting} />
          <ResultSection title="构图方向" content={result.composition} />
          <ResultList title="参数起点" items={result.cameraSettings} />
          <ResultList title="现场执行建议" items={result.executionTips} />
          <ResultSection title="不确定性提示" content={result.uncertainty} warning />
          {(onSaveToPreset || onSendToAfter) && (
            <div className="before-link-after">
              <h3>衔接拍后调色</h3>
              <div className="before-link-buttons">
                {onSaveToPreset && (
                  <button type="button" className="secondary-button" onClick={onSaveToPreset}>
                    保存为拍后预设
                  </button>
                )}
                {onSendToAfter && (
                  <button type="button" className="analysis-button" onClick={onSendToAfter}>
                    发送到拍后调色
                  </button>
                )}
              </div>
            </div>
          )}
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

function ImageLightbox({
  state,
  onClose,
}: {
  state: LightboxState
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(1)
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={state.title}>
      <div className="lightbox-toolbar">
        <strong>{state.title}</strong>
        <span>{state.image.width} x {state.image.height}</span>
        <button type="button" onClick={() => setZoom(1)}>
          <Maximize2 size={15} />
          适合窗口
        </button>
        <button type="button" onClick={() => setZoom(1)}>
          100%
        </button>
        <button type="button" onClick={() => setZoom((current) => Math.max(0.25, current - 0.25))}>
          <ZoomOut size={15} />
        </button>
        <button type="button" onClick={() => setZoom((current) => Math.min(4, current + 0.25))}>
          <ZoomIn size={15} />
        </button>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭大图查看器">
          <X size={18} />
        </button>
      </div>
      <div className="lightbox-stage">
        <img
          src={state.image.url}
          alt={state.title}
          style={{ width: zoom === 1 ? 'auto' : `${zoom * 100}%` }}
        />
      </div>
    </div>
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

function StatusMessage({ tone, children }: { tone: 'success' | 'error'; children: string }) {
  const Icon = tone === 'success' ? CheckCircle : AlertCircle
  return (
    <p className={`status-message ${tone}`}>
      <Icon size={14} />
      {children}
    </p>
  )
}

function AiTimeoutActions({
  onContinue,
  onRetry,
  onCancel,
}: {
  onContinue: () => void
  onRetry: () => void
  onCancel: () => void
}) {
  return (
    <div className="ai-timeout-actions">
      <StatusMessage tone="error">AI 分析等待较久，当前图片和参数均已保留。</StatusMessage>
      <div>
        <button type="button" onClick={onContinue}>继续等待</button>
        <button type="button" onClick={onRetry}>重新分析</button>
        <button type="button" onClick={onCancel}>取消</button>
      </div>
    </div>
  )
}

function AnalysisErrorMessage({
  code,
  message,
  onRetry,
}: {
  code: AnalysisErrorCode | null
  message: string
  onRetry: () => void
}) {
  const canRetry = code !== 'configuration' && code !== 'invalid-image'
  return (
    <div className="analysis-error-box">
      <StatusMessage tone="error">{message}</StatusMessage>
      <small>{analysisRecoveryHint(code)}</small>
      {canRetry && (
        <button type="button" onClick={onRetry}>
          重试分析
        </button>
      )}
    </div>
  )
}

function formatApiHealth(health: ApiHealth) {
  if (health === 'ready') return 'AI 服务就绪'
  if (health === 'degraded') return 'AI 未配置'
  if (health === 'offline') return 'API 离线'
  return '检查服务'
}

function getColorAnalysisLabel(
  status: AnalysisStatus,
  result: ColorAnalysisResult | null,
) {
  if (status === 'loading') return '分析中'
  if (status === 'error') return '分析失败'
  if (result) return `${Math.round(result.confidence * 100)}%`
  return '待分析'
}

function getColorAnalysisTone(
  status: AnalysisStatus,
  result: ColorAnalysisResult | null,
) {
  if (status === 'loading') return 'loading'
  if (status === 'error') return 'error'
  if (result) return 'success'
  return 'idle'
}

function getColorAnalysisButtonLabel(status: AnalysisStatus, softTimedOut = false) {
  if (status === 'loading') return softTimedOut ? '继续等待' : '取消分析'
  if (status === 'error') return '重新分析调色方案'
  return 'AI 分析调色方案'
}

function normalizeAnalysisError(error: unknown) {
  if (error instanceof AnalysisApiError) {
    return { code: error.code, message: error.message }
  }
  return {
    code: 'unknown' as const,
    message:
      error instanceof Error ? error.message : 'AI 调色分析失败，请稍后重试。',
  }
}

function analysisRecoveryHint(code: AnalysisErrorCode | null) {
  if (code === 'network') return '请确认本地 API proxy 已启动。'
  if (code === 'timeout') return '可以重试，或稍后在服务稳定后再次分析。'
  if (code === 'invalid-image') return '请更换图片，或压缩后重新上传。'
  if (code === 'bad-response') return 'AI 返回格式异常，请重新分析。'
  if (code === 'configuration') return '请检查 Gemini API Key 配置和权限。'
  if (code === 'quota') return '请降低请求频率，或检查 Gemini API 额度。'
  if (code === 'cancelled') return '分析已取消，当前图片和参数已保留。'
  return '当前图片和参数已保留，可重新分析。'
}

function describeAdjustmentSource(source: AdjustmentSource | null): string {
  switch (source) {
    case 'ai':
      return 'AI 调色建议'
    case 'preset':
      return '预设'
    case 'manual':
      return '手动调整'
    default:
      return '调整'
  }
}

function getManualSource(source: AdjustmentSource | null): AdjustmentSource {
  return source === 'ai' || source === 'mixed' ? 'mixed' : 'manual'
}

function sourceLabel(source: AdjustmentSource) {
  if (source === 'ai') return 'AI'
  if (source === 'preset') return '预设'
  if (source === 'mixed') return 'AI+手动'
  return '手动'
}

function exportQualityLabel(quality: ExportQuality) {
  if (quality === 'high') return '高质量'
  if (quality === 'light') return '轻量'
  return '标准质量'
}

function analysisPhaseLabel(phase: ColorAnalysisPhase | null) {
  if (phase === 'encoding') return '正在准备压缩图片...'
  if (phase === 'uploading') return '正在上传压缩图到本地 API proxy...'
  if (phase === 'analyzing') return 'Gemini 正在快速分析色彩差异...'
  if (phase === 'parsing') return '正在解析结构化调色建议...'
  return '正在准备 AI 分析...'
}

function previewStatusLabel(status: PreviewRenderStatus) {
  if (status === 'loading-source') return '读取图片'
  if (status === 'rendering') return '渲染中'
  if (status === 'ready') return '已更新'
  if (status === 'error') return '失败'
  return '空闲'
}

function colorAnalysisCacheKey(target: ImageAsset, user: ImageAsset) {
  return `${imageFingerprint(target)}::${imageFingerprint(user)}`
}

function imageFingerprint(image: ImageAsset) {
  return [
    image.file.name,
    image.file.size,
    image.file.lastModified,
    image.width,
    image.height,
  ].join(':')
}

function scopeLabel(scope: ApplyScope) {
  if (scope === 'selected') return '选中图片'
  if (scope === 'all') return '全部图片'
  return '当前图片'
}

function formatColorAnalysis(result: ColorAnalysisResult) {
  return [
    'Shotai AI 调色建议',
    '',
    `风格摘要：${result.styleSummary}`,
    `调整策略：${result.strategy}`,
    `可信度：${Math.round(result.confidence * 100)}%`,
    '',
    '关键差异：',
    ...result.keyDifferences.map((item) => `- ${item}`),
    '',
    '参数建议：',
    ...result.parameterRationales.map(
      (item) =>
        `- ${item.label} ${formatAdjustmentValue(item.value)}：${item.reason}`,
    ),
    '',
    '风险与不确定性：',
    ...result.risks.map((item) => `- ${item}`),
    '',
    '完整参数：',
    ...Object.entries(result.adjustments).map(([key, value]) => {
      const label = ADJUSTMENT_LABELS[key as AdjustmentKey]
      return `- ${label} ${formatAdjustmentValue(value)}`
    }),
  ].join('\n')
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
