# Spec Delta

## Purpose

讓使用者把其他 App 錄好的 GPS 軌跡檔匯入本工具，轉換成統一的軌跡資料，作為顯示、缺口偵測與後續補路的共同來源。

## ADDED Requirements

### Requirement: 支援 KML 軌跡檔
系統 SHALL 能匯入 KML 檔，讀取其中所有線段（LineString）作為軌跡段落，包含 Google 我的地圖匯出的格式。KML 中的地標點（Point）不視為軌跡點。

#### Scenario: 匯入 Google 我的地圖匯出的 KML
- **WHEN** 使用者匯入 `Day1+2.kml`
- **THEN** 系統讀出 2 個軌跡段落，第一段 17,033 點、第二段 29,845 點
- **AND** 起點「上野」、終點「釧路」等地標點不會被加入軌跡

#### Scenario: KML 使用 gx:Track 格式
- **WHEN** 使用者匯入以 `gx:Track` 記錄軌跡的 KML
- **THEN** 系統讀出軌跡點，且每點附帶其 `when` 時間

### Requirement: 支援 GPX 軌跡檔
系統 SHALL 能匯入 GPX 檔，讀取其中每個軌跡段（trkseg）作為一個軌跡段落；若沒有 trk，則讀取路線（rte）。

#### Scenario: 匯入含時間的 GPX
- **WHEN** 使用者匯入一個每點都有 `time` 的 GPX 檔
- **THEN** 系統讀出所有軌跡點，每點附帶時間與海拔（若有）

#### Scenario: 匯入多段 GPX
- **WHEN** GPX 檔有 2 個 trkseg
- **THEN** 系統讀出 2 個軌跡段落，段落之間不視為相連

### Requirement: 時間與海拔為選填資料
系統 SHALL 允許軌跡點只有經緯度。時間、海拔缺少時，匯入 MUST 仍然成功，後續功能依可用的資料運作。

#### Scenario: 匯入沒有時間的軌跡
- **WHEN** 使用者匯入沒有逐點時間的 KML
- **THEN** 匯入成功，系統標記此軌跡「沒有時間資料」

### Requirement: 檔案只在裝置上處理
系統 MUST 在使用者的裝置上完成檔案解析，不得將軌跡檔或其內容上傳到任何伺服器。

#### Scenario: 匯入時沒有上傳行為
- **WHEN** 使用者匯入任何軌跡檔
- **THEN** 過程中沒有任何包含軌跡內容的網路請求

### Requirement: 無法匯入時提供明確訊息
系統 SHALL 在檔案格式不支援、內容損毀或沒有任何軌跡時，顯示說明原因的錯誤訊息，且不改變目前已載入的軌跡。

#### Scenario: 匯入不支援的格式
- **WHEN** 使用者選擇一個 PDF 檔
- **THEN** 系統顯示「不支援的檔案格式」並列出支援的格式

#### Scenario: 檔案中沒有軌跡
- **WHEN** 使用者匯入一個只有地標點、沒有線段的 KML
- **THEN** 系統顯示「檔案中找不到軌跡」

### Requirement: 在 iPhone 上能選取檔案
系統 SHALL 讓使用者在 iPhone Safari 中，從「檔案」App（含 iCloud 雲碟與「下載」）選取軌跡檔。

#### Scenario: 從 iPhone 檔案 App 選取 KML
- **WHEN** 使用者在 iPhone 上點選「匯入」並從「檔案」App 選擇 `Day1+2.kml`
- **THEN** 檔案成功匯入並顯示在地圖上
