import { registerSW } from 'virtual:pwa-register'

let busy = false
let updateWaiting = false

/**
 * 正在讀取檔案或寫入旅程時不自動重新整理，避免中斷；結束後若有等待中的新版就更新。
 * 旅程已保存在裝置上，重新整理後會自動回到同一趟旅程
 */
export function setUpdateDeferred(value: boolean) {
  busy = value
  if (!busy && updateWaiting) void updateSW(true)
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateWaiting = true
    if (!busy) void updateSW(true)
  },
  onRegisteredSW(_url, registration) {
    // 從背景切回 App 時檢查是否有新版
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration?.update()
    })
  },
})
