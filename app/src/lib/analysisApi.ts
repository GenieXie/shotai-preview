import type { ImageAsset } from './imageAsset'
import {
  normalizeBeforeAnalysis,
  normalizeColorAnalysis,
} from './analysisContract'
import type {
  BeforeAnalysisResult,
  ColorAnalysisResult,
} from './analysisContract'
import {
  AnalysisApiError,
  classifyAnalysisResponseError,
} from './analysisErrors'
import type { AnalysisErrorCode } from './analysisErrors'
import { encodeImageForAnalysis } from './imageEncoding'

export { AnalysisApiError, classifyAnalysisResponseError }
export type { AnalysisErrorCode }

export type ColorAnalysisPhase =
  | 'encoding'
  | 'uploading'
  | 'analyzing'
  | 'parsing'

interface ColorAnalysisOptions {
  signal?: AbortSignal
  onPhaseChange?: (phase: ColorAnalysisPhase) => void
  /** V3.0：用户选择的 Gemini 模型；缺省时后端回退到默认模型 */
  model?: string
}

export async function analyzeColorMatch(
  targetImage: ImageAsset,
  userImage: ImageAsset,
  optionsOrSignal?: ColorAnalysisOptions | AbortSignal,
): Promise<ColorAnalysisResult> {
  const options = isAbortSignal(optionsOrSignal)
    ? { signal: optionsOrSignal }
    : (optionsOrSignal ?? {})
  options.onPhaseChange?.('encoding')
  const [targetPayload, userPayload] = await Promise.all([
    encodeImageForAnalysis(targetImage),
    encodeImageForAnalysis(userImage),
  ])

  options.onPhaseChange?.('uploading')
  const payload = await requestAnalysis(
    '/api/color-analysis',
    {
      targetImage: targetPayload,
      userImage: userPayload,
      model: options.model,
    },
    options.signal,
    () => options.onPhaseChange?.('analyzing'),
  )

  options.onPhaseChange?.('parsing')
  return normalizeColorAnalysis(payload)
}

export async function analyzeBeforeShoot(
  image: ImageAsset,
  model?: string,
  signal?: AbortSignal,
): Promise<BeforeAnalysisResult> {
  const imagePayload = await encodeImageForAnalysis(image)
  const payload = await requestAnalysis(
    '/api/before-analysis',
    { image: imagePayload, model },
    signal,
  )

  return normalizeBeforeAnalysis(payload)
}

export async function getApiHealth() {
  const response = await fetch('/health', {
    signal: AbortSignal.timeout(4_000),
  })
  if (!response.ok) throw new Error('API proxy 当前不可用。')
  return response.json() as Promise<{
    status: string
    apiKeyConfigured: boolean
    outboundProxyConfigured: boolean
  }>
}

async function requestAnalysis(
  endpoint: string,
  body: unknown,
  externalSignal?: AbortSignal,
  beforeFetch?: () => void,
) {
  const timeoutSignal = AbortSignal.timeout(18_000)
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal

  try {
    beforeFetch?.()
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    })

    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      const classified = classifyAnalysisResponseError(response.status, payload?.error)
      throw new AnalysisApiError(
        payload?.message || classified.message,
        classified.code,
        response.status,
      )
    }
    return payload
  } catch (error) {
    if (error instanceof AnalysisApiError) throw error
    if (externalSignal?.aborted) {
      throw new AnalysisApiError(
        '分析已取消，图片和参数均已保留。',
        'cancelled',
        undefined,
        error,
      )
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new AnalysisApiError(
        'AI 分析超过快速等待时间，已停止本次请求；图片和参数均已保留。',
        'timeout',
        504,
        error,
      )
    }
    if (error instanceof TypeError) {
      throw new AnalysisApiError(
        '无法连接本地 API proxy，请确认服务已启动。',
        'network',
        undefined,
        error,
      )
    }
    if (error instanceof Error && error.message.includes('格式错误')) {
      throw new AnalysisApiError(error.message, 'bad-response', undefined, error)
    }
    throw new AnalysisApiError(
      error instanceof Error ? error.message : 'AI 分析失败，请稍后重试。',
      'unknown',
      undefined,
      error,
    )
  }
}

function isAbortSignal(
  value: ColorAnalysisOptions | AbortSignal | undefined,
): value is AbortSignal {
  return !!value && 'aborted' in value && 'addEventListener' in value
}
