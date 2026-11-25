import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

function Broken(): never {
  throw new Error('描画中の例外（テスト用）')
}

describe('ErrorBoundary', () => {
  const original = window.location
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: original })
  })

  it('例外が無いときは、中身をそのまま出す', () => {
    render(
      <ErrorBoundary>
        <p>ふつうの画面</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('ふつうの画面')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('描画中に例外が起きたら、真っ白にせず、メッセージと再読み込みのボタンを出す（内部の詳細は出さない）', async () => {
    // React は、受け止めた例外をコンソールにも出す。テストの出力が荒れないように止める（呼ばれたことは確かめる）
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { configurable: true, value: { reload } })

    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('画面の表示でエラーが起きました。もう一度読み込んでください。')
    expect(screen.queryByText(/描画中の例外/)).not.toBeInTheDocument() // 例外の中身は、利用者の画面に出さない
    expect(logged).toHaveBeenCalledWith('画面の表示でエラーが起きました', expect.any(Error), expect.any(String))

    await userEvent.click(screen.getByRole('button', { name: 'もう一度読み込む' }))
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
