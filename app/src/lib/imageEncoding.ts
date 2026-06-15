import type { ImageAsset } from './imageAsset'

export interface EncodedImagePayload {
  mediaType: 'image/jpeg'
  data: string
}

const MAX_ANALYSIS_EDGE = 1280
const ANALYSIS_QUALITY = 0.82

export async function encodeImageForAnalysis(
  image: ImageAsset,
): Promise<EncodedImagePayload> {
  const source = await loadImage(image.url)
  const scale = Math.min(
    1,
    MAX_ANALYSIS_EDGE / Math.max(source.naturalWidth, source.naturalHeight),
  )
  const width = Math.max(1, Math.round(source.naturalWidth * scale))
  const height = Math.max(1, Math.round(source.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('浏览器无法创建图片分析画布。')
  }

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.drawImage(source, 0, 0, width, height)

  const dataUrl = canvas.toDataURL('image/jpeg', ANALYSIS_QUALITY)
  return {
    mediaType: 'image/jpeg',
    data: dataUrl.replace(/^data:image\/jpeg;base64,/, ''),
  }
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片读取失败，请重新上传。'))
    image.src = url
  })
}
