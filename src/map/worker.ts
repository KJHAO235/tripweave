import { setWorkerUrl } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

// MapLibre 預設以自身模組的位置推算 worker 網址，經 Vite 打包後會找不到檔案，因此明確指定
setWorkerUrl(workerUrl)
