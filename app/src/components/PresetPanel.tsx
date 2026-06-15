import { useRef, useState, type ChangeEvent } from 'react'
import {
  Download,
  FileUp,
  Pencil,
  Save,
  Sparkles,
  Trash2,
} from 'lucide-react'
import {
  BUILT_IN_PRESETS,
  MAX_CUSTOM_PRESETS,
  type StylePreset,
} from '../lib/presets'

interface PresetPanelProps {
  customPresets: StylePreset[]
  activePresetId: string | null
  strength: number
  modified: boolean
  onApply: (preset: StylePreset) => void
  onStrengthChange: (strength: number) => void
  onSave: (name: string) => void
  onRename: (preset: StylePreset) => void
  onDelete: (preset: StylePreset) => void
  onExport: () => void
  onImport: (file: File) => void
  message: string
}

export function PresetPanel({
  customPresets,
  activePresetId,
  strength,
  modified,
  onApply,
  onStrengthChange,
  onSave,
  onRename,
  onDelete,
  onExport,
  onImport,
  message,
}: PresetPanelProps) {
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const activePreset = [...BUILT_IN_PRESETS, ...customPresets].find(
    (preset) => preset.id === activePresetId,
  )

  const savePreset = () => {
    onSave(name)
    setName('')
  }

  const importFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onImport(file)
  }

  return (
    <section className="preset-panel">
      <div className="preset-heading">
        <div>
          <span className="panel-kicker">风格预设</span>
          <h2>{activePreset ? activePreset.name : '选择调色起点'}</h2>
        </div>
        {activePreset && <span className="preset-state">{modified ? '已修改' : `${strength}%`}</span>}
      </div>

      <div className="preset-list" aria-label="内置风格预设">
        {BUILT_IN_PRESETS.map((preset) => (
          <PresetButton
            key={preset.id}
            preset={preset}
            active={preset.id === activePresetId}
            onClick={() => onApply(preset)}
          />
        ))}
      </div>

      {activePreset && (
        <label className="preset-strength">
          <span>预设强度</span>
          <input
            type="range"
            min="0"
            max="100"
            value={strength}
            onChange={(event) => onStrengthChange(Number(event.target.value))}
          />
          <output>{strength}%</output>
        </label>
      )}

      <div className="preset-save-row">
        <input
          value={name}
          maxLength={48}
          placeholder="为当前参数命名"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') savePreset()
          }}
        />
        <button
          type="button"
          className="icon-button"
          onClick={savePreset}
          title="保存当前参数"
          aria-label="保存当前参数为预设"
        >
          <Save size={16} />
        </button>
      </div>

      {!!customPresets.length && (
        <div className="custom-preset-list">
          {customPresets.map((preset) => (
            <div className="custom-preset-row" key={preset.id}>
              <button
                type="button"
                className={preset.id === activePresetId ? 'custom-preset active' : 'custom-preset'}
                onClick={() => onApply(preset)}
              >
                <Swatch preset={preset} />
                <span>{preset.name}</span>
              </button>
              <button
                type="button"
                className="mini-icon-button"
                onClick={() => onRename(preset)}
                aria-label={`重命名 ${preset.name}`}
                title="重命名"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                className="mini-icon-button danger"
                onClick={() => onDelete(preset)}
                aria-label={`删除 ${preset.name}`}
                title="删除"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="preset-tools">
        <button type="button" onClick={() => inputRef.current?.click()}>
          <FileUp size={14} />
          导入
        </button>
        <button type="button" onClick={onExport} disabled={!customPresets.length}>
          <Download size={14} />
          导出
        </button>
        <span>{customPresets.length}/{MAX_CUSTOM_PRESETS}</span>
      </div>
      <input
        ref={inputRef}
        className="visually-hidden"
        type="file"
        accept="application/json,.json"
        onChange={importFile}
      />
      {message && <p className="preset-message">{message}</p>}
    </section>
  )
}

function PresetButton({
  preset,
  active,
  onClick,
}: {
  preset: StylePreset
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={active ? 'preset-button active' : 'preset-button'}
      onClick={onClick}
    >
      <Swatch preset={preset} />
      <span>{preset.name}</span>
      {active && <Sparkles size={12} />}
    </button>
  )
}

function Swatch({ preset }: { preset: StylePreset }) {
  return (
    <span
      className="preset-swatch"
      style={{
        background: `linear-gradient(135deg, ${preset.swatch[0]} 0 50%, ${preset.swatch[1]} 50% 100%)`,
      }}
      aria-hidden="true"
    />
  )
}
