# Design

## Context

專案目前只有 README、CLAUDE.md 與 OpenSpec 設定，沒有任何程式碼，git 也還沒設定 GitHub remote。動機見 proposal.md；行為要求見 `specs/track-import`、`specs/gap-detection`、`specs/track-map-view`。

已和使用者確認的限制：

- 不付費（包含 Apple 開發者年費），主要在 iPhone Safari 使用
- 要能在手機的雲端工作階段（Linux 環境）繼續開發與測試
- 技術選型：Vite + React + TypeScript、MapLibre GL JS + OpenFreeMap 圖磚、GitHub Pages（公開 repo）
- 測試資料 `Day1+2.kml` 放進 repo（使用者已知會公開）

測試資料的特性（實測）：46,878 點、2 段、沒有逐點時間；點距中位數 21 m、P99 89 m，超過 1 km 的間距有 68 處。

## Goals / Non-Goals

**Goals:**
- 把「解析」與「缺口偵測」做成不依賴 React、地圖、瀏覽器 UI 的純 TypeScript 模組，之後的補路、動畫都重用同一份資料模型
- 核心邏輯能在 Node 環境（雲端工作階段）用自動化測試驗證，不需要 iPhone
- 一推上 GitHub 就自動部署，iPhone 開網址即可測試

**Non-Goals:**
- 離線使用（service worker 只用於可安裝，不保證離線可用）
- 保存匯入紀錄（重新整理後資料消失可以接受）
- 多語系、深色模式、App 圖示設計

## Decisions

### 1. 分層：core 與 UI 分開

```
 src/
 +-- core/            純 TypeScript，不 import React 或 MapLibre
 |   +-- track.ts       資料模型 Track / Segment / TrackPoint
 |   +-- parse/         KML、GPX 解析 -> Track
 |   +-- geo.ts         haversine 距離等幾何函式
 |   +-- gaps.ts        缺口偵測 Track -> Gap[]
 +-- map/             MapLibre 圖層與樣式
 +-- components/      React 元件（匯入按鈕、缺口列表、門檻調整、資訊面板）
 +-- App.tsx
 test-data/Day1+2.kml
```

理由：後續的鐵路補路、照片定位、動畫都只依賴 core 的資料模型。替代方案是把邏輯寫在 React 元件裡，較快但無法在 Node 測試，也難以重用。

### 2. 資料模型

```
 Track    { segments: Segment[], hasTime: boolean, name?: string }
 Segment  { points: TrackPoint[] }
 TrackPoint { lat, lon, ele?, time? }   // time 為 epoch 毫秒
 Gap      { from: PointRef, to: PointRef, distanceKm,
            durationSec?, speedKmh?, isSegmentBoundary: boolean }
 PointRef { segment: number, index: number, lat, lon }
```

`hasTime` 只有在所有點都有時間時才為 true，避免部分有時間造成速度計算錯誤。原始點只讀不改（對應 spec「不修改原始軌跡」）。

### 3. 解析：使用 @tmcw/togeojson

KML/GPX 轉成 GeoJSON 後再轉成內部 Track：取 LineString / MultiLineString（含 gx:Track、GPX trkseg）作為段落，捨棄 Point。時間從 togeojson 的 `coordinateProperties.times` 取得。

替代方案是自己用 DOMParser 解析：程式碼可控，但 gx:Track、namespace、GPX rte 等細節都要自己處理。togeojson 是 Mapbox 社群長期維護的小型函式庫，涵蓋這些情況。

瀏覽器用內建 DOMParser；測試在 Node 用 `@xmldom/xmldom` 提供 DOMParser，所以 core 的解析函式接受「已解析的 XML Document」或注入 DOMParser，而不是直接呼叫 `window`。

### 4. 缺口偵測

把所有段落依檔案順序串接成相鄰點序列（段落交界也算一組相鄰點，標記 `isSegmentBoundary`），逐對計算 haversine 距離，超過門檻即為缺口。O(n)，4.7 萬點在 iPhone 上為毫秒級。有時間資料時才計算 `durationSec` 與 `speedKmh`。

預設門檻 1 km：依實測，正常點距 99% 在 89 m 內，1 km 可以明確區分「資料缺漏」與「正常取樣」。門檻調整後重新計算（成本低，不需快取）。

### 5. 地圖呈現：實際路段在缺口處切開

如果直接把原始 LineString 畫成實線，缺口的直線會被實線畫出來，違反 spec「缺口不得與實際記錄路段看起來相同」。做法是依缺口把每個段落切成多條線：

```
 原始段落:  A--B--C------------D--E      (C->D 是缺口)
 實線圖層:  A--B--C            D--E      MultiLineString
 缺口圖層:         C - - - - - D         虛線 + 另一種顏色
```

兩個 MapLibre GeoJSON source / layer：`recorded`（實線、主色）與 `gaps`（`line-dasharray` 虛線、警示色、較寬的點擊範圍）。門檻改變時重新產生兩份 GeoJSON 並 `setData`。

大量點的效能交給 MapLibre 內建的 geojson-vt 切片與簡化，不另外做抽稀。

### 6. 地圖樣式：OpenFreeMap Positron

淺灰極簡樣式，讓軌跡與缺口最醒目。樣式網址集中在一個設定常數，之後要換 MapTiler 或其他來源只改一處。

### 7. iPhone 檔案選取

`<input type="file">` 不設定 `accept`。iOS 對 `.kml`、`.gpx` 沒有內建 MIME 類型，設定 accept 可能讓檔案在選擇器裡變成灰色無法點選。改為選取後依副檔名與內容判斷格式，不支援時顯示錯誤（對應 spec 錯誤訊息要求）。

### 8. PWA 與部署

- `vite-plugin-pwa` 產生 manifest（`display: standalone`）與 service worker（`autoUpdate`，避免舊版本卡在快取）
- GitHub Actions：push 到 `main` 時執行測試、建置並部署到 GitHub Pages
- Vite `base` 設為 `/tripweave/`（GitHub Pages 子路徑，需與 repo 名稱一致）

### 9. 測試策略

- Vitest 單元測試：KML/GPX 解析、缺口偵測，用 `test-data/Day1+2.kml` 驗證 spec 中的數字（段落數、點數、5 個主要缺口、段落交界不是缺口）
- GPX、gx:Track、錯誤情況用小型手寫測試檔
- 地圖與 iPhone 行為（檔案選取、加入主畫面、流暢度）以手動驗收為主

## Risks / Trade-offs

- [iOS 檔案選擇器把 .kml/.gpx 顯示為灰色] → 不設定 accept；若仍有問題，再加上 `application/vnd.google-earth.kml+xml`、`application/gpx+xml` 等 MIME 測試
- [OpenFreeMap 為社群服務，沒有服務保證] → 樣式網址集中設定，可快速換成 MapTiler 等來源
- [公開 repo 會公開測試資料中的旅程] → 使用者已確認接受
- [togeojson 不支援某些 App 的特殊格式] → 以 core 的資料模型為邊界，必要時針對該格式補寫解析器，不影響其他部分
- [service worker 快取導致 iPhone 看到舊版] → 使用 autoUpdate；開發期間在畫面上顯示版本號（build 時間）方便確認
- [大型檔案解析阻塞畫面] → 4.7 萬點實測可接受；若之後遇到更大的檔案，再把解析移到 Web Worker

## Migration Plan

全新專案，沒有既有資料或使用者。部署步驟：

1. 建立公開 GitHub repo 並設定為 remote（需使用者確認後才建立與 push）
2. 在 repo 設定中把 Pages 來源設為 GitHub Actions
3. push 到 main 觸發部署，用 iPhone 開啟網址驗收

回滾：revert 有問題的 commit 後 push，Actions 會重新部署前一版。

## Open Questions

- App 圖示：目前用預設圖示，之後再決定，不影響架構（名稱已定為 TripWeave，repo 為 `tripweave`）
