# Real surroundings (OpenStreetMap)

`monaco.json`, `spa.json`, `monza.json` and `suzuka.json` are everything round those circuits
(buildings, land use, forests, water, streets, railways, trees, landmarks), downloaded by
`node tools/fetch-osm.mjs` (the queries and the box round each circuit are in that script; only the
tags the game uses are kept). The lie of the land round them is in `../dem/`, from
`node tools/fetch-dem.mjs` (Open Topo Data: EU-DEM 25 m, SRTM 30 m for Suzuka).

`jeddah.json` and `jeddah-lagoon.json` are OpenStreetMap data around the Jeddah Corniche Circuit,
and `daytona.json` around Daytona International Speedway (Lake Lloyd, the grandstand, the infield
buildings), downloaded from the Overpass API. `node tools/build-places.mjs` turns them into `js/places.js`.

Map data © OpenStreetMap contributors, available under the Open Database Licence (ODbL):
https://www.openstreetmap.org/copyright

The Overpass queries used are noted at the top of `tools/build-places.mjs`.

`*-roads.json` are the mapped roads and raceways of each venue, for tracing the circuits' other
layouts (`tools/route-layouts.mjs`). Overpass queries (maps.mail.ru mirror), for example:

    [out:json][timeout:120];way["highway"="raceway"](45.605,9.275,45.635,9.300);out geom;       (Monza)
    [out:json][timeout:120];way["highway"~"raceway|primary|secondary|tertiary|trunk|unclassified|residential"](43.728,7.412,43.742,7.432);out geom;   (Monaco)

Daytona, Spa, Suzuka and Jeddah use the raceway query with a box round the venue (Monaco needs its
streets too, trimmed to the harbour half). `out geom` keeps the node ids, so the ways join up.
