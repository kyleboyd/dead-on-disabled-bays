#!/usr/bin/env python3
"""Build docs/assets/places.json, the one data file the website loads.

Run from anywhere:  python3 tools/build_data.py

Reads (and never changes) these files in data/:
  belfast_onstreet_bays_geocoded_v2.csv   on-street bays (only Status = Current is used)
  council_car_parks.csv                   Belfast City Council car parks
  hospitals_shopping.csv                  hospital and shopping centre car parks (no coordinates)
  site_locations.csv                      map positions for the hospital and shopping sites (the site, not each car park)
  street_fallbacks.csv                    street-level positions for bays whose street the geocoder could not find
"""
import csv
import json
from collections import OrderedDict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "docs" / "assets" / "places.json"

# Geocode quality in the CSV -> the three levels the site shows.
QUALITY = {
    "Junction + offset": "good",    # pin
    "Approximate": "approx",        # pin, drawn differently
    "Junction only": "approx",      # pin, drawn differently
    "Street only": "street",        # no pin; coordinates kept for rough distance only
    "Not found": "none",            # no pin, no coordinates
}


def rows(name):
    with open(DATA / name, encoding="utf-8-sig", newline="") as f:
        return [{k: (v or "").strip() for k, v in r.items()} for r in csv.DictReader(f)]


def num(text):
    try:
        return float(text)
    except ValueError:
        return None


def whole(text):
    try:
        return int(text)
    except ValueError:
        return None


def street_bays():
    fallback = {r["street"]: r for r in rows("street_fallbacks.csv")}
    out = []
    for r in rows("belfast_onstreet_bays_geocoded_v2.csv"):
        if r["Status"] != "Current":
            continue
        q = QUALITY[r["Geocode quality"]]
        lat, lng = num(r["Latitude"]), num(r["Longitude"])
        note = r["Geocode note"]
        if lat is None or lng is None:
            q, lat, lng = "none", None, None
            fb = fallback.get(r["Street"])
            if fb:  # street-level only: somewhere on (or next to) this street
                q, lat, lng, note = "street", num(fb["latitude"]), num(fb["longitude"]), fb["how"]
        out.append({
            "id": r["ID"],
            "kind": "street",
            "name": r["Street"],
            "position": r["Position"],
            "junction": r["Measured from junction with"],
            "offset": r["Offset from junction"],
            "length": r["Length (m)"],
            "spaces": whole(r["Est. bays"]),
            "limit": r["Waiting limit"],
            "limited": r["Waiting limit"] != "Unlimited",
            "addedBy": r["Added by"],
            "inForce": r["In force from"],
            "notes": r["Notes"],
            "q": q,
            "qRaw": r["Geocode quality"],
            "qNote": note,
            "lat": lat,
            "lng": lng,
        })
    return out


def council():
    out = []
    for i, r in enumerate(rows("council_car_parks.csv"), 1):
        out.append({
            "id": f"BCC-{i}",
            "kind": "council",
            "name": r["name"],
            "address": r["address"],
            "postcode": r["postcode"],
            "badgeBays": whole(r["blue_badge_bays"]),
            "standardBays": whole(r["standard_bays"]),
            "hours": r["charged_hours"],
            "q": "good",
            "lat": num(r["latitude"]),
            "lng": num(r["longitude"]),
        })
    return out


def sites():
    located = {r["site"]: r for r in rows("site_locations.csv")}
    grouped = OrderedDict()
    for r in rows("hospitals_shopping.csv"):
        grouped.setdefault(r["site"], []).append(r)
    out = []
    for i, (site, rs) in enumerate(grouped.items(), 1):
        loc = located.get(site)
        lat = num(loc["latitude"]) if loc else None
        lng = num(loc["longitude"]) if loc else None
        out.append({
            "id": f"SITE-{i}",
            "kind": "hospital" if rs[0]["type"] == "Hospital" else "shopping",
            "name": site,
            "address": rs[0]["address"],
            "source": rs[0]["source"],
            "areas": [{
                "area": r["area"],
                "bays": whole(r["blue_badge_bays"]),
                "basis": r["count_basis"],
                "address": r["address"] if r["address"] != rs[0]["address"] else "",
                "notes": r["notes"],
            } for r in rs],
            # "site": the pin marks the hospital or centre, not each car park.
            "q": "site" if lat is not None else "none",
            "lat": lat,
            "lng": lng,
        })
    return out


def main():
    places = street_bays() + council() + sites()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"built": date.today().isoformat(), "places": places}, f,
                  ensure_ascii=False, separators=(",", ":"))
    kinds = {}
    for p in places:
        kinds[p["kind"]] = kinds.get(p["kind"], 0) + 1
    print(f"Wrote {OUT.relative_to(ROOT)}: {len(places)} places {kinds}")


if __name__ == "__main__":
    main()
