#!/usr/bin/env python3
"""Geocode Belfast on-street disabled bays from junction + offset descriptions.

Usage: python3 geocode_bays.py <bays.csv> <out_dir> [osm_cache.json]

Downloads every named street in Belfast from OpenStreetMap (one Overpass query,
cached), finds where each bay's street meets its reference junction, then walks
the stated distance along the street in the stated compass direction.
"""
import csv, json, math, os, re, sys, difflib, urllib.request, urllib.parse

BBOX = (54.52, -6.10, 54.69, -5.78)
OVERPASS = ["https://overpass-api.de/api/interpreter",
            "https://overpass.private.coffee/api/interpreter",
            "https://overpass.kumi.systems/api/interpreter"]
LAT0 = 54.6
MX = 111320 * math.cos(math.radians(LAT0))
MY = 110574
COMPASS = {'north': 0, 'north-east': 45, 'east': 90, 'south-east': 135, 'south': 180,
           'south-west': 225, 'west': 270, 'north-west': 315}


def fetch_osm(cache):
    if os.path.exists(cache) and os.path.getsize(cache) > 10:
        return json.load(open(cache))
    # Download in small tiles so a busy server is less likely to time out.
    import time
    s, w, n, e = BBOX
    rows_, cols_ = 5, 5
    elements = {}
    tdir = os.path.join(os.path.dirname(os.path.abspath(cache)), 'osm_tiles')
    os.makedirs(tdir, exist_ok=True)
    for i in range(rows_):
        for k in range(cols_):
            tile = (s + (n - s) * i / rows_, w + (e - w) * k / cols_,
                    s + (n - s) * (i + 1) / rows_, w + (e - w) * (k + 1) / cols_)
            q = ('[out:json][timeout:90];way["highway"]["name"]'
                 '["highway"!~"^(footway|path|cycleway|steps|bridleway|track)$"](%f,%f,%f,%f);out geom;' % tile)
            data = urllib.parse.urlencode({'data': q}).encode()
            got, last = None, None
            tfile = os.path.join(tdir, 'tile_%d_%d.json' % (i, k))
            if os.path.exists(tfile):  # already downloaded on an earlier run
                for el in json.load(open(tfile))['elements']:
                    elements[el['id']] = el
                print('  tile %d/%d already saved' % (i * cols_ + k + 1, rows_ * cols_), flush=True)
                continue
            for attempt in range(9):
                url = OVERPASS[attempt % len(OVERPASS)]
                try:
                    import shutil, subprocess
                    if shutil.which('curl'):
                        # The system curl handles modern TLS that older Python builds cannot.
                        res = subprocess.run(['curl', '-sS', '--fail', '--max-time', '150',
                                              '-A', 'belfast-disabled-bays-geocoder/1.0',
                                              '--data-urlencode', 'data=' + q, url],
                                             capture_output=True)
                        if res.returncode != 0:
                            raise RuntimeError(res.stderr.decode('utf-8', 'replace').strip() or 'curl exit %d' % res.returncode)
                        got = json.loads(res.stdout)
                    else:
                        req = urllib.request.Request(url, data=data, headers={'User-Agent': 'belfast-disabled-bays-geocoder/1.0'})
                        with urllib.request.urlopen(req, timeout=150) as r:
                            got = json.loads(r.read())
                    if 'elements' in got:
                        break
                    got = None
                except Exception as ex:  # busy server: wait, then try the next mirror
                    last = ex
                    print('  tile %d/%d: %s busy (%s), retrying...' % (i * cols_ + k + 1, rows_ * cols_, url.split('/')[2], ex), flush=True)
                    time.sleep(8 + 6 * attempt)
            if got is None:
                raise SystemExit('Could not download street data from OpenStreetMap: %r\nThe servers are busy; wait a few minutes and run the same command again. Tiles already downloaded are kept, so it carries on from where it stopped.' % last)
            json.dump(got, open(tfile, 'w'))
            for el in got['elements']:
                elements[el['id']] = el
            print('  tile %d/%d downloaded (%d streets so far)' % (i * cols_ + k + 1, rows_ * cols_, len(elements)), flush=True)
            time.sleep(2)
    js = {'elements': list(elements.values())}
    json.dump(js, open(cache, 'w'))
    return js


def norm(name):
    n = name.lower()
    n = re.sub(r"\(.*?\)", " ", n)
    n = n.split(',')[0]
    n = n.replace("'", "").replace("’", "").replace(".", "")
    n = re.sub(r"\bsaint\b", "st", n)
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def xy(lat, lon):
    return ((lon + 5.93) * MX, (lat - LAT0) * MY)


def latlon(x, y):
    return (LAT0 + y / MY, -5.93 + x / MX)


def bearing(a, b):
    return math.degrees(math.atan2(b[0] - a[0], b[1] - a[1])) % 360


def angdiff(a, b):
    d = abs(a - b) % 360
    return min(d, 360 - d)


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


class Streets:
    def __init__(self, osm):
        self.ways = {}      # norm name -> list of node-id lists
        self.pos = {}       # node id -> (x, y)
        for el in osm['elements']:
            if el.get('type') != 'way' or 'geometry' not in el:
                continue
            nm = norm(el['tags'].get('name', ''))
            if not nm:
                continue
            for nid, g in zip(el['nodes'], el['geometry']):
                self.pos[nid] = xy(g['lat'], g['lon'])
            self.ways.setdefault(nm, []).append(el['nodes'])
        self.names = sorted(self.ways)

    def resolve(self, name):
        """Return (norm name or None, matched-how)."""
        n = norm(name)
        if not n:
            return None, ''
        if n in self.ways:
            return n, 'exact'
        m = difflib.get_close_matches(n, self.names, n=1, cutoff=0.88)
        if m:
            return m[0], 'fuzzy'
        return None, ''

    def nodes(self, nm):
        s = set()
        for w in self.ways[nm]:
            s.update(w)
        return s

    def graph(self, nm):
        g = {}
        for w in self.ways[nm]:
            for a, b in zip(w, w[1:]):
                g.setdefault(a, set()).add(b)
                g.setdefault(b, set()).add(a)
        return g

    def junction(self, s, j):
        """Node on street s where it meets street j. Returns (node, kind, count)."""
        shared = self.nodes(s) & self.nodes(j)
        if shared:
            return sorted(shared)[0], 'shared', len(shared)
        best = None
        jn = [self.pos[n] for n in self.nodes(j)]
        for n in self.nodes(s):
            p = self.pos[n]
            d = min(dist(p, q) for q in jn)
            if best is None or d < best[0]:
                best = (d, n)
        if best and best[0] <= 40:
            return best[1], 'near', 1
        return None, '', 0

    def walk(self, s, start, direction, metres):
        """Walk along street s from node start. Returns ((x, y), heading, reached)."""
        g = self.graph(s)
        p = self.pos[start]
        nbrs = list(g.get(start, []))
        if not nbrs:
            return p, None, False
        target = COMPASS[direction]
        nxt = min(nbrs, key=lambda n: angdiff(bearing(p, self.pos[n]), target))
        head = bearing(p, self.pos[nxt])
        if angdiff(head, target) > 100:   # street does not run that way from here
            return p, head, False
        prev, cur, left = start, nxt, metres
        a = p
        seen = {start}
        while True:
            b = self.pos[cur]
            seg = dist(a, b)
            head = bearing(a, b) if seg > 0 else head
            if seg >= left:
                t = left / seg if seg else 0
                return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), head, True
            left -= seg
            seen.add(cur)
            opts = [n for n in g.get(cur, []) if n not in seen]
            if not opts:
                return b, head, False
            nx = min(opts, key=lambda n: angdiff(bearing(b, self.pos[n]), head))
            a, prev, cur = b, cur, nx

    def centroid(self, s):
        pts = [self.pos[n] for n in self.nodes(s)]
        return (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def parse_offset(off):
    """First leg only: returns (metres or None, direction or None, multi_leg)."""
    legs = re.findall(r'([\d.]+)\s*m(?:\s+(north-east|north-west|south-east|south-west|north|south|east|west))?', off)
    if not legs:
        return None, None, False
    m, d = legs[0]
    return float(m), (d or None), len(legs) > 1


def side_dir(position):
    m = re.match(r'\s*(north-east|north-west|south-east|south-west|north|south|east|west)', position)
    return m.group(1) if m else None


def geocode(st, row):
    street, junc = row['Street'], row['Measured from junction with']
    off, length, position = row['Offset from junction'], row['Length (m)'], row['Position']
    s, how_s = st.resolve(street)
    if not s:
        return None, 'Not found', 'Street name not found in OpenStreetMap'
    notes = []
    if how_s == 'fuzzy':
        notes.append('street matched to "%s"' % s)
    j = None
    for part in re.split(r'\s*/\s*', junc):
        j, how_j = st.resolve(part)
        if j and j != s:
            if how_j == 'fuzzy':
                notes.append('junction matched to "%s"' % j)
            break
        j = None
    if not j:
        return st.centroid(s), 'Street only', '; '.join(notes + ['junction street not found; point is the middle of the street'])
    node, kind, count = st.junction(s, j)
    if node is None:
        return st.centroid(s), 'Street only', '; '.join(notes + ['streets do not meet in OpenStreetMap; point is the middle of the street'])
    if kind == 'near':
        notes.append('streets do not share a point; nearest approach used')
    if count > 1:
        notes.append('streets meet at %d points; first used' % count)
    metres, direction, multi = parse_offset(off)
    base = st.pos[node]
    if metres is None or direction is None:
        return base, 'Junction only', '; '.join(notes + ['no usable offset or direction; point is the junction'])
    try:
        half = float(length) / 2 if length else 0
    except ValueError:
        half = 0
    pt, head, reached = st.walk(s, node, direction, metres + half)
    quality = 'Junction + offset'
    if multi:
        quality = 'Approximate'
        notes.append('multi-leg offset; only the first leg followed')
    if not reached:
        quality = 'Approximate'
        notes.append('could not follow the full offset along the street')
    if kind == 'near' or count > 1:
        quality = 'Approximate' if quality != 'Junction + offset' or count > 1 or kind == 'near' else quality
    sd = side_dir(position)
    if sd and head is not None:
        cands = [(head + 90) % 360, (head - 90) % 360]
        nb = min(cands, key=lambda b: angdiff(b, COMPASS[sd]))
        r = math.radians(nb)
        pt = (pt[0] + 3.5 * math.sin(r), pt[1] + 3.5 * math.cos(r))
    return pt, quality, '; '.join(notes)


def main():
    src, out_dir = sys.argv[1], sys.argv[2]
    cache = sys.argv[3] if len(sys.argv) > 3 else os.path.join(out_dir, 'osm_belfast_streets.json')
    os.makedirs(out_dir, exist_ok=True)
    st = Streets(fetch_osm(cache))
    rows = list(csv.DictReader(open(src, newline='', encoding='utf-8')))
    stats = {}
    feats = []
    for r in rows:
        pt, quality, note = geocode(st, r)
        if pt:
            lat, lon = latlon(*pt)
            ok = BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lon <= BBOX[3]
            r['Latitude'], r['Longitude'] = ('%.6f' % lat, '%.6f' % lon) if ok else ('', '')
        else:
            r['Latitude'] = r['Longitude'] = ''
        r['Geocode quality'], r['Geocode note'] = quality, note
        stats[(r['Status'], quality)] = stats.get((r['Status'], quality), 0) + 1
        if r['Latitude'] and r['Status'] == 'Current':
            props = {k: v for k, v in r.items() if k not in ('Latitude', 'Longitude')}
            feats.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [float(r['Longitude']), float(r['Latitude'])]}, 'properties': props})
    fields = list(rows[0].keys())
    with open(os.path.join(out_dir, 'belfast_onstreet_bays_geocoded.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    with open(os.path.join(out_dir, 'belfast_onstreet_bays_current.geojson'), 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': feats}, f)
    print('streets in OSM extract:', len(st.names))
    for k in sorted(stats):
        print(k[0], '|', k[1], '|', stats[k])


if __name__ == '__main__':
    main()
