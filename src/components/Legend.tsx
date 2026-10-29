export function Legend() {
  return (
    <div className="legend" aria-label="圖例">
      <span>
        <span className="swatch recorded" />
        實際記錄
      </span>
      <span>
        <span className="swatch inferred" />
        推算（鐵路）
      </span>
      <span>
        <span className="swatch gap" />
        缺口
      </span>
      <small>鐵路資料 © OpenStreetMap 貢獻者</small>
    </div>
  )
}
