export type AnalysisErrorCode =
  | 'cancelled'
  | 'network'
  | 'timeout'
  | 'invalid-image'
  | 'bad-response'
  | 'configuration'
  | 'quota'
  | 'service'
  | 'unknown'

export class AnalysisApiError extends Error {
  code: AnalysisErrorCode
  status?: number

  constructor(message: string, code: AnalysisErrorCode, status?: number, cause?: unknown) {
    super(message, { cause })
    this.name = 'AnalysisApiError'
    this.code = code
    this.status = status
  }
}

export function classifyAnalysisResponseError(status: number, serverCode?: string) {
  if (status === 400 || status === 413 || serverCode === 'BAD_REQUEST') {
    return { code: 'invalid-image' as const, message: '图片不可分析，请更换或压缩图片。' }
  }
  if (status === 401 || status === 403) {
    return { code: 'configuration' as const, message: 'Gemini API Key 无效或无权限。' }
  }
  if (status === 429) {
    return { code: 'quota' as const, message: 'Gemini API 额度不足或请求过于频繁。' }
  }
  if (status === 503 && serverCode === 'MISSING_API_KEY') {
    return { code: 'configuration' as const, message: '请先配置 Gemini API Key。' }
  }
  if (status === 504 || serverCode === 'GEMINI_TIMEOUT') {
    return { code: 'timeout' as const, message: 'Gemini API 响应超时，请稍后重试。' }
  }
  if (status >= 500) {
    return { code: 'service' as const, message: 'AI 服务暂时不可用，请稍后重试。' }
  }
  return { code: 'unknown' as const, message: 'AI 分析失败，请稍后重试。' }
}
