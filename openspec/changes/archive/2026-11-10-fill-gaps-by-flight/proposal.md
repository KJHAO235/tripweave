# Proposal

## Why

搭飛機時 GPS 常斷斷續續或整段沒錄到：實測 Relive 的 `Coron_Day1_.gpx`（馬尼拉飛 Busuanga），42 分鐘的航程有 11 個 1–32 km 的缺口，時速 340–490 km/h；而沒錄到的整段航程（手機開飛航模式、或航段剛好落在兩天的檔案之間）會留下數百公里的缺口。這些缺口附近沒有鐵路，現在只能以缺口樣式留白，超過 300 km 的缺口更是連嘗試都沒有。

## What Changes

- 新增「判斷為飛機」：
  - 有時間、直線距離 ≥ 10 km 且平均時速 ≥ 350 km/h 的缺口，直接判斷為飛機（不再嘗試鐵路）
  - 鐵路補不了、時速 ≥ 150 km/h，且缺口前後的實際記錄也在高速移動（起降前後）時，判斷為飛機
  - 鐵路補不了、直線距離 ≥ 300 km 的缺口判斷為飛機（不論有沒有時間資料，例如落在兩天檔案之間的航段，或 Google 我的地圖匯出、沒有時間的 KML）
- 判斷為飛機的缺口以大圓航線補齊，推算路段的樣式與鐵路不同；圖例增加「推算（飛機）」
- 缺口列表與缺口資訊顯示補齊方式「飛機」與判斷依據（例如「依時速 460 km/h」「距離 520 km」）
- 測試資料加入 `test-data/relive-coron-2025-01-23.gpx`（使用者同意進 repo）

不在本次範圍：對應到實際機場或航班、渡輪、修改既有的鐵路判斷條件。

## Capabilities

### New Capabilities
（無）

### Modified Capabilities
- `gap-filling`：新增判斷為飛機與以大圓航線補齊；修改「推算結果的依據」以涵蓋飛機
- `track-map-view`：修改「圖例」加入推算（飛機）；新增鐵路與飛機推算路段在地圖上可區分

## Impact

- `src/core`：新增飛機判斷與大圓航線（純 TypeScript，不需下載任何資料）
- `src/core/rail/fill.ts`：補齊結果改為鐵路與飛機共用的型別
- `src/useRailFills.ts`：每個缺口先做飛機判斷，再決定是否載入鐵路網格
- `src/core/mapFeatures.ts`、`src/map/trackLayers.ts`：推算路段帶交通方式，飛機以不同樣式繪製
- `src/components/GapPanel.tsx`、`Legend.tsx`：顯示飛機補齊與依據、圖例
- 不新增函式庫或外部服務
