# Circuit data

Real-world centrelines of the five Formula 1 circuits and the Daytona oval, used by
`tools/build-circuits.mjs` to make `js/circuits.js`.

- `*.geojson`: circuit centrelines from [bacinger/f1-circuits](https://github.com/bacinger/f1-circuits)
  (MIT licence, see `LICENSE-f1-circuits.md`). Each is a line in race direction.
- `monza-osm.geojson`, `daytona-osm.geojson`: the Monza Grand Prix circuit and the Daytona
  2.5-mile oval, OpenStreetMap `highway=raceway` ways joined into one loop in race direction
  (© OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright). Much finer than
  the older outline Monza used before (`it-1922.geojson`, kept for reference): every chicane is mapped.
- `*-elev.json`: elevation along each circuit, from [Open Topo Data](https://www.opentopodata.org/)
  (EU-DEM 25 m for Monaco, Spa and Monza; SRTM 30 m for Suzuka and Jeddah). Cached so the
  build doesn't need to download it again.
