# Licences

Different parts of this repository are under different terms, because some of
it is original work and some comes from other people's data and fonts.

| Part | Files | Licence |
|---|---|---|
| Code | `docs/index.html`, `docs/assets/*.js`, `docs/assets/*.css`, `data/*.py`, `tools/*.py` | [MIT](LICENSE) |
| Bay and car park data | `data/*.csv`, `data/*.geojson`, `docs/assets/places.json` | [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/) (ODbL), with the source notices below |
| Inter font | `docs/assets/fonts/` | [SIL Open Font License 1.1](docs/assets/fonts/Inter-LICENSE.txt) |
| Panel photo | `docs/assets/hw-cranes.jpg` | [CC BY-NC-SA 2.0](https://creativecommons.org/licenses/by-nc-sa/2.0/), “H&W Gantry cranes in Belfast” by IHNIWIMD ([source](https://www.flickr.com/photos/ihniwimd/12056827616)), cropped on screen. Non-commercial use only, unlike the code |
| Brand | the name "Dead on Disabled Bays", the wordmark, `brand/`, `data/DESIGN_SYSTEM.md`, `data/tokens.json` | All rights reserved, Kyle Boyd |

## Why the data is under the ODbL

The map positions of the on-street bays were worked out from OpenStreetMap
street data. OpenStreetMap is licensed under the ODbL, which requires any
database derived from it to be shared under the same licence. The position
columns therefore make these files a derived database, and the whole data set
is offered under the ODbL so it can be reused in one piece.

If you reuse the data you must credit OpenStreetMap and the other sources
below, and share any database you derive from it under the ODbL.

## Source notices

- **On-street bays.** From the Parking Places (Disabled Persons' Vehicles)
  Order (Northern Ireland) 2016 and its amending orders, published on
  legislation.gov.uk. Contains public sector information licensed under the
  [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).
- **Bay positions.** Derived from OpenStreetMap.
  © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL 1.0.
- **Council car parks.** Belfast City Council open data. Contains public
  sector information licensed under the Open Government Licence v3.0.
- **Hospital car parks.** Blue Badge bay counts as published on the Belfast
  Health and Social Care Trust's car parking pages.
- **Shopping centre car parks.** Blue Badge bay counts as published by each
  centre and in AccessAble access guides.

Only facts (locations and counts) are taken from the hospital and shopping
centre sources; no text or images from them are reproduced.

## Not in this repository

- **Roc Grotesk**, the wordmark font, is served by Adobe Fonts under Adobe's
  terms for the site owner's web project. It is not included here and is not
  covered by any licence in this repository.
- **MapLibre GL JS** (BSD 3-Clause) and the **OpenFreeMap** map tiles are
  loaded from their own servers when the site runs.

## The wheelchair icon

The icon in `brand/` is the site's own drawing based on the Accessible Icon
Project symbol, which its creators released into the public domain. Its use
in this brand is reserved with the rest of the brand.

This file explains the intended terms; it is not legal advice.
