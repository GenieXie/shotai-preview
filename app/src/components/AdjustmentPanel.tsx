import {
  Contrast,
  Moon,
  Palette,
  Sun,
  SunDim,
  ThermometerSun,
} from 'lucide-react'
import {
  ADJUSTMENT_CONFIG,
  type AdjustmentKey,
  type AdjustmentValues,
} from '../lib/imageAdjustments'

const icons = {
  brightness: Sun,
  contrast: Contrast,
  saturation: Palette,
  temperature: ThermometerSun,
  shadows: Moon,
  highlights: SunDim,
}

interface AdjustmentPanelProps {
  values: AdjustmentValues
  onChange: (values: AdjustmentValues) => void
}

export function AdjustmentPanel({ values, onChange }: AdjustmentPanelProps) {
  const updateValue = (key: AdjustmentKey, value: number) => {
    onChange({ ...values, [key]: value })
  }

  return (
    <div className="adjustment-list">
      {ADJUSTMENT_CONFIG.map(({ key, label }) => {
        const Icon = icons[key]
        return (
          <label className="adjustment-row" key={key}>
            <span className="adjustment-label">
              <Icon size={16} />
              {label}
            </span>
            <input
              type="range"
              min="-100"
              max="100"
              value={values[key]}
              onChange={(event) => updateValue(key, Number(event.target.value))}
            />
            <output>{formatValue(values[key])}</output>
          </label>
        )
      })}
    </div>
  )
}

function formatValue(value: number) {
  if (value > 0) return `+${value}`
  return String(value)
}
