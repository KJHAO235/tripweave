# Spec Delta

## Purpose

提供補路所需的鐵路網資料，讓 App 能快速、免費、不洩漏位置地取得缺口附近的鐵路，並可隨 OpenStreetMap 更新與擴充涵蓋地區。

## ADDED Requirements

### Requirement: 資料來源與授權標示
鐵路網資料 SHALL 來自 OpenStreetMap，並在 App 中標示資料來源與授權（ODbL）。

#### Scenario: 顯示資料來源
- **WHEN** 使用者查看地圖的資料來源說明
- **THEN** 可以看到 OpenStreetMap 貢獻者的標示

### Requirement: 涵蓋地區
鐵路網資料 SHALL 至少涵蓋日本與台灣，涵蓋地區由一份地區清單設定，新增地區不需要修改 App 程式。

#### Scenario: 日本的鐵路
- **WHEN** App 需要青函隧道一帶的鐵路資料
- **THEN** 可以取得「海峡線・北海道新幹線」的海底隧道段

#### Scenario: 台灣的鐵路
- **WHEN** App 需要台北車站一帶的鐵路資料
- **THEN** 可以取得台鐵與高鐵的路線

#### Scenario: 未涵蓋的地區
- **WHEN** 缺口位於尚未涵蓋的地區
- **THEN** 該缺口不補齊、維持缺口樣式，App 其他功能不受影響

### Requirement: 自動定期更新
鐵路網資料 SHALL 每月自動從 OpenStreetMap 重新產生並部署，不需要人工操作；產生失敗時 MUST 保留上一版資料繼續提供。

#### Scenario: 每月更新
- **WHEN** 每月排定的時間到了
- **THEN** 系統自動產生新的鐵路網資料並部署到網站

#### Scenario: 產生失敗
- **WHEN** 某次產生過程失敗
- **THEN** 網站繼續提供上一版鐵路網資料

### Requirement: 只取得缺口附近的資料
鐵路網資料 SHALL 依經緯度切成網格，App 只下載缺口附近需要的網格，不下載整個地區的資料。

#### Scenario: 補齊苫小牧到札幌
- **WHEN** App 補齊苫小牧到札幌的缺口
- **THEN** 只下載涵蓋該缺口周圍的少數網格，總量在 2 MB 以內

### Requirement: 快速且可重複使用
App SHALL 在裝置上保留已下載的網格；同一網格再次需要時 MUST 直接使用保留的資料。

#### Scenario: 第一次補齊的速度
- **WHEN** 在 iPhone 上第一次匯入 `Day1+2.kml`
- **THEN** 苫小牧到札幌的缺口在 5 秒內補齊

#### Scenario: 再次匯入同一趟旅程
- **WHEN** 使用者再次匯入 `Day1+2.kml`
- **THEN** 補齊所需的網格不再重新下載
