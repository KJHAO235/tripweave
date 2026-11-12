# Design

## Context

- `src/core/flight.ts`：`flightBySpeed`（≥ 350 km/h、≥ 10 km）與 `flightAfterRail`（起降前後、≥ 300 km）產生 `FlightFill { path, lengthKm, basis }`，`path` 為兩端之間的大圓航線。
- `src/core/fill.ts` 的 `decideFill(track, gap, railGraph, ferryGraph)` 依序判斷，鐵路與渡輪網只在需要時才取得；`useGapFills` 傳入取得函式。
- 實測 Coron 航程：降落前 32 km 缺口的終點離 Busuanga（USU）0.1 km；其餘 10 個缺口兩端離機場都在 35 km 以上。
- 參考 proposal 的動機、specs 的需求。

## Goals / Non-Goals

**Goals:**
- 機場比對是純函式（`src/core/airports.ts`），可用測試資料直接測
- 機場資料只下載一次，失敗時飛機補齊照舊

**Non-Goals:**
- 空間索引：4,000 個機場線性掃描即可（每個飛機缺口兩次，微秒等級）
- 依航線熱門程度在多個機場間選擇：10 km 內通常只有一個有定期航班的機場，取最近者

## Decisions

### 1. 資料格式與產生

`scripts/airports/build-airports.ts <airports.csv> <輸出檔>`：讀 OurAirports 的 `airports.csv`，篩選 `scheduled_service = yes` 且有 `iata_code` 的 large／medium／small airport，輸出

```json
[["MNL","Ninoy Aquino International Airport","Manila",14.5086,121.02], ...]
```

（IATA、名稱、城市、緯度、經度；座標四捨五入到 4 位小數）。城市取 `municipality` 並去掉括號內的補充（「Manila (Pasay)」→「Manila」），空白時用名稱。CSV 解析用一個小的手寫解析器（處理雙引號與逗號），不新增函式庫。下載網址寫在腳本說明中，由開發者手動下載後執行。

替代方案：放進每月排程自動更新。機場變動很少，且會讓排程多依賴一個外部來源，先不做。

### 2. 比對：`nearestAirport(airports, point, 10)`

回傳 10 km 內最近的機場或 null。`airportPath(gap, from?, to?)`：起點序列為 `[缺口起點, 起點機場?]`，終點序列為 `[終點機場?, 缺口終點]`，中間是兩個「航線端點」（有機場用機場，沒有用缺口端點）之間的大圓航線；去掉相鄰重複點。`lengthKm` 為整條路徑長度。

### 3. 在判斷流程中的位置

`decideFill` 增加第四個參數 `airports: () => Promise<Airport[]>`：
- 判斷為飛機（任何規則）後才取得機場資料，對兩端各做一次 `nearestAirport`，重算 `path` 並加上 `airports: { from?, to? }`
- 規則 5（沒有時間、≥ 100 km、鐵路與渡輪都補不了、規則 3 與 4 都不成立）需要先取得機場資料判斷兩端
- 取得機場資料失敗時以空陣列處理（不中止判斷），與鐵路、渡輪網格失敗時中止的做法不同：機場只影響畫法與少數缺口，不該讓整個缺口無法補齊

`useGapFills` 以模組層級的 Promise 快取機場資料，整個 App 只下載一次；失敗時下次需要再試。

### 4. 顯示

`formatAirport(a)`：「城市 (IATA)」。缺口資訊新增「航段」一列：兩端都有「A → B」、只有起點「A →」、只有終點「→ B」。列表標籤：「飛機 USU → ENI」「飛機 USU」，沒對到機場維持「飛機」。

## Risks / Trade-offs

- [端點在機場 10 km 內但其實不是搭飛機起降（例如住在機場旁）] 只影響已判斷為飛機的缺口畫法，以及規則 5（需要兩端都在機場附近），誤判機率低。
- [OurAirports 資料錯誤或過時] 腳本可隨時重跑更新。
- [機場資料 206 KB（壓縮約 84 KB）] 只有判斷出飛機時才下載一次，service worker 快取後重複使用。

## Migration Plan

純前端與靜態資料；已保存的旅程重新開啟時，飛機缺口自動對到機場。
