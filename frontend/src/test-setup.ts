import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// 1 テストごとに、表示した画面を片付ける（前のテストの画面が残らないように）
afterEach(() => {
  cleanup()
})

// jsdom（テスト用の擬似ブラウザ）には、dialog の showModal() / close() が無い。本物と同じく open 属性を付け外しするだけの代用品を置く
if (typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal !== 'function') {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open')
  }
}
