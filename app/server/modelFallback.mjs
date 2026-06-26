// V3.1 模型兜底：当用户选中的 Gemini 模型被 Google 下线 / 改名 / 暂时不可用时
// （典型是 preview 模型迟早会变），后端自动改用一个稳定、长期可用的模型完成本次请求，
// 而不是直接把 404 抛给用户。
//
// 这里只放【纯函数】，不依赖 http / fetch / 环境变量，因此能被单测直接 import，
// 不会顺带启动 shotai-api.mjs 里的 server.listen()。

// 稳定、始终可用的兜底模型（已在 ALLOWED_MODELS 白名单内）。
export const FALLBACK_MODEL = 'gemini-2.5-flash'

// Gemini 在「模型 ID 不存在 / 已停用」时返回 HTTP 404，provider 错误 status 为 NOT_FOUND。
// 这种错误换个模型就能解决，区别于 401/403（鉴权）、429（限流）、5xx（服务波动）。
export function isModelUnavailable(status, providerStatus) {
  return status === 404 || providerStatus === 'NOT_FOUND'
}

// 本次请求要依次尝试的模型列表：先用用户选的，不行再退到稳定兜底模型。
// 若用户选的本就是兜底模型，则不重复尝试。
export function modelsToTry(requestedModel, fallback = FALLBACK_MODEL) {
  return requestedModel === fallback ? [requestedModel] : [requestedModel, fallback]
}
