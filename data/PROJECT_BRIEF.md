# Dead On Disabled Bays: project brief

A handover for building the app in Claude Code. Written 13 November 2026.

## Goal

A mobile-friendly website that helps Blue Badge holders find disabled parking bays in Belfast.

## Decisions already made

- **App type:** a website that works in any phone or desktop browser. No install, no native app.
- **First-version features:**
  1. See all bays on a map.
  2. Find bays near me, using the phone's location, listed by distance.
  3. Filter the bays (time limit, type of location, how reliable the position is).
  4. Search by street or place.
- **Design:** follow `DESIGN_SYSTEM.md` in this folder (brand colours, type, spacing, component and accessibility rules, supplied by the owner from Figma). It is a written summary; the Figma file itself has not been shared, so ask for it if you need component detail.

- **No reporting.** `DESIGN_SYSTEM.md` mentions a "civic reporting experience" and report statuses. The owner has said to ignore the reporting function: do not build report forms, report statuses or anything that stores user submissions. Apply the rest of the design system as written.

## Not decided yet

- Framework and hosting. The data is small (about 600 rows), so a static site with no backend is enough. A plain HTML/JS page with a map library such as Leaflet or MapLibre is a reasonable starting point; ask the owner before choosing.
- Whether removed bays are shown at all (suggest: no, keep them only in the data).
- How to present bays whose position is only approximate.

## Data files (all in this `data` folder)

| File | What it is | Rows |
|---|---|---|
| `belfast_onstreet_bays_geocoded_v2.csv` | Every on-street bay, current and removed, with coordinates | 609 |
| `belfast_onstreet_bays_current_v2.geojson` | Current on-street bays that have coordinates, as map points | 515 |
| `council_car_parks.csv` | Belfast City Council car parks with coordinates and blue badge counts | 30 |
| `hospitals_shopping.csv` | Hospital and shopping centre car parks with blue badge counts; no coordinates | 25 |

Superseded, safe to ignore: `belfast_onstreet_bays.csv`, `belfast_onstreet_bays_geocoded.csv`, `belfast_onstreet_bays_current.geojson` (first geocoding pass, has some wrong placements).

Working files: `geocode_bays.py`, `geocode_v2.py`, `osm_belfast_streets.json`, `osm_tiles/` (the geocoder and its cached street download).

### On-street bay columns

- `ID`: stable identifier. `DFI-<n>` is item n in Schedule 1 of the 2016 Order; `DFI-S<schedule>-<n>` is a time-limited schedule; `CP-2022-1` is the Castle Place bay.
- `Status`: `Current` or `Removed`.
- `Street`, `Position` (side of street, sometimes a house number), `Measured from junction with`, `Offset from junction`, `Length (m)`: the bay as the legal order describes it.
- `Est. bays`: estimated number of spaces, from the length unless the order states a count. An estimate, not a fact.
- `Waiting limit`: `Unlimited` or a time limit with days and hours.
- `Schedule`, `Item no.`, `Added by`, `In force from`, `Removed by`: where the bay sits in the legislation.
- `Notes`: caveats on that row.
- `Latitude`, `Longitude`: WGS84. Blank for 8 current bays.
- `Geocode quality`: see below.
- `Geocode note`: why a row is not a clean match.

### Geocode quality (current bays)

| Value | Count | Meaning |
|---|---|---|
| Junction + offset | 456 | Walked the stated distance along the street from the stated junction. Expected within about 10 m, not verified on the ground. |
| Approximate | 37 | Junction found but the description could not be followed exactly. |
| Junction only | 4 | Placed at the junction; the order gave no usable distance or direction. |
| Street only | 18 | Placed at the middle of the street; can be hundreds of metres out. |
| Not found | 8 | No coordinates: Albion Street, Ardcarn Park, Blackmountain Walk, Carlisle Terrace, Edenvale Grove, Ferndale Court, New Farm Lane, Rotterdam Court. |

Suggestion: show "Street only" bays differently from precise ones, or list them without a pin.

## Known limits of the data

- **Not checked on the ground.** Bays come from legal orders, read automatically from PDFs. A bay in the order may have been moved, faded or never marked. No coordinate has been checked against a map or Street View.
- **Coverage:** the Parking Places (Disabled Persons' Vehicles) Order (NI) 2016 and its 71 amending orders up to S.R. 2026 No. 158. Not included: 2026 Amendment Orders No. 4 and No. 5 (at consultation when compiled), and the Parking and Waiting Restrictions (Belfast) Order 2018, which may hold more city-centre bays.
- **"Belfast" means what the orders label Belfast.** Bays listed under Dunmurry, Dundonald, Newtownabbey or Holywood are excluded.
- **Specific rows to check:** DFI-562 (Soudan Street, no measurements); CP-2022-1 (Castle Place, offset and length); DFI-S6-31 and DFI-S6-32 (Upper Newtownards Road, days unconfirmed); DFI-2459 and DFI-3214 (Mount Merrion Drive, possibly one bay listed twice).
- **Council car parks:** the council's open dataset is undated and disagrees with its own web page for some car parks. A blank blue badge count means the dataset gives none, not that there are none.
- **Hospitals and shopping centres:** counts are as published by each operator. "Minimum (10+)" means an access guide reports ten or more. No coordinates. Supermarkets, retail parks, stations and private car parks are not covered.

## Sources and credits to show in the app

- On-street bays: Northern Ireland Statutory Rules on legislation.gov.uk, published by the Department for Infrastructure.
- Council car parks: Belfast City Council open data.
- Hospitals: Belfast Health and Social Care Trust car parking pages.
- Positions: derived from OpenStreetMap street data. OpenStreetMap requires a visible credit ("© OpenStreetMap contributors") on any map or data derived from it.

Check the licence terms of each source before publishing; this brief does not give legal advice.

## Suggested first steps in Claude Code

1. Read this brief and look at the four data files.
2. Ask the owner for the Figma design system and the open decisions above.
3. Build a first page: a map of the current on-street bays from the GeoJSON, plus council car parks.
4. Add "near me", filters and search.
5. Add a clear notice that positions and bay details are unverified and may be out of date.

## The spreadsheet

The same data, with sources, is in a Claude spreadsheet: https://claude.ai/artifact/BGHn1ikNSBfyf1kVA3E53V
