import type { ParseXml } from './core/parse/trackFile'

// 瀏覽器的 DOMParser 遇到格式錯誤不會丟出例外，而是產生 <parsererror>，由 core 負責檢查
export const parseXmlInBrowser: ParseXml = (text) => new DOMParser().parseFromString(text, 'application/xml')
