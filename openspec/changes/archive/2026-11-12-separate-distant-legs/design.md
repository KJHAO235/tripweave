# Design

## Context

- `detectGaps` 逐點比較相鄰點距離，段落銜接處也一樣；`isFileBoundary` 標示不同檔案之間。`toRecordedFeatures` 本來就依段落分開畫線，因此銜接處只要不是缺口，地圖上就不會有連線。
- `useTrips.addFiles` 讀取並分類檔案後，直接更新目前旅程並保存；`removeFile`、`createTrip` 已有現成流程。
- 檔案摘要 `FileSummary` 有 `firstTime`、`lastTime`，旅程列表與名稱已用它算日期範圍。

## Goals / Non-Goals

**Goals:**
- 判斷只依兩端的時間，與距離、交通方式無關，純函式可測試
- 建議提示不打斷操作（檔案照常加入），一鍵就能改正

**Non-Goals:**
- 不在已保存的舊旅程上自動分割或移動檔案

## Decisions

### 1. 在 `detectGaps` 判斷，而不是在補齊時排除

在段落銜接處（`previous.ref.segment !== segmentIndex`）兩點都有時間且相隔 > 3 天時直接略過，不產生 `Gap`。這樣缺口列表、地圖缺口線、補齊、缺口數都一致；不需要在下游各處排除。同一段落內的兩點相隔超過 3 天（極少見，例如暫停記錄後繼續）也套用相同規則，由同一個判斷處理。門檻放在 `gaps.ts` 的常數 `SEPARATE_LEG_HOURS = 72`。

替代方案：保留缺口但標示為「不同行程」不補齊。缺點是地圖仍要畫連線或特別隱藏，列表也會有一筆無意義的項目。

### 2. 間隔的計算

`src/core/trip.ts` 新增 `daysApart(trip: FileSummary[], added: FileSummary)`：兩個時間範圍重疊時為 0，否則為較近兩端的差（天）；任一方沒有時間時回傳 undefined。`formatApart(days)`：未滿 30 天「N 天」，未滿 365 天「約 N 個月」，否則「約 N 年」。

### 3. 提示與「改成新旅程」

`addFiles` 加入後，對每個新檔案以加入前的旅程摘要計算間隔，> 7 天的收集起來；有的話設定 `suggestion = { tripId, fileIds, message }`。提示放在復原提示的位置（`.notices`），有關閉按鈕，不自動消失（這是需要決定的事，不像復原只是補救）；切換旅程或再做其他修改時清除。

「改成新旅程」：從目前旅程拿掉這些檔案（保存一次），以同一份檔案資料（記憶體中的解析結果與原始文字）建立新旅程並切換。原始文字在 `readSelected` 時已有，提示存著它們，避免再讀一次儲存。

## Risks / Trade-offs

- [真的跨數天的長旅程中，中間有幾天沒記錄（> 3 天）] 這幾天前後不會連線 → 合理：不知道中間怎麼移動，不連線比畫錯好；兩段仍在同一趟旅程。
- [同一趟旅行的檔案隔了 8 天才加入] 會出現提示 → 只是提示，不理會即可。

## Migration Plan

純前端變更；已保存的旅程重新開啟時，超過 3 天的銜接處自動不再是缺口。
