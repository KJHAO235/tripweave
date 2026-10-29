import { registerSW } from 'virtual:pwa-register'

let hasUserData = false

/** 使用者已匯入軌跡時不自動重新整理，避免資料消失；改在下次開啟 App 時更新 */
export function setHasUserData(value: boolean) {
  hasUserData = value
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (!hasUserData) void updateSW(true)
  },
  onRegisteredSW(_url, registration) {
    // 從背景切回 App 時檢查是否有新版
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration?.update()
    })
  },
})
