#!/usr/bin/env python3
"""Second-pass geocoder: stricter name matching, smarter junction choice.
Usage: python3 geocode_v2.py <bays.csv> <osm_cache.json> <out_dir>
"""
import csv, json, math, os, re, sys, difflib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import geocode_bays as g
from geocode_bays import COMPASS, angdiff, bearing, dist, latlon, norm, parse_offset, side_dir, BBOX


class Streets2(g.Streets):
    def resolve(self, name):
        n = norm(name)
        n = re.sub(r"\b(roundabout|junction)\b", "", n).strip()
        if not n:
            return None, ''
        if n in self.ways:
            return n, 'exact'
        alt = re.sub(r" service road$", "", n)
        if alt != n and alt in self.ways:
            return alt, 'fuzzy'
        m = difflib.get_close_matches(n, self.names, n=1, cutoff=0.90)
        if m and m[0].split()[-1] == n.split()[-1] and m[0][:1] == n[:1]:
            return m[0], 'fuzzy'
        # same words run together or split apart, e.g. "blackmountain" / "black mountain"
        squash = n.replace(' ', '')
        for cand in self.names:
            if cand.replace(' ', '') == squash:
                return cand, 'fuzzy'
        return None, ''

    def candidates(self, s, j):
        """Junction candidates on s: list of node ids, clustered so near-duplicates count once."""
        shared = sorted(self.nodes(s) & self.nodes(j))
        kind = 'shared'
        if not shared:
            jn = [self.pos[n] for n in self.nodes(j)]
            best = None
            for n in self.nodes(s):
                d = min(dist(self.pos[n], q) for q in jn)
                if best is None or d < best[0]:
                    best = (d, n)
            if not best:
                return [], '', None
            return [best[1]], 'near', best[0]
        out = []
        for n in shared:
            if all(dist(self.pos[n], self.pos[m]) > 25 for m in out):
                out.append(n)
        return out, kind, 0.0

    def walk2(self, s, start, direction, metres):
        gph = self.graph(s)
        p = self.pos[start]
        nbrs = list(gph.get(start, []))
        if not nbrs:
            return p, None, False, 180
        target = COMPASS[direction]
        nxt = min(nbrs, key=lambda n: angdiff(bearing(p, self.pos[n]), target))
        head = bearing(p, self.pos[nxt])
        first = angdiff(head, target)
        if first > 100:
            return p, head, False, first
        cur, left, a, seen = nxt, metres, p, {start}
        while True:
            b = self.pos[cur]
            seg = dist(a, b)
            head = bearing(a, b) if seg > 0 else head
            if seg >= left:
                t = left / seg if seg else 0
                return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t), head, True, first
            left -= seg
            seen.add(cur)
            opts = [n for n in gph.get(cur, []) if n not in seen]
            if not opts:
                return b, head, False, first
            nx = min(opts, key=lambda n: angdiff(bearing(b, self.pos[n]), head))
            a, cur = b, nx


HINT = {'eastern': (1, 0), 'western': (-1, 0), 'northern': (0, 1), 'southern': (0, -1)}


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
        cand, how_j = st.resolve(part)
        if cand and cand != s:
            j = cand
            if how_j == 'fuzzy':
                notes.append('junction matched to "%s"' % j)
            break
    if not j:
        return st.centroid(s), 'Street only', '; '.join(notes + ['junction street not found; point is the middle of the street'])
    cands, kind, gap = st.candidates(s, j)
    if not cands:
        return st.centroid(s), 'Street only', '; '.join(notes + ['point is the middle of the street'])
    if kind == 'near' and gap > 150:
        return st.pos[cands[0]], 'Street only', '; '.join(notes + ['streets are %d m apart in OpenStreetMap; point is the nearest part of the street' % gap])
    metres, direction, multi = parse_offset(off)
    try:
        half = float(length) / 2 if length else 0
    except ValueError:
        half = 0
    hint = next((v for k, v in HINT.items() if k in junc.lower()), None)
    if metres is None or direction is None:
        node = cands[0]
        if hint and len(cands) > 1:
            node = max(cands, key=lambda n: st.pos[n][0] * hint[0] + st.pos[n][1] * hint[1])
        return st.pos[node], 'Junction only', '; '.join(notes + ['no usable offset or direction; point is the junction'])
    trials = []
    for n in cands:
        pt, head, reached, first = st.walk2(s, n, direction, metres + half)
        trials.append((n, pt, head, reached, first))
    ambiguous = False
    if hint and len(trials) > 1:
        best = max(trials, key=lambda t: st.pos[t[0]][0] * hint[0] + st.pos[t[0]][1] * hint[1])
    else:
        good = [t for t in trials if t[3] and t[4] <= 60]
        pool = good or trials
        best = min(pool, key=lambda t: (not t[3], t[4]))
        if len(good) > 1:
            spread = max(dist(a[1], b[1]) for a in good for b in good)
            ambiguous = spread > 30
    n, pt, head, reached, first = best
    quality = 'Junction + offset'
    if kind == 'near':
        notes.append('streets do not share a point in OpenStreetMap (%d m apart); nearest approach used' % gap)
        if gap > 30:
            quality = 'Approximate'
    if ambiguous:
        quality = 'Approximate'
        notes.append('streets meet at more than one place and either fits the description')
    if multi:
        quality = 'Approximate'
        notes.append('multi-leg offset; only the first leg followed')
    if not reached:
        quality = 'Approximate'
        notes.append('could not follow the full offset along the street')
    sd = side_dir(position)
    if sd and head is not None:
        nb = min([(head + 90) % 360, (head - 90) % 360], key=lambda b: angdiff(b, COMPASS[sd]))
        r = math.radians(nb)
        pt = (pt[0] + 3.5 * math.sin(r), pt[1] + 3.5 * math.cos(r))
    return pt, quality, '; '.join(notes)


def main():
    src, cache, out_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    os.makedirs(out_dir, exist_ok=True)
    st = Streets2(json.load(open(cache)))
    rows = list(csv.DictReader(open(src, newline='', encoding='utf-8')))
    stats, feats = {}, []
    for r in rows:
        for k in ('Latitude', 'Longitude', 'Geocode quality', 'Geocode note'):
            r.pop(k, None)
        pt, quality, note = geocode(st, r)
        r['Latitude'] = r['Longitude'] = ''
        if pt:
            lat, lon = latlon(*pt)
            if BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lon <= BBOX[3]:
                r['Latitude'], r['Longitude'] = '%.6f' % lat, '%.6f' % lon
        r['Geocode quality'], r['Geocode note'] = quality, note
        stats[(r['Status'], quality)] = stats.get((r['Status'], quality), 0) + 1
        if r['Latitude'] and r['Status'] == 'Current':
            props = {k: v for k, v in r.items() if k not in ('Latitude', 'Longitude')}
            feats.append({'type': 'Feature', 'geometry': {'type': 'Point', 'coordinates': [float(r['Longitude']), float(r['Latitude'])]}, 'properties': props})
    with open(os.path.join(out_dir, 'belfast_onstreet_bays_geocoded.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    with open(os.path.join(out_dir, 'belfast_onstreet_bays_current.geojson'), 'w', encoding='utf-8') as f:
        json.dump({'type': 'FeatureCollection', 'features': feats}, f)
    for k in sorted(stats):
        print(k[0], '|', k[1], '|', stats[k])


if __name__ == '__main__':
    main()
