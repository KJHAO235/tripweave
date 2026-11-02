import { useState } from 'react'
import { formatDateRange } from '../core/format'
import type { FileMeta } from '../storage/tripStore'

interface Props {
  /** 依合併順序排列 */
  files: FileMeta[]
  onRemove: (fileId: string) => void
}

/** 底部面板中旅程包含的檔案；預設收合，避免擠掉缺口列表 */
export function FileList({ files, onRemove }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <div className="file-list">
      <button className="file-list-toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>檔案 {files.length} 個</span>
        <span className="panel-toggle">{open ? '收合' : '展開'}</span>
      </button>
      {open && (
        <ol>
          {files.map((file) => {
            const { pointCount, firstTime, lastTime } = file.summary
            return (
              <li key={file.id}>
                <div className="file-info">
                  <span className="file-title">{file.name}</span>
                  <span className="meta">
                    {firstTime !== undefined && `${formatDateRange(firstTime, lastTime!)} · `}
                    {pointCount.toLocaleString()} 點
                  </span>
                </div>
                <button className="file-remove" onClick={() => onRemove(file.id)} aria-label={`移除 ${file.name}`}>
                  ✕
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
