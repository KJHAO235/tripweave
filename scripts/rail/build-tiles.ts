const USAGE = `用法：node scripts/rail/build-tiles.ts --out <輸出資料夾> <鐵路 OPL 檔> [更多 OPL 檔...]

把 osmium 輸出的鐵路 OPL（含節點座標）轉成 rail/v1 網格資料。`

function main(argv: string[]) {
  if (argv.length === 0 || argv.includes('--help')) {
    console.log(USAGE)
    return
  }
  throw new Error('尚未實作')
}

main(process.argv.slice(2))
