# Design

## Context

- 鐵路資料管線：`fetch-region.sh` 下載 Geofabrik 地區 → `osmium tags-filter` 只留鐵路 → `add-locations-to-ways` 輸出 OPL → `build-tiles.ts` 切成 0.25° 網格（`v1/<lat>/<lon>.json` 與 `v1/index.json`）→ 各洲 `merge-tiles.ts` 合併 → Release `rail-data` 的 `rail-data.tar.gz` → `deploy.yml` 解到 `dist/rail/`。
- App：`RailTileLoader(fetchJson)` 依缺口範圍載入網格、`RailGraph` 建圖、`shortestRailRoute` 找路、`snapCandidates` 貼合；`fillGapAlongRail` 另外要求「搭乘證據」（端點前後的記錄貼著鐵路）。
- `useGapFills`：`flightBySpeed` → 鐵路 → `flightAfterRail`。
- 參考 proposal 的動機；需求見 specs。

## Goals / Non-Goals

**Goals:**
- 渡輪的網格格式、載入、建圖、最短路徑全部沿用 `src/core/rail/` 的程式，只換資料來源與判斷條件
- 同一份 Geofabrik 下載同時產生鐵路與渡輪，不增加下載量
- 渡輪資料缺少時（第一次部署前、產生失敗）App 完全照舊

**Non-Goals:**
- 重新命名 `rail` 模組為通用的「路線網」（之後若加入公路再考慮）
- 渡輪的搭乘證據（船上記錄貼著航線）：航線在海上本來就沒有其他交通方式會重疊

## Decisions

### 1. 資料：獨立的 `ferry/` 資料集，與鐵路同一次排程

`fetch-region.sh` 在刪除 PBF 之前多跑一次 `osmium tags-filter w/route=ferry`，輸出 `<name>.ferry.opl`；workflow 對它同樣跑 `build-tiles.ts`（輸出到 `ferry-tiles/<name>`）與 `merge-tiles.ts`，最後產生 `ferry-data.tar.gz` 上傳到同一個 Release。`deploy.yml` 若下載得到就解到 `dist/ferry/`，下載不到不影響部署。

替代方案：把渡輪放進鐵路網格（加一個種類欄位）。缺點是要改網格格式版本、全部鐵路資料重產，且鐵路判斷要排除渡輪邊；獨立資料集較單純。

`route=ferry` 的 way 沒有 `railway` 的 service／tunnel 標籤，`opl.ts` 解析時視為主線、非隧道；名稱取 `name`。

### 2. App 端：第二個載入器與獨立的渡輪網

`useGapFills` 新增 `ferryLoader = new RailTileLoader(fetchFerryJson)`（`fetchFerryJson` 指向 `${BASE_URL}ferry/`），以及獨立的 `RailGraph`（同樣有網格數上限）。鐵路與渡輪的網不混在一起，避免鐵路最短路徑走到渡輪上。

### 3. 判斷：`src/core/ferry.ts`

`fillGapAlongFerry(graph, gap)`：
1. 兩端各以 `snapCandidates` 找 3 km 內的航線；任一端找不到就放棄
2. 兩端都貼到同一個相連航線網（以起點的 `connectedEdges` 限定終點候選）
3. 對兩端候選組合找最短路徑，取最短；長度 > 直線 × 2.5 放棄
4. 有時間時，沿航線時速不在 5–80 km/h 放棄
5. 與鐵路相同處理殘段：離航線 > 0.3 km 的一端以缺口線連到貼合點

結果型別 `FerryFill { mode: 'ferry', path, lengthKm, routeNames, remainders }`，加入 `GapFill` 聯集。

### 4. 判斷順序與網格範圍

`flightBySpeed` → 鐵路 → **渡輪** → `flightAfterRail`。渡輪網格範圍：缺口外接矩形加 `max(5 km, 距離 × 10%)` 緩衝，距離上限 1,500 km（鐵路用 30% 緩衝、300 km 上限；渡輪航線較直、跨海距離較長）。渡輪網格下載失敗時同鐵路，不往下判斷飛機。

### 5. 測試資料

- `test-data/relive-elnido-2025-01-26.gpx`：使用者的 Coron → El Nido 船程原始檔
- 本機下載 `asia/philippines`，用既有腳本產生渡輪網格，只挑 Coron–El Nido 一帶需要的網格放進 `test-data/ferry/v1/`（與 `test-data/rail/` 相同做法），讓單元測試不依賴網路
- 測試時以程式挖掉船程中段約 40 km 的點形成缺口
- 鹿兒島—那霸長程渡輪以手寫的合成航線網測試，不另外下載日本資料

### 6. 地圖樣式

渡輪：綠色（`#059669`）短長交錯虛線，與鐵路紫色圓點線、飛機青色長虛線、缺口橘色短虛線、實線藍色都不同。圖例插在鐵路與飛機之間。

## Risks / Trade-offs

- [OSM 航線與實際船跡差距] 快船常走得比 OSM 線更直 → 貼合用 3 km 容忍度，推算本來就以不同樣式標示。
- [沿岸開車被誤判為渡輪] 兩個港口間開車而 GPS 全斷、剛好有渡輪連接 → 機率低，樣式與依據清楚標示為推算。
- [長程渡輪需要的網格較多] 700 km 缺口的範圍內可能有數百個網格，但只有航線經過的網格存在，實際下載量小；載入器只保留最近 64 個。
- [第一次部署前沒有渡輪資料] 需要手動觸發「產生鐵路資料」才會有 → push 後詢問使用者。

## Migration Plan

1. 先部署 App（渡輪資料不存在時不影響）
2. 手動觸發「產生鐵路資料」，完成後自動觸發部署，`dist/ferry/` 出現
3. 回滾：刪除 Release 中的 `ferry-data.tar.gz` 並重新部署即可停用渡輪補齊
