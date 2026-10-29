/// <reference types="vite-plugin-pwa/client" />

/** 建置時間，由 vite.config.ts 注入，用來確認 iPhone 上載入的是不是最新版本 */
declare const __BUILD_TIME__: string
