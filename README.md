# Dead on Disabled Bays

Finding disabled parking bays across Belfast.

A mobile-friendly map and list of Belfast's on-street disabled parking bays,
council car parks, and hospital and shopping centre car parks, with search,
filters and "near me". Live site: https://kyleboyd.github.io/dead-on-disabled-bays/

Bay details come from legal orders and have not been checked on the ground.

## How it is built

- `docs/` is the website, published with GitHub Pages. It has no backend.
- `data/` holds the source data files.
- `tools/build_data.py` rebuilds `docs/assets/places.json` from the files in
  `data/`. Run `python3 tools/build_data.py` after changing the data.

To run it locally:

```bash
python3 -m http.server 8123 --directory docs
```

Then open http://localhost:8123.

## Licences

The code is under the [MIT licence](LICENSE). The data is under the Open
Database License, the Inter font under the SIL Open Font License, and the
brand is all rights reserved. See [LICENSES.md](LICENSES.md) for which files
each covers and the credits the data requires.
