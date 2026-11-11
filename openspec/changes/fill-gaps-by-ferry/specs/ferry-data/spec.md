# Spec Delta

## Purpose

提供沿渡輪航線補路所需的航線資料，讓 App 能快速、免費、不洩漏位置地取得缺口附近的渡輪航線，並隨 OpenStreetMap 每月更新。

## ADDED Requirements

### Requirement: 渡輪航線的來源
渡輪航線資料 SHALL 來自 OpenStreetMap 中標示為渡輪航線（`route=ferry`）的線段，保留航線名稱，並沿用 App 中既有的 OpenStreetMap 貢獻者標示。

#### Scenario: Coron 到 El Nido 的航線
- **WHEN** App 需要 Coron 與 El Nido 之間海域的渡輪資料
- **THEN** 可以取得連接 Coron 一帶與 El Nido 一帶的渡輪航線

### Requirement: 涵蓋地區與鐵路相同
渡輪航線資料 SHALL 涵蓋與鐵路資料相同的地區清單，新增地區時兩者一起擴充，不需要修改 App 程式。

#### Scenario: 未涵蓋或沒有航線的地區
- **WHEN** 缺口附近沒有任何渡輪航線資料
- **THEN** 該缺口不以渡輪補齊，其他判斷照常進行

### Requirement: 與鐵路資料一起每月更新
渡輪航線資料 SHALL 與鐵路資料在同一次排程中產生並部署；產生失敗時 MUST 保留上一版資料繼續提供，渡輪資料缺少時 App 其他功能不受影響。

#### Scenario: 網站上還沒有渡輪資料
- **WHEN** 網站部署時找不到渡輪資料
- **THEN** 網站照常部署，鐵路與飛機補齊照常運作

### Requirement: 依網格取得渡輪資料
渡輪航線資料 SHALL 切成與鐵路相同的網格，App 只下載缺口附近需要的網格，且只向 TripWeave 自己的網站請求。

#### Scenario: 補齊一個渡輪缺口
- **WHEN** App 判斷 Coron 到 El Nido 船程中的一個缺口
- **THEN** 只下載涵蓋該缺口周圍的渡輪網格，請求只發往 TripWeave 自己的網站
