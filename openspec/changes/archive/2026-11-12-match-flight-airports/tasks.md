# Tasks

## 1. 機場資料

- [x] 1.1 新增 `scripts/airports/build-airports.ts`（含 CSV 解析與城市名稱整理），驗證測試：引號內含逗號的欄位正確解析、「Manila (Pasay)」整理為「Manila」、沒有定期航班或沒有 IATA 的機場被排除
- [x] 1.2 從 OurAirports 下載 `airports.csv` 並產生 `public/airports.json`，驗證檔案約 4,000 筆、包含 NRT／HND／OKA／MNL／USU／ENI、大小在 300 KB 內（實測：4,008 筆、255 KB，gzip 後 104 KB）

## 2. 機場比對與飛機判斷（src/core）

- [x] 2.1 新增 `src/core/airports.ts`（`nearestAirport`、`formatAirport`）與 `airportPath`，驗證測試：Coron 降落前缺口終點對到 USU；航程中途缺口兩端都對不到；10 km 邊界；路徑經過機場且長度為整條路徑長度、跨換日線時經度連續
- [x] 2.2 `decideFill` 加入機場資料取得函式：判斷為飛機後對到機場、規則 5（沒有時間、≥ 100 km、兩端都在機場 10 km 內）、機場資料失敗時以空陣列處理。驗證測試：合成的 USU 2 km 外 → ENI 3 km 外（沒有時間）判斷為飛機且航段 USU → ENI；只有一端在機場的 150 km 缺口不判斷為飛機；機場資料取得失敗時 Coron 仍有 11 個飛機；既有飛機、渡輪測試全部通過

## 3. 補齊流程與顯示

- [x] 3.1 `useGapFills` 以快取載入 `airports.json` 並傳給 `decideFill`，驗證 Chrome 中開啟 Coron 旅程，降落前缺口的推算線畫到 USU、其他 10 個不變；網路請求中 `airports.json` 只出現一次；另把 `airports.json` 與渡輪網格加入 service worker 快取（渡輪先前漏掉）
- [x] 3.2 缺口資訊「航段」與列表標籤，驗證 Chrome 中點選降落前缺口看到「→ Coron (USU)」、標籤「飛機 USU」
- [x] 3.3 圖例資料來源加上機場資料（OurAirports），README 更新，驗證內容與實際行為一致

## 4. 驗收

- [x] 4.1 在 Chrome 開啟日本、Coron、El Nido 渡輪測試旅程，驗證補齊數量與方式不變（333/343、11 飛機、1 渡輪）
- [x] 4.2 徵得使用者同意後 push，在 iPhone 驗證 Coron 旅程的航段顯示

## Workflow follow-up

- 每完成一個任務群組自動 commit；push 與 iPhone 驗收前先詢問使用者
- 全部完成並驗收後，用 `/opsx:archive` 封存這個 change
