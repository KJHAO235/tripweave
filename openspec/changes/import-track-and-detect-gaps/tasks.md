# Tasks

## 1. 專案骨架

- [x] 1.1 用 Vite 建立 React + TypeScript 專案（在 repo 根目錄），驗證 `npm run dev` 能啟動並在瀏覽器顯示預設頁面
- [x] 1.2 安裝依賴 `maplibre-gl`、`@tmcw/togeojson`、`vite-plugin-pwa`，開發依賴 `vitest`、`@xmldom/xmldom`，驗證 `npm install` 成功且 `npm run build` 通過
- [x] 1.3 設定 `npm test` 執行 Vitest，加入一個暫時的 smoke test，驗證 `npm test` 通過
- [x] 1.4 把 `Day1+2.kml` 複製到 `test-data/`，驗證檔案大小與原檔一致（1,822,455 bytes）
- [x] 1.5 建立 design 中的目錄結構（`src/core`、`src/map`、`src/components`），驗證 core 不 import React 或 MapLibre
- [x] 1.6 更新 README（技術方向、`npm run dev` / `npm test` / `npm run build` 指令、目前進度）與 CLAUDE.md（技術選擇改為已確定的組合，保留「新增函式庫前先確認」），驗證文件中的指令實際可執行

## 2. 軌跡匯入（track-import）

- [x] 2.1 實作資料模型 `Track` / `Segment` / `TrackPoint`（`src/core/track.ts`），驗證 TypeScript 編譯通過
- [x] 2.2 實作 KML 解析（LineString 為段落、捨棄 Point），驗證測試：`Day1+2.kml` 解析出 2 段、17,033 點與 29,845 點，且 `hasTime` 為 false
- [x] 2.3 支援 KML `gx:Track` 與逐點時間，驗證手寫測試檔的每點都帶有正確時間
- [x] 2.4 實作 GPX 解析（trkseg 為段落、沒有 trk 時讀 rte、時間與海拔），驗證測試：多段 GPX 解析出正確段數，含時間的 GPX 每點有時間與海拔
- [x] 2.5 實作格式判斷與錯誤處理（不支援格式、內容損毀、沒有軌跡），驗證測試：PDF 回傳「不支援的檔案格式」、只有地標點的 KML 回傳「檔案中找不到軌跡」

## 3. 缺口偵測（gap-detection）

- [x] 3.1 實作 haversine 距離（`src/core/geo.ts`），驗證測試：已知兩點距離誤差小於 0.1%
- [x] 3.2 實作缺口偵測（含段落交界、預設門檻 1 km、可傳入門檻），驗證測試：`Day1+2.kml` 包含苫小牧到札幌 50.3 km、青函隧道 47.5 km、27.9 km、25.9 km、17.2 km 五個缺口（誤差 0.5 km 內），且段落交界不是缺口
- [x] 3.3 有時間資料時計算缺口時間長度與平均速度，驗證測試：10:00 到 10:30、50 km 的缺口得到 30 分鐘、約 100 km/h；沒有時間時兩者為空
- [x] 3.4 缺口依距離由大到小排序，驗證測試：`Day1+2.kml` 第一筆 50.3 km、第二筆 47.5 km；門檻 10 km 時只剩超過 10 km 的缺口
- [x] 3.5 驗證測試：偵測前後軌跡點數量與座標完全相同（原始資料不被修改）
- [x] 3.6 實作「依缺口把段落切成實線與缺口線」的 GeoJSON 轉換（放在 core），驗證測試：實線不包含任何缺口兩端之間的線段，缺口線數量等於缺口數量

## 4. 地圖與介面（track-map-view）

- [x] 4.1 建立 MapLibre 地圖元件，使用 OpenFreeMap Positron 樣式（網址集中設定），驗證開發伺服器上地圖可正常顯示與縮放
- [x] 4.2 加入匯入按鈕（`<input type="file">` 不設 accept），匯入後畫出軌跡並自動縮放到完整範圍，驗證用 `Day1+2.kml` 能看到上野到釧路的完整軌跡
- [x] 4.3 實線圖層與缺口圖層（虛線、警示色），驗證苫小牧到札幌顯示為虛線，其他路段為實線
- [x] 4.4 匯入失敗時顯示錯誤訊息且保留原本的軌跡，驗證先匯入 KML 再匯入 PDF 時，地圖上的軌跡仍在
- [x] 4.5 缺口列表（總數、依距離排序、點選後地圖移動到該缺口並顯示資訊），驗證點選「47.5 km」那筆會移到青函隧道
- [x] 4.6 在地圖上點選缺口線段顯示資訊，驗證點選苫小牧到札幌的虛線會顯示 50.3 km
- [x] 4.7 缺口門檻調整控制項，驗證調到 10 km 後列表筆數減少，原本 1 到 10 km 的缺口改回實線
- [x] 4.8 驗證匯入過程沒有包含軌跡內容的網路請求（瀏覽器開發者工具的 Network 面板只有圖磚與網站資源）

## 5. PWA 與部署

- [x] 5.1 設定 `vite-plugin-pwa`（manifest `display: standalone`、service worker `autoUpdate`）與 Vite `base: '/relive-app/'`，畫面顯示 build 時間，驗證 `npm run build` 產出 manifest 與 service worker
- [x] 5.2 建立 GitHub Actions：push 到 main 時執行測試、建置並部署 GitHub Pages，驗證 workflow 檔語法正確
- [ ] 5.3 建立公開 GitHub repo、設定 remote 並 push（執行前先向使用者確認），在 repo 設定把 Pages 來源設為 GitHub Actions，驗證 Actions 執行成功且網址可以開啟

## 6. iPhone 整合驗收

- [ ] 6.1 在 iPhone Safari 開啟部署網址，從「檔案」App 選取 `Day1+2.kml`，驗證軌跡在數秒內顯示且平移、縮放順暢
- [ ] 6.2 在 iPhone 上確認五個主要缺口都以虛線顯示，點選列表能跳到對應位置
- [ ] 6.3 加入主畫面後從圖示開啟，驗證以全螢幕顯示、沒有 Safari 網址列
- [ ] 6.4 用同一份資料截圖，和 Relive 的「活動地圖」截圖並排，確認苫小牧到札幌、青函隧道都被清楚標示為缺口

## Workflow follow-up

- 每完成一個任務群組提醒使用者 commit
- 全部完成並驗收後，用 `/opsx:archive` 封存這個 change
