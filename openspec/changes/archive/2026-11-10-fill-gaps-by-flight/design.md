# Design

## Context

- `useRailFills` 對每個缺口呼叫 `tilesForGap`（超過 `RAIL_FILL.maxGapKm` 300 km 回傳 null，不載入網格），再以 `fillGapAlongRail` 判斷；鐵路判斷已用時速 10–400 km/h 排除不合理的情況。
- 補齊結果 `RailFill` 帶 `mode: 'rail'`、`path`、`lengthKm`、`routeNames`、`remainders`；`toOverlayFeatures` 把 `path` 放進 `inferred` 圖層，`GapPanel` 直接讀 `routeNames`。
- 實測資料（見 proposal）：Coron 航程的缺口時速 179–493 km/h；日本四極點的新幹線隧道缺口時速約 200–300 km/h，前後記錄也是高速。

## Goals / Non-Goals

**Goals:**
- 飛機判斷與大圓航線是純函式，放在 `src/core/flight.ts`，不需要任何下載
- 鐵路與飛機共用一個補齊結果型別，地圖、列表、圖例依 `mode` 分支
- 新幹線缺口的判斷結果與現在完全相同

**Non-Goals:**
- 機場位置、航班資料
- 依實際起降時間切分缺口（例如在機場等待的時間）

## Decisions

### 1. 判斷順序：先排除高鐵，再看前後速度

規格中的順序（≥ 350 → 鐵路 → 前後高速 → ≥ 300 km）是為了不把新幹線誤判成飛機：新幹線缺口的時速與前後記錄都可能超過 200 km/h，若先看前後速度就會誤判。350 km/h 高於所有營運中高鐵的平均時速，可以安全地跳過鐵路；但短缺口的平均時速受 GPS 誤差影響很大（實測東海道新幹線上 1.5 km、14 秒就算出 382 km/h），因此規則 1 另外要求直線距離 ≥ 10 km，較短的缺口一律先試鐵路。替代方案「只看速度門檻」無法處理起降前後時速 150–300 km/h 的缺口（Coron 降落前 179 km/h）。

### 2. 前後記錄的速度

從缺口端點往外取最多 60 秒的實際記錄點，以「累積距離 ÷ 時間差」計算平均時速；前或後任一側 ≥ 200 km/h 即成立。需要時間資料；沒有時間的點不計。60 秒在 300 km/h 下約 5 km，足以避開地面滑行。

### 3. 大圓航線

`greatCirclePath(from, to)` 用球面線性插值，每 50 km 一點（至少 2 點，最多 200 點）。經度依前一點展開（允許超出 ±180），MapLibre 會正確畫出跨換日線的線段，不會繞到地球另一側。推算長度用兩端的大圓距離（與 `distanceKm` 一致）。

### 4. 型別：`GapFill`

```ts
type GapFill =
  | RailFill                                   // mode: 'rail'
  | { gapId; mode: 'flight'; path; lengthKm; remainders: []; basis: FlightBasis }
type FlightBasis = { kind: 'speed'; speedKmh: number } | { kind: 'distance'; distanceKm: number }
```

放在 `src/core/fill.ts`，`RailFill` 保留在 `rail/fill.ts`。`useRailFills` 改名為 `useGapFills`，`fills` 的型別改為 `ReadonlyMap<string, GapFill>`。飛機缺口沒有 `remainders`：兩端就是起降附近的實際記錄，整段都是推算。

### 5. 在補路流程中的位置

`useGapFills` 處理每個缺口時：
1. `flightBySpeed(track, gap)`：≥ 350 km/h 時立即產生飛機補齊，不載入網格
2. 照舊載入網格並 `fillGapAlongRail`
3. 鐵路失敗時 `flightAfterRail(track, gap)` 檢查規則 3、4

規則 4 的缺口（≥ 300 km）`tilesForGap` 本來就回傳 null，因此不會多下載網格。鐵路網格下載失敗（網路錯誤）時不套用規則 3、4，避免離線時把火車判成飛機；下次調整門檻或重新開啟時再試。

### 6. 地圖樣式

`inferred` 圖層的 feature 加上 `mode` 屬性，以 `match` 表達式設定顏色：鐵路維持紫色圓點線；飛機用青色（`#0891b2`）較長的虛線。兩者都與藍色實線、橘色缺口虛線不同。圖例新增一列。

## Risks / Trade-offs

- [長途開車或夜間巴士且 GPS 全斷、超過 300 km] 會被畫成飛機 → 樣式與依據都清楚標示為推算，使用者可以看到原因；使用者已同意這個取捨。
- [沒有時間資料的 50–300 km 缺口] 鐵路補不了時維持缺口，即使實際是短程航班 → 可接受，之後可用機場資料補強。
- [相鄰缺口都是飛機] 斷斷續續的航程會畫成多段各自的大圓線，中間夾著實際記錄 → 與實際一致，不合併。
- [大圓線點數] 1 萬 km 約 200 點，數百個飛機缺口也只有數萬點 → 疊加圖層仍小。

## Migration Plan

純前端變更，沒有資料轉換。已保存的旅程重新開啟時會照新規則補齊。
