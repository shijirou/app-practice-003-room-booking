import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

/**
 * 画面の描画中に起きた予想外の例外を受け止める。受け止めないと、画面が真っ白になり、何もできなくなる。
 * （通信の失敗や入力の間違いは、ここではなく、それぞれの画面の中で文として出している。ここは「最後の砦」）
 * 例外を受け止められるのはクラスコンポーネントだけなので、ここだけクラスで書く。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 調べるための記録。利用者の画面には、内部の詳細を出さない
    console.error('画面の表示でエラーが起きました', error, info.componentStack)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="wrap">
        <section className="card">
          <h1>会議室予約表</h1>
          <div className="err" role="alert">
            画面の表示でエラーが起きました。もう一度読み込んでください。
            <button type="button" onClick={() => window.location.reload()}>
              もう一度読み込む
            </button>
          </div>
        </section>
      </div>
    )
  }
}
