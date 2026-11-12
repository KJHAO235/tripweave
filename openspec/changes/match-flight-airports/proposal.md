# Proposal

## Why

飛機推算線目前直接從缺口兩端畫大圓線：端點若在機場附近（例如航廈或停機坪外幾公里處才恢復或失去訊號），線就停在端點而不是機場；缺口資訊也只寫「推算為飛機」，看不出是哪裡飛到哪裡（例如 Coron 降落前的缺口終點就在 Busuanga 機場上，卻沒有顯示機場）。另外，沒有時間資料、100–300 km 的短程航班（例如 Google 我的地圖匯出的 KML）因為距離不到 300 km，現在只能留白。

## What Changes

- 新增機場資料：以腳本從 OurAirports（公有領域）產生 `public/airports.json`，只收有定期航班、有 IATA 代碼的機場（約 4,000 個、壓縮後約 84 KB），放進 git；App 需要時才從 TripWeave 自己的網站下載
- 飛機缺口的端點在機場 10 km 內時，航線從該機場畫起（或畫到該機場），端點到機場的一小段併入推算路段；超過 10 km（航程中途斷訊、離家很遠才開始記錄）照原本從端點畫
- 缺口資訊顯示航段，例如「Manila (MNL) → Coron (USU)」；只對到一端時只顯示那一端
- 新增判斷：沒有時間資料、直線 100–300 km、兩端都在機場 10 km 內，且鐵路與渡輪都補不了的缺口，判斷為飛機
- 機場資料取得失敗時，飛機照原本方式補齊

不在本次範圍：航班號碼與航空公司、猜測離機場很遠的端點是從哪個機場出發、每月自動更新機場資料。

## Capabilities

### New Capabilities
- `airport-data`：機場資料的來源、篩選條件、產生方式與取得方式

### Modified Capabilities
- `gap-filling`：修改「判斷為搭乘飛機」（新增兩端都在機場的中距離規則）、「以大圓航線補齊飛機缺口」（對到機場）、「推算結果的依據」（顯示航段）

## Impact

- 新增 `scripts/airports/build-airports.ts` 與 `public/airports.json`
- `src/core/airports.ts`：找最近的機場、格式化顯示名稱（純 TypeScript）
- `src/core/flight.ts`、`src/core/fill.ts`：對到機場的航線、新判斷規則；`decideFill` 多一個取得機場資料的函式
- `src/useGapFills.ts`：機場資料的載入（只載一次）
- `src/components/GapPanel.tsx`：顯示航段
- 不新增函式庫；OurAirports 只在開發時用來產生資料檔
