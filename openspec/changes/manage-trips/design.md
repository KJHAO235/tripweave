# Design

## Context

- `App.tsx` 只有一個 `track` state；`handleFiles` 逐檔 `parseTrackFile` 後用 `combineImports` 合併，成功就整個取代。
- `mergeTracks` 依時間或檔名排序後把各檔的 `segments` 串接；每個 `Segment.source` 記錄來源檔名，`tripLabel` 依此算檔案數。
- `useRailFills` 以 `track` 物件的身分（`!==`）判斷是否換了一趟旅程，換了就清空補路結果重來。
- `pwa.ts` 在 `hasUserData` 為 true 時不自動重新整理，避免記憶體中的旅程消失。
- 14 天 Relive GPX 從選檔到顯示約 2.9 秒（直接掃描解析），屬於可接受的開啟時間。

## Goals / Non-Goals

**Goals:**
- 旅程資料模型與「由檔案組成旅程」的邏輯放在 `src/core`，可用 Vitest 測試
- 儲存層只依賴瀏覽器內建 API，與 React 分離，可以替換成測試用的記憶體實作
- 加入或移除一個檔案時只寫入那個檔案，不重寫整趟旅程

**Non-Goals:**
- 跨裝置同步、匯出備份
- 保存補路結果；重新開啟時照常背景補路（網格有瀏覽器快取）
- 多個分頁同時編輯同一趟旅程的一致性

## Decisions

### 1. 使用 IndexedDB，不新增函式庫

用原生 IndexedDB 包一層小模組（`src/storage/tripStore.ts`），只提供需要的幾個 Promise 方法。替代方案：`localStorage` 容量約 5 MB，裝不下多日 GPX；`idb`、Dexie 等函式庫好用但需要新增依賴，而這裡的操作很少。

資料表：
- `trips`：`{ id, customName?, createdAt, updatedAt }`
- `files`：`{ id, tripId, name, text, fingerprint, addedAt }`，以 `tripId` 建索引
- `settings`：`lastTripId`

旅程列表需要的檔案數、日期範圍不另外存，避免與檔案不同步；列表打開時由 `trips` 加上各檔的摘要計算。為了不必解析每個檔案，`files` 另存 `summary: { pointCount, firstTime?, lastTime? }`，匯入時算好。

### 2. 保存原始檔案文字，開啟時重新解析

每個檔案存匯入時的原始文字，開啟旅程時用現有的 `parseTrackFile` 解析、`mergeTracks` 合併。替代方案是存解析後的點陣列，開啟稍快，但：(a) 規格要求保存原始內容；(b) 之後改進解析器（例如新格式、修正錯誤）可直接套用到舊旅程；(c) 原始文字通常比結構化複製的點物件小。14 天約 3 秒的開啟時間可以接受；開啟時沿用逐檔讓出主執行緒的方式，地圖先顯示上次的範圍，不會凍結畫面。

### 3. 旅程 = 檔案清單；合併結果是推導值

`src/core/trip.ts` 定義 `TripFile`（id、名稱、解析後的 `Track`）與 `buildTrack(files)`：對每個檔案的 `Track` 呼叫 `mergeTracks`。每個檔案有自己的 id，`Segment.source` 仍放檔名供顯示，另加 `fileId` 讓檔案列表與移除對應到段落。

加入或移除檔案後產生新的 `Track` 物件，`useRailFills` 會視為新旅程重新補路。替代方案是讓補路沿用未受影響的缺口結果，但缺口 id 以段落索引組成，移除檔案後索引會位移；為此改動缺口 id 的風險較高，而且補路已在背景進行、14 天約 7 秒，先不做。

### 4. 相同檔案判斷用內容指紋

`fingerprint` 由解析後的軌跡計算：總點數、第一點與最後一點的經緯度與時間，以及每隔固定點數取樣的座標，組成字串。純函式放在 `src/core`，不依賴 `crypto.subtle`（它只在 HTTPS／localhost 可用，用區網 IP 在 iPhone 上開發時會失敗）。只比對目前旅程內的檔案，不跨旅程比對。

### 5. 刪除與移除：立即寫入，記憶體保留以供復原

刪除旅程或移除檔案時立即從 IndexedDB 刪除，並把被刪的資料（旅程紀錄與原始檔案文字）保留在記憶體中約 6 秒；點「復原」就原樣寫回（沿用原本的 id 與時間）。替代方案「標記為已刪除、延後清除」需要在每次讀取時過濾，而且 App 在提示期間被關掉時要處理殘留資料。採用立即刪除的代價是：提示期間關掉 App 就無法復原，可以接受。

### 6. 介面

- 工具列：左側按鈕沒有旅程時為「匯入軌跡」，有旅程時為「加入檔案」；旅程名稱可點，打開旅程列表。
- 旅程列表：從上方展開的面板，列出旅程（名稱、檔案數、日期範圍），每列有刪除按鈕；最上方是目前旅程的名稱輸入框（改名）與「＋ 新旅程」。「新旅程」直接觸發檔案選擇，不另開對話框。
- 底部面板：在缺口列表上方加入可收合的「檔案 N 個」區，每列有 ✕。
- 復原提示：畫面下方的小橫條，與錯誤訊息共用位置規則，不遮住面板把手。
- 不使用 `confirm()`；iOS 加入主畫面後的對話框體驗不好，也違反「少按按鈕」原則。

### 7. App 狀態

`App` 改為持有 `currentTrip: { id, customName?, files: TripFile[] } | null`，`track` 由 `useMemo(() => buildTrack(files))` 推導。所有寫入透過一個 `useTrips` hook 進行：先更新畫面狀態，再寫入 IndexedDB；寫入失敗時顯示錯誤訊息但不回滾畫面。

### 8. PWA 自動更新

旅程已保存，重新整理不會遺失資料，因此 `setHasUserData` 改為只在「正在讀取檔案或寫入儲存」期間為 true。其餘時間偵測到新版就直接更新，重新開啟時自動回到上次的旅程。

## Risks / Trade-offs

- [iOS 清除網站資料] Safari 分頁中長期未使用的網站資料可能被清除 → 呼叫 `navigator.storage.persist()`；README 建議加入主畫面使用；匯出備份留待之後。
- [儲存空間不足] 寫入失敗（`QuotaExceededError`）→ 顯示「裝置空間不足，旅程沒有保存」，目前畫面仍可使用。
- [開啟大旅程需要重新解析] 14 天約 3 秒 → 解析期間工具列顯示「開啟中 i/N」，與匯入的進度顯示共用。
- [指紋誤判] 兩個不同檔案恰好點數、首尾與取樣點都相同的機率極低；誤判時使用者會看到「已略過」訊息並知道原因。
- [移除檔案後整趟重新補路] 多日旅程約數秒 → 補路本來就在背景、陸續顯示，不影響操作。

## Migration Plan

沒有既有的保存資料，不需要轉換。資料庫加上版本號；之後要改結構時用 `onupgradeneeded` 處理。回滾到舊版時，舊版不讀 IndexedDB，只是又回到每次重新匯入。
