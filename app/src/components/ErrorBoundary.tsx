import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

// 与 App.tsx 的 SESSION_STORAGE_KEY 保持一致；用于「清除本地会话」逃生按钮。
const SESSION_STORAGE_KEY = 'shotai.session.v2'

const wrapStyle = {
  maxWidth: 560,
  margin: '14vh auto',
  padding: '0 24px',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  color: '#1f2421',
  textAlign: 'center' as const,
}

const detailStyle = {
  whiteSpace: 'pre-wrap' as const,
  wordBreak: 'break-word' as const,
  background: '#f4f6f5',
  borderRadius: 8,
  padding: '10px 12px',
  margin: '14px 0',
  fontSize: 12,
  color: '#9b3d3d',
  textAlign: 'left' as const,
}

const buttonStyle = {
  border: '1px solid #cbd3ce',
  background: '#fff',
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 14,
  cursor: 'pointer',
}

/**
 * 全站兜底错误边界：任何子组件在渲染时抛出未捕获异常，都会被这里接住，
 * 显示一个可恢复的错误页，而不是整页白屏。
 * 典型场景：本地缓存里残留了旧版本的数据结构，渲染时读到 undefined 字段而崩溃。
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Shotai UI 渲染崩溃：', error, info.componentStack)
  }

  private handleReload = () => {
    window.location.reload()
  }

  private handleClearSession = () => {
    try {
      window.localStorage.removeItem(SESSION_STORAGE_KEY)
    } catch {
      // localStorage 不可用时忽略
    }
    window.location.reload()
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" style={wrapStyle}>
          <h1 style={{ fontSize: 20, marginBottom: 10 }}>页面出错了</h1>
          <p style={{ color: '#5b6660', lineHeight: 1.6 }}>
            界面遇到一个意外错误，已被拦截，你的图片文件不受影响。多数情况下刷新即可恢复；
            若反复出错，可清除本地会话（不会删除你保存的预设）。
          </p>
          <pre style={detailStyle}>{this.state.error.message}</pre>
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button type="button" style={buttonStyle} onClick={this.handleReload}>
              刷新页面
            </button>
            <button
              type="button"
              style={buttonStyle}
              onClick={this.handleClearSession}
            >
              清除本地会话并刷新
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
