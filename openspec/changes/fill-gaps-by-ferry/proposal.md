# Proposal

## Why

搭渡輪時 GPS 多半收得到（使用者的 Coron 到 El Nido 船程 7.5 小時沒有任何缺口），但待在船艙、手機關機或沒電，以及過夜的長程渡輪（例如鹿兒島到那霸約 700 km）仍會留下缺口。這類缺口現在沒有鐵路可補；超過 300 km 的還會被當成飛機，畫出錯誤的交通方式。

## What Changes

- 新增渡輪航線資料：每月產生鐵路資料時，一併從 OpenStreetMap 抽出渡輪航線（`route=ferry`），切成與鐵路相同格式的網格，部署在 TripWeave 自己的網站（`ferry/`）
- 新增「判斷為搭乘渡輪」：鐵路補不了時，缺口兩端都在同一渡輪航線網 3 km 內、沿航線距離合理，且有時間時平均時速 5–80 km/h，就沿航線補齊
- 判斷順序改為：飛機（高速）→ 鐵路 → **渡輪** → 飛機（起降前後、≥ 300 km），讓長程渡輪不會被當成飛機
- 離航線較遠的一端（例如碼頭到航線起點）與鐵路相同，以缺口樣式顯示
- 地圖新增「推算（渡輪）」樣式與圖例；缺口列表與資訊顯示「渡輪」與航線名稱
- 測試資料加入 `test-data/relive-elnido-2025-01-26.gpx`（使用者同意進 repo），並以挖掉船程中段的方式模擬渡輪缺口

不在本次範圍：渡輪班表與公司、修改鐵路或飛機的其他判斷條件。

## Capabilities

### New Capabilities
- `ferry-data`：渡輪航線資料的來源、涵蓋範圍、每月更新與依網格取得

### Modified Capabilities
- `gap-filling`：新增判斷為渡輪與沿航線補齊；修改「判斷為搭乘飛機」的順序（渡輪優先於依距離判斷的飛機）與「推算結果的依據」
- `track-map-view`：修改「區分推算的交通方式」與「圖例」以加入渡輪

## Impact

- `scripts/rail/fetch-region.sh`、`.github/workflows/rail-data.yml`、`deploy.yml`：同一份 OSM 下載同時輸出渡輪 OPL、產生並部署 `ferry-data.tar.gz`
- `src/core/rail/`：網格、載入、最短路徑程式沿用；新增 `src/core/ferry.ts` 的判斷
- `src/useGapFills.ts`：第二個網格載入器（`ferry/`）與新的判斷順序
- `src/core/flight.ts`：依距離判斷的規則改為在渡輪之後
- 地圖圖層、圖例、缺口列表與資訊
- 不新增函式庫或外部服務；本機開發需下載 Geofabrik 的 `asia/philippines`（不進 git）
