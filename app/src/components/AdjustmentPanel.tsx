import {
  Aperture,
  Contrast,
  Droplets,
  Eye,
  Focus,
  Gauge,
  Moon,
  Palette,
  RotateCcw,
  Sparkles,
  Sun,
  SunDim,
  ThermometerSun,
} from 'lucide-react'
import {
  ADJUSTMENT_GROUPS,
  DEFAULT_ADJUSTMENTS,
  normalizeAdjustment,
  type AdjustmentGroupId,
  type AdjustmentKey,
  type AdjustmentValues,
} from '../lib/imageAdjustments'

const icons = {
  exposure: Aperture,
  brightness: Sun,
  contrast: Contrast,
  highlights: SunDim,
  shadows: Moon,
  whites: Eye,
  blacks: Eye,
  saturation: Palette,
  vibrance: Sparkles,
  temperature: ThermometerSun,
  tint: Droplets,
  clarity: Gauge,
  dehaze: Droplets,
  sharpness: Focus,
  grain: Sparkles,
  vignette: Aperture,
}

interface AdjustmentPanelProps {
  values: AdjustmentValues
  aiValues?: AdjustmentValues | null
  presetValues?: AdjustmentValues | null
  canUndo: boolean
  canRedo: boolean
  onChange: (values: AdjustmentValues) => void
  onResetOne: (key: AdjustmentKey) => void
  onResetGroup: (groupId: AdjustmentGroupId) => void
  onResetAll: () => void
  onRestoreAi: () => void
  onRestorePreset: () => void
  onUndo: () => void
  onRedo: () => void
  undoLabel?: string
  redoLabel?: string
}

export function AdjustmentPanel({
  values,
  aiValues,
  presetValues,
  canUndo,
  canRedo,
  onChange,
  onResetOne,
  onResetGroup,
  onResetAll,
  onRestoreAi,
  onRestorePreset,
  onUndo,
  onRedo,
  undoLabel,
  redoLabel,
}: AdjustmentPanelProps) {
  const updateValue = (key: AdjustmentKey, value: number) => {
    onChange({ ...values, [key]: normalizeAdjustment(value) })
  }

  return (
    <section className="adjustment-panel">
      <div className="adjustment-actions" aria-label="参数组操作">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title={canUndo && undoLabel ? `撤销：${undoLabel}` : '撤销'}
        >
          撤销
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title={canRedo && redoLabel ? `重做：${redoLabel}` : '重做'}
        >
          重做
        </button>
        <button type="button" onClick={onResetAll}>
          全部归零
        </button>
        <button type="button" onClick={onRestoreAi} disabled={!aiValues}>
          恢复调色建议
        </button>
        <button type="button" onClick={onRestorePreset} disabled={!presetValues}>
          恢复预设
        </button>
      </div>
      {(undoLabel || redoLabel) && (
        <small className="history-hint">
          {undoLabel ? `上一步：${undoLabel}` : ''}
          {undoLabel && redoLabel ? ' · ' : ''}
          {redoLabel ? `下一步：${redoLabel}` : ''}
        </small>
      )}

      <div className="adjustment-list">
        {ADJUSTMENT_GROUPS.map((group) => (
          <details className="adjustment-group" key={group.id} open>
            <summary>
              <span>{group.label}</span>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  onResetGroup(group.id)
                }}
              >
                重置本组
              </button>
            </summary>
            {group.adjustments.map(({ key, label, hint }) => {
              const Icon = icons[key]
              const isDirty = values[key] !== DEFAULT_ADJUSTMENTS[key]
              return (
                <label className="adjustment-row" key={key} title={hint}>
                  <span className="adjustment-label">
                    <Icon size={15} />
                    <span>
                      {label}
                      <small>{hint}</small>
                    </span>
                  </span>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    value={values[key]}
                    onChange={(event) => updateValue(key, Number(event.target.value))}
                  />
                  <input
                    className="adjustment-number"
                    type="number"
                    min="-100"
                    max="100"
                    value={values[key]}
                    onChange={(event) => updateValue(key, Number(event.target.value))}
                    aria-label={`${label}数值`}
                  />
                  <button
                    type="button"
                    className="mini-icon-button"
                    onClick={(event) => {
                      event.preventDefault()
                      onResetOne(key)
                    }}
                    disabled={!isDirty}
                    aria-label={`重置${label}`}
                    title={`重置${label}`}
                  >
                    <RotateCcw size={12} />
                  </button>
                </label>
              )
            })}
          </details>
        ))}
      </div>
    </section>
  )
}
