# Design

## Context

動機見 proposal.md；行為要求見 `specs/gap-filling`、`specs/rail-data`、`specs/track-map-view`。

現況：`src/core` 已有軌跡模型、`detectGaps`、`toMapFeatures`（把軌跡在缺口處切成實線與缺口線）；App 匯入後同步計算缺口並畫出兩個圖層。網站由 GitHub Actions 在每次 push 時建置並部署到 GitHub Pages（公開 repo，Actions 不限時數）。

規劃前的實測（以 `Day1+2.kml` 與 OSM 資料）：

- 苫小牧到札幌：起點離鐵路 82 m，終點離鐵路 1.24 km（下車後才恢復 GPS）；在鐵路網上找最短路徑可得 70.4 km，依序經過室蘭本線、千歲線、函館本線，與實際里程相符
- 只用主線（排除 `service=*`）時鐵路網在車站附近斷開；必須保留側線、渡線等軌道，只是提高其成本
- 查詢範圍只比缺口稍大時會漏掉繞路的路段（千歲線偏離直線約 10 km）
- 青函隧道在 OSM 中為「海峡線・北海道新幹線」，`tunnel=yes`
- Overpass 公共服務單次查詢 30 到 53 秒，且不適合大量使用者
- Geofabrik 資料檔：日本 2.56 GB、台灣 0.33 GB、亞洲 16.4 GB、歐洲 35.3 GB；共 554 個地區

使用者的核心訴求：直覺、方便、快速，不要按鈕與選擇。

## Goals / Non-Goals

**Goals:**
- 匯入後自動補齊，第一次補齊苫小牧到札幌在 iPhone 上 5 秒內完成
- 補路演算法放在 `src/core`，與資料來源、地圖無關，可在 Node 測試
- 鐵路資料格式與網格從一開始就適用全球，擴充地區只改設定
- 補不了的就不補，推算一律標示依據

**Non-Goals:**
- 其他交通方式（飛機、渡輪、道路、潛水）
- 使用者手動修正或選擇推算路線
- 完整離線：未下載過的網格在離線時無法補齊

## Decisions

### 1. 資料管線：Geofabrik + osmium，每月產生，存成 GitHub Release

```
 每月排程（.github/workflows/rail-data.yml）
   對地區清單中的每個地區：
     下載 Geofabrik 的 <地區>-latest.osm.pbf
     osmium tags-filter  只留鐵路 way
     osmium add-locations-to-ways + 輸出 OPL（保留節點 id 與座標）
     刪除 pbf（控制硬碟用量）
   scripts/rail/build-tiles.ts
     依節點 id 找出路口，在路口把 way 切成「邊」
     精簡座標（Douglas–Peucker，容許 5 m）、切成網格
   打包成 rail-data.tar.gz，上傳到 GitHub Release「rail-data」（取代舊檔）
   觸發網站部署
 
 每次部署（既有 deploy.yml）
   下載 Release 上最新的 rail-data.tar.gz，解壓到 dist/rail/ 後一起部署
```

- **為什麼不用 Overpass**：速度 30 到 60 秒，且大量使用者會違反公共服務的使用規範；管線也不用 Overpass，只從 Geofabrik 下載檔案。
- **為什麼用 Release 而不是 commit 進 repo**：每月幾十到上百 MB 的資料若 commit，git 歷史會快速膨脹；Release 檔可以直接取代。
- **為什麼部署時才合併**：GitHub Pages 每次部署會替換整個網站，所以一般的程式部署也必須帶上鐵路資料。
- **失敗保護**：產生失敗時不上傳，Release 保持上一版，部署仍用上一版（對應 rail-data「產生失敗」情境）。
- **地區清單**：`scripts/rail/regions.json`，先放 `asia/japan`、`asia/taiwan`。
- **替代方案 Overture Maps**：可遠端只讀鐵路、有整理好的連接點；但多一層資料轉換與依賴，且 Geofabrik + osmium 對全球已足夠，列為全球擴充失敗時的備案。
- **需要的工具**：osmium-tool（開源、免費）。Actions 上用 apt 安裝；本機產生測試資料時用 Homebrew 安裝。

### 2. 保留哪些鐵路

`railway` 為 `rail`、`subway`、`light_rail`、`narrow_gauge`、`monorail` 的 way；排除 `abandoned`、`disused`、`construction`、`razed`、`tram`（路面電車與道路共用，容易誤判）、`funicular`。

每條邊保留：`service`（決定成本）、`name`（只存名稱表的索引）、是否 `tunnel`。

### 3. 網格格式

- 網格大小 0.25° × 0.25°（約 25 km），路徑 `rail/v1/<lat>/<lon>.json`，`<lat>`、`<lon>` 為網格西南角座標乘以 4 的整數。
- 一條邊跨越多個網格時，每個網格都放一份；App 以邊的 id 去重。
- 座標以 1e-5 度（約 1 m）整數化並做差分編碼，減少檔案大小。
- `rail/v1/index.json` 列出有資料的網格與資料產生日期；App 先讀 index，網格不在清單內就視為「未涵蓋」，不發出請求。

```
 cell: { names: string[], edges: [ { id, a, b, s, n, t, c } ] }
   id: 邊的唯一 id（way id + 切段序號）
   a,b: 兩端節點 id（路口相接靠這個，不靠座標比對）
   s: service 類別（0 主線、1 側線/渡線、2 車廠/支線）
   n: 名稱索引；t: 是否隧道；c: 差分編碼的座標
```

### 4. 補路判斷（`src/core/rail/`）

```
 對每個缺口：
   1. 需要的網格 = 缺口兩端外接矩形，向外擴 max(5 km, 直線距離的 30%)
   2. 兩端各自「貼到」最近的鐵路邊（投影到線段上，不只看節點）
        貼合距離 <= 300 m 視為「在鐵路上」
   3. 搭乘證據：某一端在鐵路上，且該端往外 2 km 內的實際記錄點
        有 70% 以上離鐵路 80 m 以內
   4. 另一端：在鐵路上，或離鐵路 3 km 以內（下車後步行的情況）
   5. 最短路徑（Dijkstra）：成本 = 長度 × 係數（主線 1、側線 3、車廠 10）
   6. 沿鐵路長度 <= 兩個貼合點直線距離的 2.5 倍
   7. 有時間資料時，平均速度需在 10 到 400 km/h 之間
   通過 -> 推算路段（含路線名稱、長度）；不在鐵路上的那一端，貼合點到端點維持缺口
   不通過 -> 不補，維持缺口
```

門檻（300 m、80 m、70%、3 km、2.5 倍）集中為常數，之後依實測調整。這些數值的依據是苫小牧到札幌的實測（82 m、1.24 km、1.40 倍）與 GPS 一般誤差。

替代方案「依時間判斷交通方式」：使用者的資料常沒有時間，所以座標證據是主要依據，時間只用來排除不合理的情況。

### 5. 資料模型與地圖

```
 Fill {
   gapId, mode: 'rail',
   path: [lon, lat][],         沿鐵路的推算路段
   lengthKm, routeNames: string[],
   remainders: [from, to][]    未補到的部分（以缺口樣式顯示）
 }
```

`toMapFeatures(track, gaps, fills)` 新增 `inferred` 圖層資料；已補齊的缺口不再畫成缺口線，只畫 `remainders`。原始軌跡點不變。

樣式：
- 實際記錄：藍色實線（不變）
- 推算：紫色圓點線（`#7c3aed`），與兩者明顯不同
- 缺口：橘色虛線（不變）

圖例固定在地圖左下角，不需要操作；底部附「鐵路資料 © OpenStreetMap 貢獻者」。

### 6. 背景執行與畫面更新

- 匯入後照常同步顯示軌跡與缺口，接著依缺口距離由大到小逐一補齊；每完成一個就更新 `fills`，地圖與列表立即反映。
- 網格下載同時最多 4 個；同一網格只下載一次（記憶體快取）。
- 補齊中在工具列顯示「沿鐵路補齊中 12/68」，完成後消失。
- 門檻改變時，只對新出現的缺口補齊，已完成的結果保留。
- 匯入新檔案時取消尚未完成的補齊。

### 7. 裝置上的快取

Service worker 對 `rail/` 使用 CacheFirst，最多保留 30 天；`index.json` 用 NetworkFirst，確保拿到最新的資料日期。網格路徑含 `v1`，格式改變時換版本號即可避免舊快取。

### 8. 測試策略

- 本機用 osmium 處理日本與台灣，產生網格；把 `Day1+2.kml` 缺口附近需要的網格與台北車站一帶的網格複製到 `test-data/rail/` 作為測試資料
- 單元測試：差分編碼、切邊、網格分配、貼合、Dijkstra、搭乘證據、補路判斷（spec 中的苫小牧到札幌、青函隧道、新幹線隧道、附近沒有鐵路、繞路太遠）
- 整合測試：用 `Day1+2.kml` + 測試網格跑完整補路，檢查原始資料不變
- 瀏覽器：用 Chrome 驗證自動補齊、圖例、網路請求只發往自己的網站；iPhone 驗證速度

## Risks / Trade-offs

- [OSM 資料錯誤或路口沒有接上] → 找不到路徑時不補，維持缺口；不會畫出錯誤路線
- [平行的鐵路與道路（開車時誤判為搭火車）] → 需要缺口外 2 km 的記錄點有 70% 貼著鐵路；仍可能誤判，但推算樣式與依據會讓人看得出來
- [全球資料量超出 GitHub Pages 1 GB 或 Actions 單次 6 小時上限] → 分洲平行處理；若仍超出，暫停並與使用者討論（例如只保留主線、放大精簡容許值、改用 Cloudflare R2 免費額度）
- [Geofabrik 下載量] → 每月一次、每個地區一個檔案，屬於正常使用；User-Agent 標示專案網址
- [首次補齊需要下載網格] → 只下載缺口附近；之後由 service worker 快取
- [跨網格的大缺口（例如 300 km）需要很多網格] → 擴張範圍有上限：直線距離超過 300 km 的缺口本次不補（多半是飛機）

## Migration Plan

1. 先合併程式與管線，Release 尚無資料時部署照常進行（沒有 `rail/` 則所有缺口都不補，App 行為與現在相同）
2. 手動觸發一次資料產生，確認 Release 與網站上的 `rail/v1/index.json`
3. iPhone 驗收
4. 全球擴充：地區清單改為全球後再觸發一次

回滾：revert 程式即可；鐵路資料在 Release 中，不影響其他部分。

## Open Questions

- 推算路段的顏色與圖例文字，iPhone 實際看過後可再微調，不影響架構
