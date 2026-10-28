interface Props {
  onFile: (file: File) => void
}

export function ImportButton({ onFile }: Props) {
  return (
    <label className="import-button">
      匯入軌跡
      {/* 不設定 accept：iOS 對 .kml / .gpx 沒有內建類型，設定後檔案可能無法點選 */}
      <input
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // 清空選取，讓同一個檔案可以再次匯入
          event.target.value = ''
          if (file) onFile(file)
        }}
      />
    </label>
  )
}
