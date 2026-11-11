# Tasks

## 1. 渡輪資料管線

- [x] 1.1 `fetch-region.sh` 在刪除 PBF 前另外輸出 `<name>.ferry.opl`（`w/route=ferry`），`opl.ts` 對沒有 railway 標籤的線段視為主線、非隧道，驗證 `pipeline.test.ts` 新增的渡輪 OPL 案例：名稱保留、service 為 0
- [x] 1.2 本機下載 `asia/philippines` 並產生渡輪網格，驗證 Coron 與 El Nido 之間有渡輪航線；把需要的網格複製到 `test-data/ferry/v1/`（含只列這些網格的 `index.json`），驗證檔案大小合理（< 1 MB）（實測：菲律賓 1,137 條航線、2,551 個網格；有「El Nido – Coron」航線 w467592728；保留 42 個網格共 192 KB）
- [x] 1.3 `rail-data.yml` 對每個地區同時產生渡輪網格、合併並上傳 `ferry-data.tar.gz`；`deploy.yml` 下載得到時解到 `dist/ferry/`，下載不到時照常部署。驗證 workflow YAML 語法（本機以 Ruby 的 YAML 解析）與步驟順序

## 2. 測試資料與渡輪判斷（src/core）

- [x] 2.1 把 `~/Downloads/El_Nido_Day1_.gpx` 複製為 `test-data/relive-elnido-2025-01-26.gpx`，並在測試輔助中提供挖掉船程中段的版本（第 1501–4999 點，兩端都在航線 3 km 內），驗證測試：原檔 0 個缺口、挖掉後有 1 個約 32 km 的缺口
- [x] 2.2 新增 `src/core/ferry.ts` 的 `fillGapAlongFerry`、`tilesForFerryGap`，驗證測試（使用 `test-data/ferry`）：挖掉的船程判斷為渡輪且推算路段沿航線（路徑中點離兩端直線 > 1 km 或與航線重合）；山區缺口、時速 400 km/h 的缺口不判斷為渡輪；離航線超過 0.3 km 的一端有殘段（挖掉版本的終點離航線約 0.4 km）
- [x] 2.3 以合成航線網測試鹿兒島—那霸約 700 km、25 小時的缺口判斷為渡輪，且不被判斷為飛機（以 `useGapFills` 使用的 `decideFill` 驗證順序；沒有渡輪資料時同一缺口仍為飛機）
- [x] 2.4 `GapFill` 加入 `FerryFill`，`toOverlayFeatures` 的渡輪 feature 帶 `mode: 'ferry'` 與殘段，驗證 `mapFeatures` 測試

## 3. 補齊流程

- [x] 3.1 新增 `fetchFerryJson` 與渡輪載入器、渡輪網，`useGapFills` 改為 飛機（高速）→ 鐵路 → 渡輪 → 飛機；渡輪網格下載失敗時不判斷飛機。驗證開發伺服器上（`public/ferry` 指向測試網格）匯入挖掉中段的 El Nido 檔案，缺口補齊為渡輪（實測：沿「Sibaltan - Coron」航線 33.0 km，終點 0.4 km 殘段）
- [x] 3.2 在 Chrome 開啟日本四極點 15 天與 Coron 旅程，驗證補齊結果與之前相同（333/343、Coron 11 個飛機）（實測相同；本機只有菲律賓渡輪資料）

## 4. 顯示

- [x] 4.1 地圖加入渡輪圖層與選取樣式（綠色 `#059669` 短長虛線），圖例加入「推算（渡輪）」，驗證 Chrome 中五種線條可以分辨、圖例不遮住軌跡
- [x] 4.2 缺口列表標籤「渡輪」、缺口資訊「沿渡輪航線補齊」與航線名稱（沒有時「未命名航線」）、推算長度，驗證 Chrome 中點選渡輪缺口看到正確資訊
- [x] 4.3 更新 README 與 CLAUDE.md 中鐵路資料流程的說明（加上渡輪），驗證內容與實際行為一致

## 5. 每月排程拆分（使用者同意追加）

- [x] 5.1 新增 `scripts/rail/balance-groups.ts`：依 Geofabrik 檔案大小把總量超過上限的洲拆成數組，驗證測試：各組大小接近、只拆超過上限的洲、命名為 `<洲>-<序號>`
- [x] 5.2 以實際大小重新產生 `regions.json`（`regions.global.json` 維持不拆），驗證每組下載量都在上限內、地區總數與拆分前相同（511 個）（實測：21 組，最大 4.9 GB；歐洲 7 組、北美洲 4 組、亞洲 3 組、非洲 2 組）

## 6. 部署與 iPhone 驗收

- [x] 6.1 徵得使用者同意後 push，並手動觸發「產生鐵路資料」；驗證所有洲在時間內完成、Release 有 `ferry-data.tar.gz`、網站的 `ferry/v1/index.json` 可以取得（實測：21 組全部成功，整次 22 分鐘、最久一組 20 分鐘；ferry-data 10.9 MB）
- [ ] 6.2 在 iPhone 匯入挖掉中段的 El Nido 檔案（由我產生並傳給使用者），驗證沿航線補齊、樣式可分辨；日本與 Coron 旅程結果不變

## Workflow follow-up

- 每完成一個任務群組自動 commit；push、觸發 workflow 與 iPhone 驗收前先詢問使用者
- 全部完成並驗收後，用 `/opsx:archive` 封存這個 change
