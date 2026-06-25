import exifr from 'exifr'
import type { ImageAsset } from './imageAsset'

// V3.0 拍前：直接读取照片自带的 EXIF 属性（不走 AI）
export interface ExifInfo {
  camera?: string
  iso?: string
  focalLength?: string
  aperture?: string
  shutter?: string
  exposureComp?: string
}

const PICK = [
  'Make',
  'Model',
  'ISO',
  'FocalLength',
  'FNumber',
  'ExposureTime',
  'ExposureCompensation',
]

export async function readExif(asset: ImageAsset): Promise<ExifInfo | null> {
  try {
    const data = await exifr.parse(asset.file, { pick: PICK })
    if (!data || typeof data !== 'object') return null

    const info: ExifInfo = {}
    const make = typeof data.Make === 'string' ? data.Make.trim() : ''
    const model = typeof data.Model === 'string' ? data.Model.trim() : ''
    const camera = [make, model].filter(Boolean).join(' ').trim()
    if (camera) info.camera = camera
    if (typeof data.ISO === 'number') info.iso = `ISO ${data.ISO}`
    if (typeof data.FocalLength === 'number') {
      info.focalLength = `${Math.round(data.FocalLength)}mm`
    }
    if (typeof data.FNumber === 'number') info.aperture = `f/${data.FNumber}`
    if (typeof data.ExposureTime === 'number') {
      info.shutter = formatShutter(data.ExposureTime)
    }
    if (typeof data.ExposureCompensation === 'number') {
      const ev = Math.round(data.ExposureCompensation * 10) / 10
      info.exposureComp = `${ev > 0 ? '+' : ''}${ev}EV`
    }

    return Object.keys(info).length ? info : null
  } catch {
    return null
  }
}

function formatShutter(seconds: number): string {
  if (seconds <= 0) return ''
  if (seconds >= 1) return `${Math.round(seconds * 10) / 10}s`
  return `1/${Math.round(1 / seconds)}s`
}

export function exifEntries(info: ExifInfo): string[] {
  return [
    info.camera,
    info.iso,
    info.focalLength,
    info.aperture,
    info.shutter,
    info.exposureComp,
  ].filter((v): v is string => !!v)
}
