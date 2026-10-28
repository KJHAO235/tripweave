# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 溝通規則

- 一律用繁體中文回答，程式碼註解也用繁體中文。
- 每完成一個段落的修改後，提醒使用者 commit。
- 做大功能之前，先提出計畫讓使用者確認，不要直接動工。

## 技術選擇

- 已確定：PWA（iPhone Safari）、Vite + React + TypeScript、MapLibre GL JS + OpenFreeMap、GitHub Pages。
- 新增其他函式庫或外部服務之前，先與使用者確認。
- 不使用需要付費或綁信用卡的服務。

## 指令

- `npm run dev`：開發伺服器
- `npm test`：執行全部測試（Vitest）
- `npx vitest run <檔案路徑>`：只跑單一測試檔
- `npm run build`：型別檢查並建置

## 架構

- `src/core/`：純 TypeScript 的資料模型與演算法（解析、缺口偵測等），不得引用 React 或 MapLibre；`src/core/boundary.test.ts` 會檢查這條規則。
- `src/map/`：MapLibre 圖層與樣式。
- `src/components/`：React 元件。
- 規劃文件在 `openspec/`，用 OpenSpec 流程管理（`/opsx:propose`、`/opsx:apply`）。

## 產品原則

- 推算出來的路段必須在畫面上和實際記錄的路段明顯區分，不能讓人誤以為是真的錄到的。
- 不修改使用者的原始軌跡點；推算結果只疊加在上面。
- 演算法要能在只有座標、沒有時間資料的情況下運作。
