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
        <span className="swatch inferred ferry" />
        推算（渡輪）
      </span>
      <span>
        <span className="swatch inferred flight" />
        推算（飛機）
      </span>
      <span>
        <span className="swatch gap" />
        缺口
      </span>
      <small>鐵路與渡輪資料 © OpenStreetMap 貢獻者</small>
      {/* 版本資訊放在這裡，避免與工具列的旅程摘要重疊 */}
      <small>build {__BUILD_TIME__}</small>
    </div>
  )
}
