# relive-app

這是一個類似 Relive 的旅程回顧工具，目標是在 iPhone 上使用，可以把 GPS 軌跡和照片做成地圖動畫。

和 Relive 最大的不同是「重建」：遇到隧道、訊號中斷、飛機等情況，不會直接拉成直線，而是推測當時的交通方式，沿著鐵路、道路或航線補齊，並清楚標示哪些路段是推算出來的。

## 目前進度

開發中。第一階段：匯入軌跡、在地圖上顯示，並找出訊號中斷造成的缺口。

## 預計功能

- 匯入 GPS 軌跡紀錄（KML、GPX）
- 匯入/選取旅程照片
- 自動產生路線 + 照片的地圖動畫
- 輸出/分享動畫影片
- 補足訊號中斷的路段（例如山洞、隧道、飛機上），讓軌跡不會斷掉或變成直線

## 技術

- 網頁 PWA，在 iPhone Safari 開啟並「加入主畫面」使用
- Vite + React + TypeScript
- 地圖：MapLibre GL JS + OpenFreeMap 圖磚
- 部署：GitHub Pages

## 開發

需要 Node.js 24 以上。

```sh
npm install       # 安裝依賴
npm run dev       # 啟動開發伺服器
npm test          # 執行測試
npm run build     # 建置正式版本到 dist/
```

測試資料放在 `test-data/`。
