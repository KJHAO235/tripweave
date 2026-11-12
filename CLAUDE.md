# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 溝通規則

- 一律用繁體中文回答，程式碼註解也用繁體中文。
- 每完成一個任務群組後自動 commit 並告知使用者，然後直接繼續下一組；push、觸發 GitHub Actions 等對外動作仍需先確認。
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
- 鐵路與渡輪資料（本機）：`scripts/rail/fetch-region.sh asia/taiwan <工作資料夾>` 下載並篩選出 `*.rail.opl` 與 `*.ferry.opl`，再用 `node scripts/rail/build-tiles.ts --out public/rail <工作資料夾>/*.rail.opl`（渡輪改為 `--out public/ferry` 與 `*.ferry.opl`）產生網格；`public/rail/`、`public/ferry/` 不進 git，開發伺服器會直接讀取

## 架構

- `src/core/`：純 TypeScript 的資料模型與演算法（解析、缺口偵測等），不得引用 React 或 MapLibre；`src/core/boundary.test.ts` 會檢查這條規則。
- `src/core/rail/`：鐵路網格格式、鐵路網圖、最短路徑與沿鐵路補路判斷；渡輪航線沿用同一套網格與網圖（判斷在 `src/core/ferry.ts`），補齊方式的判斷順序在 `src/core/fill.ts`；`scripts/rail/` 也會用 Node 直接執行這裡的 `tile.ts`，所以此資料夾內的相對 import 要寫 `.ts` 副檔名。
- 鐵路與渡輪資料每月由 `.github/workflows/rail-data.yml` 從 Geofabrik 產生並存成 GitHub Release「rail-data」（`rail-data.tar.gz`、`ferry-data.tar.gz`），`deploy.yml` 部署時下載並放到 `dist/rail/`、`dist/ferry/`。地區清單在 `scripts/rail/regions.json`（依洲分組，每洲一台機器平行處理）；每個地區各自產生網格後用 `merge-tiles.ts` 合併。全球清單由 `make-regions.ts` 從 Geofabrik 索引產生，存在 `regions.global.json`。
- 機場資料 `public/airports.json` 由 `node scripts/airports/build-airports.ts <airports.csv> public/airports.json` 從 OurAirports 產生（進 git，需要時手動重產）。
- `src/map/`：MapLibre 圖層與樣式。
- `src/components/`：React 元件。
- 規劃文件在 `openspec/`，用 OpenSpec 流程管理（`/opsx:propose`、`/opsx:apply`）。

## 產品原則

- 推算出來的路段必須在畫面上和實際記錄的路段明顯區分，不能讓人誤以為是真的錄到的。
- 不修改使用者的原始軌跡點；推算結果只疊加在上面。
- 演算法要能在只有座標、沒有時間資料的情況下運作。
