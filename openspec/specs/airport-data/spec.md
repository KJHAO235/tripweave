# airport-data Specification

## Purpose

提供飛機缺口對到實際機場所需的機場位置與名稱，讓 App 能在裝置上判斷缺口兩端附近的機場，而不需向第三方送出位置。

## Requirements

### Requirement: 機場資料的來源與範圍
機場資料 SHALL 來自 OurAirports，只收錄有定期航班且有 IATA 代碼的機場，每個機場包含 IATA 代碼、名稱、所在城市與座標。

#### Scenario: 涵蓋主要與地方機場
- **WHEN** 查詢機場資料
- **THEN** 包含成田（NRT）、羽田（HND）、那霸（OKA）、馬尼拉（MNL）、Busuanga（USU）與 El Nido（ENI）

#### Scenario: 不收錄沒有定期航班的機場
- **WHEN** 某個機場沒有定期航班或沒有 IATA 代碼
- **THEN** 不在機場資料中

### Requirement: 以腳本重新產生
機場資料 SHALL 由專案內的腳本從 OurAirports 的公開資料產生，產生結果存放在專案中隨網站部署；重新產生不需要修改 App 程式。

#### Scenario: 更新機場資料
- **WHEN** 開發者執行產生腳本
- **THEN** 機場資料檔依最新的 OurAirports 資料更新

### Requirement: 從自己的網站取得
App SHALL 只從 TripWeave 自己的網站下載機場資料，且只在第一次需要對到機場時下載一次；下載失敗時 MUST NOT 影響其他補齊。

#### Scenario: 補齊飛機缺口時的網路請求
- **WHEN** App 補齊 Coron 航程的飛機缺口
- **THEN** 機場資料只向 TripWeave 自己的網站請求一次

#### Scenario: 機場資料下載失敗
- **WHEN** 機場資料無法下載
- **THEN** 飛機缺口照原本從端點畫大圓航線，鐵路與渡輪補齊不受影響
