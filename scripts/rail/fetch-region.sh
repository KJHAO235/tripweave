#!/usr/bin/env bash
# 下載一個 Geofabrik 地區，只留下鐵路，輸出含節點座標的 OPL。
# 用法：scripts/rail/fetch-region.sh <地區，例如 asia/japan> <工作資料夾>
set -euo pipefail

region="$1"
workdir="$2"
name="${region//\//_}"
user_agent="TripWeave/0.1 (https://github.com/KJHAO235/tripweave)"

mkdir -p "$workdir"
pbf="$workdir/$name.osm.pbf"
rail_pbf="$workdir/$name.rail.osm.pbf"
opl="$workdir/$name.rail.opl"

curl --fail --location --silent --show-error --retry 3 \
  --user-agent "$user_agent" \
  --output "$pbf" "https://download.geofabrik.de/$region-latest.osm.pbf"

# 種類需與 design 第 2 節一致；tags-filter 會一併保留 way 引用的節點
osmium tags-filter "$pbf" \
  w/railway=rail,subway,light_rail,narrow_gauge,monorail \
  --overwrite --output "$rail_pbf"
rm -f "$pbf"

osmium add-locations-to-ways "$rail_pbf" --overwrite --output "$opl"
rm -f "$rail_pbf"

echo "$opl"
