import { DEFAULT_ADJUSTMENTS, type AdjustmentValues } from './imageAdjustments'
import type { BeforeAnalysisResult } from './analysisContract'

// V3.0 拍前 → 拍后闭环：把拍前分析的视觉方向映射成一组拍后起始调色参数。
// 这是关键词启发式，作为「发送到拍后」的起点，用户会在拍后继续微调。
export function beforeAnalysisToAdjustments(
  result: BeforeAnalysisResult,
): AdjustmentValues {
  const vd = result.visualDimensions
  const text = [
    vd.colorTendency,
    vd.temperature,
    vd.contrast,
    vd.tone,
    vd.saturation,
    result.lighting,
  ].join(' ')
  const has = (...kw: string[]) => kw.some((k) => text.includes(k))
  const adj: AdjustmentValues = { ...DEFAULT_ADJUSTMENTS }

  if (has('冷')) adj.temperature = -15
  else if (has('暖')) adj.temperature = 15

  if (has('高对比', '高反差', '强对比', '硬光')) adj.contrast = 18
  else if (has('低对比', '低反差', '柔和', '平淡')) adj.contrast = -10

  if (has('低饱和', '淡', '去饱和')) adj.saturation = -14
  else if (has('高饱和', '浓郁', '鲜艳', '艳丽')) adj.saturation = 14

  if (has('通透', '明亮', '高调', '空气感')) {
    adj.exposure = 6
    adj.vibrance = 8
  } else if (has('暗调', '低调', '深沉', '压暗')) {
    adj.exposure = -8
    adj.contrast = Math.max(adj.contrast, 8)
  }

  return adj
}
