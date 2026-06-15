export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const MAX_IMAGE_FILE_SIZE = 20 * 1024 * 1024
export const RECOMMENDED_IMAGE_FILE_SIZE = 10 * 1024 * 1024
export const MAX_IMAGE_PIXELS = 40_000_000

export interface ImageAsset {
  file: File
  url: string
  width: number
  height: number
  warnings: string[]
}

export async function createImageAsset(file: File): Promise<ImageAsset> {
  if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic')) {
    throw new Error('当前版本暂不支持 HEIC，请先转换为 JPG、PNG 或 WEBP。')
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('不支持该文件格式，请上传 JPG、PNG 或 WEBP。')
  }
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    throw new Error('图片超过 20MB，请压缩后重新上传。')
  }

  const url = URL.createObjectURL(file)
  return new Promise((resolve, reject) => {
    const probe = new Image()
    probe.onload = () => {
      const pixels = probe.naturalWidth * probe.naturalHeight
      if (pixels > MAX_IMAGE_PIXELS) {
        URL.revokeObjectURL(url)
        reject(
          new Error(
            `图片像素面积过大（${formatMegapixels(pixels)}MP），上限为 40MP。`,
          ),
        )
        return
      }
      resolve({
        file,
        url,
        width: probe.naturalWidth,
        height: probe.naturalHeight,
        warnings: getImageWarnings(file, probe.naturalWidth, probe.naturalHeight),
      })
    }
    probe.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片无法读取，请尝试其他文件。'))
    }
    probe.src = url
  })
}

export function getImageWarnings(file: File, width: number, height: number) {
  const warnings: string[] = []
  const longEdge = Math.max(width, height)
  const shortEdge = Math.max(1, Math.min(width, height))

  if (file.size > RECOMMENDED_IMAGE_FILE_SIZE) {
    warnings.push('图片超过 10MB，AI 分析时会先生成压缩副本。')
  }
  if (longEdge / shortEdge > 4) {
    warnings.push('检测到超长图或全景图，AI 风格分析的可信度可能较低。')
  }
  if (longEdge < 800) {
    warnings.push('图片分辨率较低，AI 建议和导出细节可能受限。')
  }
  if (file.type === 'image/png') {
    warnings.push('PNG 导出 JPG 时透明区域会填充白色；广色域图片可能存在色差。')
  }
  return warnings
}

function formatMegapixels(pixels: number) {
  return (pixels / 1_000_000).toFixed(1)
}
