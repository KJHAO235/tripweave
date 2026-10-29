export function Legend() {
  return (
    <aside className="legend" aria-label="圖例">
      <div>
        <span className="swatch recorded" />
        實際記錄
      </div>
      <div>
        <span className="swatch inferred" />
        推算（鐵路）
      </div>
      <div>
        <span className="swatch gap" />
        缺口
      </div>
      <small>鐵路資料 © OpenStreetMap 貢獻者</small>
    </aside>
  )
}
