interface Props {
  label: string
  onFiles: (files: File[]) => void
}

export function ImportButton({ label, onFiles }: Props) {
  return (
    <label className="import-button">
      {label}
      {/* 不設定 accept：iOS 對 .kml / .gpx 沒有內建類型，設定後檔案可能無法點選 */}
      <input
        type="file"
        multiple
        onChange={(event) => {
          const files = [...(event.target.files ?? [])]
          // 清空選取，讓同一批檔案可以再次匯入
          event.target.value = ''
          if (files.length > 0) onFiles(files)
        }}
      />
    </label>
  )
}
