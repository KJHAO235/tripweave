# Design

## Context

動機見 proposal.md；行為要求見 `specs/track-import`、`specs/gap-detection`、`specs/track-map-view`。

現況：
- `ImportButton` 只取 `files[0]`；`App.handleFile` 解析單一檔案得到 `Track`，之後 `detectGaps`、`useRailFills`、`toMapFeatures` 都以一個 `Track` 為輸入
- `detectGaps` 已把段落交界視為相鄰點（`isSegmentBoundary`），所以多個檔案合併成多個段落後，檔案之間的空白會自然被偵測
- `useRailFills` 以 `Track` 物件的身分判斷是否換了一趟旅程

實測 Relive 下載的 GPX（2026-10-30）：每天一個檔案、每點都有時間與海拔；8/14 的終點與 8/15 的起點都在札幌（相距約 0.1 km）；單檔 0.2 到 3 MB、最多約 3 萬點。

## Goals / Non-Goals

**Goals:**
- 合併邏輯放在 `src/core`，可在 Node 測試
- 多檔匯入後，缺口偵測、沿鐵路補路、地圖顯示都不需要另外修改就能運作
- 14 天的旅程在 iPhone 上可用

**Non-Goals:**
- 在既有旅程上「加入」檔案（每次匯入都是完整取代，避免多一個按鈕）
- 時間重疊的檔案（例如同時用兩個 App 錄）去重或合併
- 保存匯入紀錄、Web Worker 解析（實測若太慢再做）

## Decisions

### 1. 資料模型：段落記錄來源檔案

```
 Segment { points, source?: string }   // 來源檔名（不含副檔名）
 Track   { name?, segments, hasTime }  // hasTime 規則不變：所有點都有時間才為 true
 Gap     { ..., isSegmentBoundary, isFileBoundary }
```

`isFileBoundary` 為缺口兩端的段落 `source` 不同。單檔匯入時所有段落同一來源，行為與現在相同。

替代方案是另建 `Trip { tracks: Track[] }`：語意更完整，但缺口偵測、補路、地圖都要改成處理多個 Track；把檔案攤平成段落，現有程式幾乎不用改。

### 2. 合併與排序（`src/core/parse/mergeTracks.ts`）

```
 parseTrackFiles([{ name, text }...]) -> { track: Track | null, failures: { name, message }[] }
   每個檔案用既有的 parseTrackFile 解析
   成功的依序合併：
     所有檔案都有時間 -> 依各檔第一個有時間的點排序
     否則            -> 依檔名自然排序（Intl.Collator，numeric: true）
   段落標上 source，再串接成一個 Track
   名稱：單檔用檔名；多檔為「N 個檔案」
```

排序在 core 進行，不依賴使用者在選擇器裡的點選順序（iOS 的多選順序不可靠）。

### 3. 匯入流程與進度

```
 <input type="file" multiple>（仍不設 accept）
 依序讀取：file.text() -> 解析 -> 更新「讀取中 i/N」-> 讓出主執行緒（await 一個 macrotask）
 全部解析完才一次合併並 setTrack；成功 0 個時保留舊旅程
```

逐檔讓出主執行緒，讓進度能更新、畫面不凍結。解析仍在主執行緒；一天 3 MB 的 GPX 在電腦上約 0.1 秒，14 天預估在 iPhone 上數秒內完成，未達標再改 Web Worker。

### 3a. GPX 改用直接掃描文字解析（實測後追加）

Chrome 實測 14 天（32.7 MB）：togeojson 讀取共 8.8 秒，iPhone 預估會超過 30 秒。GPX 結構單純，改為直接用正規表示式掃描 `trkseg`／`trkpt`（沒有 `trk` 時改讀 `rte`／`rtept`）：同一個 3.8 MB 檔案從 823 ms 降到 18 ms，結果逐點相同。

- KML 結構多樣（MultiGeometry、gx:Track 等），仍使用 togeojson
- 安全網：掃描結果為 0 點、但文字中有 `trkpt`／`rtept`（例如加了命名空間前綴）時，退回 togeojson
- 以測試確認兩種方式對所有 GPX 測試檔的結果完全相同

### 3b. 補路效能與記憶體（實測後追加）

原本做法在 14 天（272 個缺口）時補完要約 10 秒、JS 記憶體增加到 509 MB。先試過「每個缺口各自建圖」，記憶體幾乎沒降、反而更慢；逐項計時後發現真正的瓶頸與做法如下：

- **每補一個缺口就重算整趟旅程的地圖資料**（數十萬點）並整份送給 MapLibre：把地圖資料拆成「實際記錄」（只跟軌跡與缺口有關）與「缺口、推算路段」兩組，分別更新；補路結果累積 300 ms 才更新一次畫面
- **快取解碼後的網格佔用大量記憶體**：載入器改存未解碼的原始網格，只保留最近使用的 64 個，建圖時才解碼
- **鐵路網圖持續累加**：仍共用一張圖，但超過 96 個網格時以目前缺口需要的網格重建
- **下載與計算排隊**：補路改為沿旅程先後處理（相鄰缺口共用網格，重建很少），並在計算目前缺口時預先下載接下來 4 個缺口的網格

Chrome 實測（14 天、32.7 MB）：旅程顯示 9.8 秒 → 2.9 秒；全部補完 19.8 秒 → 7.3 秒；最高記憶體約 680 MB → 349 MB；補齊數量不變（272 個缺口補齊 261 個）。

補路順序因此從「大缺口先補」改為「沿旅程先後」，使用者看到的是從起點依序補齊。

### 4. 旅程摘要

工具列原本顯示檔名的位置：單檔顯示檔名；多檔顯示「N 個檔案」，有時間資料時加上日期範圍（依裝置時區，跨月時寫完整日期，例如「2024/8/14–8/15」、「2024/8/31–9/2」）。日期格式化放在 `src/core/format.ts`。

### 5. 部分失敗的訊息

沿用錯誤訊息區塊，改為可多行：每個失敗的檔案一行「檔名：原因」。至少一個成功時，旅程照常更新，訊息仍顯示讓使用者知道哪些沒匯入。

### 6. 缺口列表

`isFileBoundary` 的缺口顯示「檔案之間」標籤（取代「段落交界」）；缺口資訊加一行「位於兩個檔案之間」。

### 7. 測試資料

- 加入 `test-data/relive-2024-08-14.gpx`、`test-data/relive-2024-08-15.gpx`：與已公開的 `Day1+2.kml` 是同一趟旅程，多了逐點時間
- 效能驗證用日本四極點 14 天的 GPX：只在本機使用、不進 repo（需要先徵得使用者同意下載）

## Risks / Trade-offs

- [iPhone「檔案」App 多選操作不直覺（需先點「選取」）] → iPhone 驗收時確認，必要時在按鈕旁加一句提示文字
- [14 天約 30 MB 文字一次讀進記憶體] → 逐檔解析、只保留座標資料，字串在解析後即可回收；iPhone 驗收時確認不會讓分頁重新載入
- [自寫的 GPX 解析器漏掉某些寫法] → 與 togeojson 的結果比對測試，並保留退回 togeojson 的安全網
- [有時間的 GPX 啟用速度檢查後，沿鐵路補路可能被排除] → 用 8/14 的 GPX 跑一次完整補路，確認仍與 KML 的結果一致
- [裝置時區與旅行地時區不同，日期可能差一天] → 摘要只是參考資訊；之後若需要可改用軌跡所在地時區

## Migration Plan

純前端變更，部署方式不變；單檔匯入的行為與現在相同。
