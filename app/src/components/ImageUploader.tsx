import { useRef, useState, type ChangeEvent } from 'react'
import { Eye, ImagePlus, Replace, Upload } from 'lucide-react'
import { createImageAsset, type ImageAsset } from '../lib/imageAsset'

interface ImageUploaderProps {
  label: string
  description: string
  image: ImageAsset | null
  onImageChange: (image: ImageAsset) => void
  onPreview?: (image: ImageAsset) => void
  compact?: boolean
}

export function ImageUploader({
  label,
  description,
  image,
  onImageChange,
  onPreview,
  compact = false,
}: ImageUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const asset = await createImageAsset(file)
      setError('')
      onImageChange(asset)
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : '图片无法读取。',
      )
    }
  }

  return (
    <section className={compact ? 'upload-panel compact' : 'upload-panel'}>
      <div className="upload-copy">
        <div>
          <h2>{label}</h2>
          <p>{description}</p>
        </div>
        {image && (
          <div className="upload-tools">
            <button
              type="button"
              className="icon-button"
              onClick={() => onPreview?.(image)}
              title="查看大图"
              aria-label={`查看${label}`}
            >
              <Eye size={17} />
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={() => inputRef.current?.click()}
              title="更换图片"
              aria-label={`更换${label}`}
            >
              <Replace size={17} />
            </button>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.heic,image/jpeg,image/png,image/webp,image/heic"
        onChange={handleFile}
      />

      {image ? (
        <button
          type="button"
          className="uploaded-image"
          onClick={() => onPreview?.(image)}
          aria-label={`查看${label}`}
        >
          <img src={image.url} alt={`${label}预览`} />
          <span className="image-meta">
            <strong>{image.file.name}</strong>
            <small>
              {image.width} x {image.height} · {formatBytes(image.file.size)}
            </small>
          </span>
        </button>
      ) : (
        <button
          type="button"
          className="upload-trigger"
          onClick={() => inputRef.current?.click()}
        >
          <span className="upload-icon">
            {compact ? <ImagePlus size={21} /> : <Upload size={22} />}
          </span>
          <strong>选择图片</strong>
          <small>JPG、PNG、WEBP · 最大 20MB</small>
        </button>
      )}

      {error && <p className="upload-error">{error}</p>}
      {image?.warnings.map((warning) => (
        <p className="upload-warning" key={warning}>
          {warning}
        </p>
      ))}
    </section>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}
