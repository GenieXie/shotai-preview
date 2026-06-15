import type { ImageAsset } from './imageAsset'
import {
  normalizeBeforeAnalysis,
  normalizeColorAnalysis,
} from './analysisContract'
import type {
  BeforeAnalysisResult,
  ColorAnalysisResult,
} from './analysisContract'
import { encodeImageForAnalysis } from './imageEncoding'

export async function analyzeColorMatch(
  targetImage: ImageAsset,
  userImage: ImageAsset,
  signal?: AbortSignal,
): Promise<ColorAnalysisResult> {
  const [targetPayload, userPayload] = await Promise.all([
    encodeImageForAnalysis(targetImage),
    encodeImageForAnalysis(userImage),
  ])

  const payload = await requestAnalysis(
    '/api/color-analysis',
    {
      targetImage: targetPayload,
      userImage: userPayload,
    },
    signal,
  )

  return normalizeColorAnalysis(payload)
}

export async function analyzeBeforeShoot(
  image: ImageAsset,
  signal?: AbortSignal,
): Promise<BeforeAnalysisResult> {
  const imagePayload = await encodeImageForAnalysis(image)
  const payload = await requestAnalysis('/api/before-analysis', { image: imagePayload }, signal)

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
) {
  const timeoutSignal = AbortSignal.timeout(35_000)
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutSignal])
    : timeoutSignal

  try {
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
      throw new Error(
        payload?.message || classifyResponseError(response.status),
      )
    }
    return payload
  } catch (error) {
    if (externalSignal?.aborted) {
      throw new Error('分析已取消，图片和参数均已保留。', { cause: error })
    }
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new Error('AI 分析等待超时，请稍后重试；图片和参数均已保留。', {
        cause: error,
      })
    }
    if (error instanceof TypeError) {
      throw new Error('无法连接本地 API proxy，请确认服务已启动。', {
        cause: error,
      })
    }
    throw error
  }
}

function classifyResponseError(status: number) {
  if (status === 401 || status === 403) return 'Gemini API Key 无效或无权限。'
  if (status === 429) return 'Gemini API 额度不足或请求过于频繁。'
  if (status === 503) return 'Gemini 服务暂时繁忙，请稍后重试。'
  if (status === 504) return 'Gemini API 响应超时，请稍后重试。'
  return 'AI 分析失败，请稍后重试。'
}
