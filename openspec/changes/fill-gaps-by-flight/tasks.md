# Tasks

## 1. 測試資料

- [x] 1.1 把 `~/Downloads/Coron_Day1_.gpx` 複製為 `test-data/relive-coron-2025-01-23.gpx`，驗證測試（`flight.test.ts`）：解析成功、`hasTime` 為 true、門檻 1 km 時有 11 個缺口，其中 10 個時速 ≥ 340 km/h

## 2. 飛機判斷與航線（src/core）

- [x] 2.1 新增 `src/core/flight.ts` 的 `greatCirclePath`，驗證測試：那霸到羽田長度與 `distanceKm` 相差 1% 內、點距不超過 50 km；東京到檀香山的路徑經度連續（相鄰點差小於 10 度）且全程經度大於 139
- [x] 2.2 實作 `recordedSpeedNear(track, ref, direction)`（往外 60 秒的平均時速），驗證測試：Coron 降落前 32 km 缺口的起點往前 ≥ 200 km/h；`Day1+2.kml`（沒有時間）回傳 undefined
- [x] 2.3 實作 `flightBySpeed` 與 `flightAfterRail`，驗證測試涵蓋規格的五個情境：Coron 的 11 個缺口全部判斷為飛機（鐵路補不了的前提下）、時速 250 km/h 且前後高速的缺口 `flightBySpeed` 回傳 null、合成的那霸→羽田隔夜缺口、沒有時間的 520 km 缺口、120 km 90 km/h 的缺口不判斷為飛機
- [x] 2.4 新增 `src/core/fill.ts` 的 `GapFill` 型別，`toOverlayFeatures` 的推算 feature 帶 `mode`，驗證既有 `mapFeatures` 測試通過，並新增飛機補齊的 feature 帶 `mode: 'flight'`、沒有缺口殘段的測試

## 3. 補齊流程

- [x] 3.1 `useRailFills` 改為 `useGapFills`：先 `flightBySpeed`，再鐵路，失敗時 `flightAfterRail`；網格下載失敗時不套用規則 3、4。驗證開發伺服器上匯入 Coron 檔案，11 個缺口都補齊為飛機；匯入 `Day1+2.kml` 的補齊數量與目前相同
- [x] 3.2 在 Chrome 匯入日本四極點 15 天，驗證補齊數量不少於目前（333/343）、沒有任何新幹線缺口被判斷為飛機（實測：仍為 333/343、沒有飛機；修正前東海道新幹線大津一帶 1.5 km、382 km/h 的跳點被判為飛機，已加上直接判斷需 ≥ 10 km 的條件）

## 4. 顯示

- [x] 4.1 `trackLayers` 依 `mode` 設定推算路段顏色與線型（飛機 `#0891b2` 長虛線），選取時同樣依 `mode`，驗證 Chrome 中 Coron 航程與鐵路推算可以一眼分辨
- [x] 4.2 圖例加入「推算（飛機）」，驗證 Chrome 中圖例顯示四種線條且不遮住軌跡
- [x] 4.3 缺口列表的標籤顯示「飛機」，缺口資訊顯示「推算為飛機」、依據（平均時速或直線距離）與推算長度，驗證 Chrome 中點選 Coron 的 21 km 缺口看到「平均時速 460 km/h」
- [x] 4.4 更新 README 的目前進度與預計功能，驗證內容與實際行為一致

## 5. iPhone 驗收

- [ ] 5.1 在 iPhone 匯入 Coron 檔案，驗證航程補齊、樣式可分辨、缺口資訊正確
- [ ] 5.2 在 iPhone 開啟日本四極點旅程，驗證鐵路補齊結果與之前相同

## Workflow follow-up

- 每完成一個任務群組自動 commit；push 與 iPhone 驗收前先詢問使用者
- 全部完成並驗收後，用 `/opsx:archive` 封存這個 change
