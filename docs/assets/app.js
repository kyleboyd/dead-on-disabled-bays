/* Dead on Disabled Bays: map, list, near me, filters and search. No backend. */
(function () {
  'use strict';

  var BLUE = '#0A58BF', NAVY = '#093773', YELLOW = '#F1F20C', INK = '#111820';
  var BELFAST = [-5.93, 54.597];
  var PAGE = 40;
  var MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var wide = window.matchMedia('(min-width: 900px) and (min-height: 560px)');

  var $ = function (id) { return document.getElementById(id); };

  var state = {
    places: [],
    filtered: [],
    query: '',
    here: null,        // {lat, lng} once "near me" has worked
    selected: null,    // place id
    shown: PAGE
  };
  var map = null, mapReady = false, popup = null, youMarker = null;

  /* ---------- small helpers ---------- */

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];   // only ever used with the fixed SVG strings below
      else node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === '') continue;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return node;
  }

  var ICONS = {
    good: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="' + NAVY + '"/><circle cx="12" cy="12" r="3.5" fill="#fff"/></svg>',
    approx: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="#fff" stroke="' + NAVY + '" stroke-width="4"/></svg>',
    hospital: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" fill="#fff" stroke="' + BLUE + '" stroke-width="2.5"/><path fill="none" stroke="' + BLUE + '" stroke-width="2.6" d="M8.5 7.5v9M15.5 7.5v9M8.5 12h7"/></svg>',
    council: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" fill="' + BLUE + '"/><path fill="#fff" d="M8.5 6.5h4.2a3.6 3.6 0 0 1 0 7.2h-1.6v3.8H8.5v-11zm2.6 2.2v2.8h1.4a1.4 1.4 0 0 0 0-2.8h-1.4z"/></svg>',
    nopin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="' + INK + '" stroke-width="2.5" d="M4 7h16M4 12h16M4 17h16"/></svg>',
    success: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#167346"/><path fill="none" stroke="#fff" stroke-width="2.5" d="m9.5 16.5 4.5 4.5 8.5-9.5"/></svg>',
    info: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="' + BLUE + '"/><circle cx="16" cy="10" r="1.8" fill="#fff"/><path stroke="#fff" stroke-width="2.5" d="M16 14.5V23"/></svg>',
    error: '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#B42318"/><path stroke="#fff" stroke-width="2.5" d="M16 8.5V18"/><circle cx="16" cy="22.5" r="1.8" fill="#fff"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.5" d="m6 9 6 6 6-6"/></svg>',
    clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.5"/><path fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" d="M12 7v5l3 2"/></svg>'
  };

  function iconFor(p) {
    if (p.kind === 'council') return 'council';
    if (p.kind === 'hospital' && p.q === 'site') return 'hospital';
    if (p.kind === 'street' && p.q === 'good') return 'good';
    if (p.kind === 'street' && p.q === 'approx') return 'approx';
    return 'nopin';
  }
  // "site" pins mark a hospital or centre, not the exact bays, so the reliability filter treats them as approximate.
  function hasPin(p) { return p.lat != null && (p.q === 'good' || p.q === 'approx' || p.q === 'site'); }
  function reliability(p) { return p.q === 'good' ? 'good' : (p.q === 'approx' || p.q === 'site') ? 'approx' : 'nopin'; }

  var ABBREV = { rd: 'road', st: 'street', ave: 'avenue', av: 'avenue', dr: 'drive', pk: 'park', gdns: 'gardens', cres: 'crescent', pl: 'place', sq: 'square', tce: 'terrace', ct: 'court' };
  function norm(s) {
    return String(s || '').toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function searchText(p) {
    var bits = [p.name, p.address, p.postcode, p.junction, p.id];
    if (p.kind === 'street') bits.push('on street bay');
    if (p.kind === 'council') bits.push('council car park');
    if (p.kind === 'hospital') bits.push('hospital car park');
    if (p.kind === 'shopping') bits.push('shopping centre car park');
    (p.areas || []).forEach(function (a) { bits.push(a.area, a.address); });
    // Postcodes also match with the space removed, e.g. "BT96BA".
    return ' ' + norm(bits.join(' ')) + ' ' + norm(p.postcode).replace(/ /g, '') + ' ';
  }

  function metres(a, b) {
    var R = 6371000, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // Distances in miles; under a tenth of a mile, in yards.
  function distanceText(m) {
    var miles = m / 1609.344;
    if (miles < 0.1) return Math.max(10, Math.round(m / 0.9144 / 10) * 10) + ' yd';
    return miles.toFixed(miles < 10 ? 1 : 0) + ' mi';
  }
  function niceDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return '';
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return Number(m[3]) + ' ' + months[Number(m[2]) - 1] + ' ' + m[1];
  }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* ---------- wording for each place ---------- */

  function whereText(p) {
    var parts = [];
    if (p.position) parts.push(p.position.charAt(0).toUpperCase() + p.position.slice(1));
    if (p.offset && p.junction) parts.push(p.offset + ' from the junction with ' + p.junction);
    else if (p.junction) parts.push('near the junction with ' + p.junction);
    return parts.join(', ');
  }
  function limitText(p) { return p.limited ? p.limit : 'No time limit'; }

  function siteTotal(p) {
    var total = 0, atLeast = false, known = false;
    p.areas.forEach(function (a) {
      if (a.bays == null) { atLeast = true; return; }
      known = true; total += a.bays;
      if (/minimum/i.test(a.basis)) atLeast = true;
    });
    if (!known) return 'Blue Badge bays available, number not published';
    return (atLeast ? 'At least ' : '') + plural(total, 'Blue Badge bay', 'Blue Badge bays');
  }

  function subText(p) {
    if (p.kind === 'street') return whereText(p);
    if (p.kind === 'council') return [p.address, p.postcode].filter(Boolean).join(', ');
    return p.address;
  }
  function metaText(p) {
    if (p.kind === 'street') {
      var s = p.spaces ? 'About ' + plural(p.spaces, 'space', 'spaces') : 'Number of spaces not known';
      return limitText(p) + ' · ' + s;
    }
    if (p.kind === 'council') {
      return 'Council car park · ' + (p.badgeBays == null ? 'Blue Badge count not given' : plural(p.badgeBays, 'Blue Badge bay', 'Blue Badge bays'));
    }
    return (p.kind === 'hospital' ? 'Hospital' : 'Shopping centre') + ' · ' + siteTotal(p);
  }

  function tagsFor(p) {
    var tags = [];
    if (p.kind === 'street' && p.limited) tags.push(el('span', { class: 'tag tag-limit', html: ICONS.clock + '<span>Time limit</span>' }));
    if (p.kind === 'street' && p.q === 'approx') tags.push(el('span', { class: 'tag', html: ICONS.approx + '<span>Approximate position</span>' }));
    if (p.kind === 'street' && (p.q === 'street' || p.q === 'none')) tags.push(el('span', { class: 'tag', html: ICONS.nopin + '<span>On this street, exact spot unknown</span>' }));
    if ((p.kind === 'hospital' || p.kind === 'shopping') && p.lat == null) tags.push(el('span', { class: 'tag', html: ICONS.nopin + '<span>Not on the map</span>' }));
    return tags;
  }

  function positionText(p) {
    if (p.kind === 'council') return 'From Belfast City Council’s car park data.';
    if (p.q === 'site') return 'The pin marks the hospital site from OpenStreetMap. The Blue Badge bays are in the car parks listed, which may be some way from the pin.';
    if (p.kind !== 'street') return 'This site has no map position in the data. Use the address.';
    var t;
    if (p.q === 'good') t = 'Worked out by measuring along the street from the junction. Expected within about 10 metres, but not checked on the ground.';
    else if (p.q === 'approx') t = 'Approximate. The junction was found but the description could not be followed exactly, so the bay may be some way from the pin.';
    else if (p.q === 'street') t = 'No pin. The bay is on this street but the exact spot is not known. Distances are measured to the middle of the street and can be hundreds of metres out.';
    else t = 'No pin. This street could not be found in the map data.';
    if (p.qNote) t += ' Detail: ' + p.qNote + '.';
    return t;
  }

  // Detail rows that are built but not shown for now. Set either to true to show it again.
  var SHOW = { spacesCounted: false, position: false };

  function row(dl, term, value, show) {
    if (value == null || value === '') return;
    var dt = el('dt', null, term), dd = el('dd', null, value);
    if (show === false) { dt.hidden = true; dd.hidden = true; }
    dl.appendChild(dt);
    dl.appendChild(dd);
  }

  function siteCount(p) {
    var total = 0, atLeast = false, known = false;
    p.areas.forEach(function (a) {
      if (a.bays == null) { atLeast = true; return; }
      known = true; total += a.bays;
      if (/minimum/i.test(a.basis)) atLeast = true;
    });
    return known ? (atLeast ? 'At least ' : '') + total : 'Not published';
  }

  // The two key facts shown on every card, in the list and on the map.
  function factsFor(p) {
    var dl = el('dl', { class: 'card-facts' });
    function fact(label, value) { dl.appendChild(el('div', { class: 'card-fact' }, el('dt', null, label), el('dd', null, value))); }
    if (p.kind === 'street') {
      fact('Time limit', p.limited ? p.limit : 'None');
      fact('Spaces', p.spaces ? 'About ' + p.spaces : 'Not known');
    } else if (p.kind === 'council') {
      fact('Blue Badge bays', p.badgeBays == null ? 'Not given' : String(p.badgeBays));
      fact('Charges', /^free$/i.test(p.hours) ? 'Free' : p.hours.replace(/\b(\d{2})(\d{2})\b/g, '$1:$2'));
    } else {
      fact('Blue Badge bays', siteCount(p));
      fact('Parking areas', String(p.areas.length));
    }
    return dl;
  }
  function positionTags(p) {
    return tagsFor(p).filter(function (x) { return x.className.indexOf('tag-limit') < 0; });
  }
  function kindLabel(p) {
    return p.kind === 'street' ? 'On-street bay' : p.kind === 'council' ? 'Council car park' : p.kind === 'hospital' ? 'Hospital' : 'Shopping centre';
  }

  // Extra detail shown when a list card is opened. The card itself already has where, limit and spaces.
  function detailFor(p) {
    var box = el('div', { class: 'detail' });
    var dl = el('dl');
    if (p.kind === 'street') {
      if (p.spaces && p.length) row(dl, 'How spaces are counted', 'Estimated from a bay length of ' + p.length + ' m.', SHOW.spacesCounted);
      row(dl, 'Position on the map', positionText(p), SHOW.position);
      row(dl, 'Note', p.notes);
    } else if (p.kind === 'council') {
      if (p.badgeBays == null) row(dl, 'Blue Badge bays', 'The council’s data gives no count. This does not mean there are none.');
      row(dl, 'Other spaces', p.standardBays == null ? '' : String(p.standardBays));
      row(dl, 'Position on the map', positionText(p), SHOW.position);
    } else {
      var ul = el('ul');
      p.areas.forEach(function (a) {
        var count = a.bays == null ? 'number not published' : /minimum/i.test(a.basis) ? 'at least ' + a.bays : String(a.bays);
        var line = a.area + ': ' + count + '.';
        if (a.address) line += ' ' + a.address + '.';
        if (a.notes) line += ' ' + a.notes;
        ul.appendChild(el('li', null, line));
      });
      row(dl, 'Blue Badge bays by area', ul);
      row(dl, 'Position on the map', positionText(p), SHOW.position);
      row(dl, 'Source', p.source);
    }
    box.appendChild(dl);

    var actions = el('div', { class: 'actions' });
    if (hasPin(p)) {
      var show = el('button', { type: 'button', class: 'btn btn-secondary' }, 'Show on map');
      show.addEventListener('click', function () {
        focusMapOn(p, true);
        if (!wide.matches) $('map').scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'center' });
      });
      actions.appendChild(show);
    }
    var dest = p.lat != null && p.q !== 'none'
      ? p.lat + ',' + p.lng
      : [p.name, p.address, p.postcode, 'Belfast'].filter(Boolean).join(', ');
    var label = p.kind === 'street' && p.q === 'street' ? 'Directions to the middle of the street' : 'Directions';
    actions.appendChild(el('a', {
      class: 'btn btn-secondary', target: '_blank', rel: 'noopener',
      href: 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest)
    }, label + ' (opens Google Maps)'));
    box.appendChild(actions);
    return box;
  }

  /* ---------- filtering and sorting ---------- */

  // Filter pills: none pressed means "show everything"; pressing one narrows the list.
  function pressed(name) {
    return Array.prototype.map.call(document.querySelectorAll('.chip[data-filter="' + name + '"][aria-pressed="true"]'), function (b) { return b.getAttribute('data-value'); });
  }

  function applyFilters(opts) {
    opts = opts || {};
    var kinds = pressed('kind'), onlyUnlimited = pressed('limit').length > 0, onlyGood = pressed('q').length > 0;
    var tokens = norm(state.query).split(' ').filter(Boolean).map(function (t) { return ABBREV[t] || t; });

    state.filtered = state.places.filter(function (p) {
      if (kinds.length && kinds.indexOf(p.kind) < 0) return false;
      if (onlyUnlimited && (p.kind !== 'street' || p.limited)) return false;
      if (onlyGood && reliability(p) !== 'good') return false;
      for (var i = 0; i < tokens.length; i++) {
        // Whole-word start match, so "st" finds "street" but "ark" does not find "park".
        if (p.text.indexOf(' ' + tokens[i]) < 0) return false;
      }
      return true;
    });

    if (state.here) {
      state.filtered.forEach(function (p) { p.dist = p.lat == null ? Infinity : metres(state.here, p); });
      state.filtered.sort(function (a, b) { return a.dist - b.dist || a.name.localeCompare(b.name); });
    } else {
      state.filtered.sort(function (a, b) { return a.name.localeCompare(b.name) || a.id.localeCompare(b.id, undefined, { numeric: true }); });
    }

    if (!opts.keepPage) state.shown = PAGE;
    if (state.selected && !state.filtered.some(function (p) { return p.id === state.selected; })) select(null);
    renderList();
    renderMap();
    renderStatus();
    $('filters-reset').hidden = !(kinds.length || onlyUnlimited || onlyGood);
  }

  function renderStatus() {
    var n = state.filtered.length, pins = state.filtered.filter(hasPin).length;
    var t;
    if (!n) {
      t = state.query
        ? 'Nothing matches “' + state.query + '”. Check the spelling, try the street name on its own, or clear the filters.'
        : 'No places match these filters together. Clear one to see more.';
    } else {
      t = plural(n, 'place', 'places') + (state.query ? ' for “' + state.query + '”' : '') + ', ' + pins + ' on the map. ';
      t += state.here ? 'Nearest first.' : 'Sorted by name.';
    }
    $('status').textContent = t;
  }

  /* ---------- list ---------- */

  function renderList() {
    var list = $('list');
    list.textContent = '';
    var rows = state.filtered.slice(0, state.shown);
    rows.forEach(function (p) {
      var open = p.id === state.selected;
      var btn = el('button', { type: 'button', class: 'item-btn', 'aria-expanded': String(open), 'aria-controls': 'd-' + p.id },
        el('span', { class: 'item-top' },
          el('span', { class: 'ico', html: ICONS[iconFor(p)] }),
          el('span', { class: 'card-kind' }, kindLabel(p)),
          el('span', { class: 'item-dist' }, distLabel(p)),
          el('span', { class: 'item-chevron', html: ICONS.chevron })),
        el('span', { class: 'card-title' }, p.name),
        el('span', { class: 'card-where' }, subText(p)));
      btn.addEventListener('click', function () {
        if (state.selected === p.id) { select(null); renderList(); focusItem(p.id); return; }
        select(p.id);
        renderList();
        focusItem(p.id);
        focusMapOn(p, false);
      });
      var li = el('li', { class: 'item' + (open ? ' is-selected' : ''), 'data-id': p.id }, el('h3', null, btn));
      var extra = el('div', { class: 'item-body' }, factsFor(p));
      var tags = positionTags(p);
      if (tags.length) {
        var t = el('p', { class: 'tags' });
        tags.forEach(function (x) { t.appendChild(x); });
        extra.appendChild(t);
      }
      li.appendChild(extra);
      var detail = el('div', { id: 'd-' + p.id });
      if (open) detail.appendChild(detailFor(p)); else detail.hidden = true;
      li.appendChild(detail);
      list.appendChild(li);
    });
    var left = state.filtered.length - rows.length;
    $('more').hidden = left <= 0;
    if (left > 0) $('more').textContent = 'Show ' + Math.min(PAGE, left) + ' more (' + left + ' not shown)';
  }

  function distLabel(p) {
    if (!state.here) return '';
    if (p.lat == null) return '';
    return (p.q === 'street' ? 'about ' : '') + distanceText(p.dist);
  }

  function itemNode(id) {
    return document.querySelector('.item[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
  }
  function focusItem(id) {
    var li = itemNode(id);
    if (li) li.querySelector('.item-btn').focus({ preventScroll: true });
  }

  function select(id) {
    state.selected = id;
    if (mapReady) map.setFilter('selected', ['==', ['get', 'id'], id || '']);
    if (!id && popup) { popup.remove(); popup = null; }
  }

  /* ---------- map ---------- */

  function pinImage(kind) {
    var ratio = 2, size = 28, c = document.createElement('canvas');
    c.width = c.height = size * ratio;
    var g = c.getContext('2d');
    g.scale(ratio, ratio);
    if (kind === 'hospital') {
      g.fillStyle = BLUE; g.fillRect(2, 2, 24, 24);
      g.fillStyle = '#fff'; g.fillRect(5, 5, 18, 18);
      g.fillStyle = BLUE; g.font = '700 15px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('H', 14, 15);
    } else if (kind === 'council') {
      g.fillStyle = '#fff'; g.fillRect(2, 2, 24, 24);
      g.fillStyle = BLUE; g.fillRect(4, 4, 20, 20);
      g.fillStyle = '#fff'; g.font = '700 16px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('P', 14, 15);
    } else if (kind === 'approx') {
      g.beginPath(); g.arc(14, 14, 12, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
      g.beginPath(); g.arc(14, 14, 8.5, 0, Math.PI * 2); g.lineWidth = 4; g.strokeStyle = NAVY; g.stroke();
    } else {
      g.beginPath(); g.arc(14, 14, 12, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
      g.beginPath(); g.arc(14, 14, 10, 0, Math.PI * 2); g.fillStyle = NAVY; g.fill();
      g.beginPath(); g.arc(14, 14, 3.5, 0, Math.PI * 2); g.fillStyle = '#fff'; g.fill();
    }
    var d = g.getImageData(0, 0, c.width, c.height);
    return { image: { width: c.width, height: c.height, data: d.data }, options: { pixelRatio: ratio } };
  }

  function geojson() {
    return {
      type: 'FeatureCollection',
      features: state.filtered.filter(hasPin).map(function (p) {
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { id: p.id, icon: 'pin-' + iconFor(p) } };
      })
    };
  }

  // System feedback: kind is 'info', 'success' or 'error'. Outcome first, then what to do.
  function feedback(node, kind, title, detail) {
    node.hidden = !title;
    if (!title) return;
    node.className = node.className.replace(/ ?is-(success|error)/g, '') + (kind === 'info' ? '' : ' is-' + kind);
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    node.querySelector('.feedback-icon').innerHTML = ICONS[kind];
    node.querySelector('.feedback-title').textContent = title;
    node.querySelector('.feedback-detail').textContent = detail || '';
  }
  function mapProblem(title, detail) { feedback($('map-message'), 'error', title, detail); }

  function initMap() {
    if (!window.maplibregl) {
      mapProblem('The map could not load', 'You may be offline. The list has every bay and still works.');
      return;
    }
    map = new maplibregl.Map({
      container: 'map', style: MAP_STYLE, center: BELFAST, zoom: 11.5, minZoom: 8, maxZoom: 19,
      attributionControl: false,
      maxBounds: [[-7.2, 53.9], [-4.7, 55.4]]
    });
    map.addControl(new maplibregl.AttributionControl({ compact: false, customAttribution: '© OpenStreetMap contributors' }));
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.getCanvas().setAttribute('aria-label', 'Map of disabled parking bays in Belfast. The list after the map has the same information.');

    var styleFailed = false;
    map.on('error', function (e) {
      if (mapReady || styleFailed) return;
      styleFailed = true;
      mapProblem('The map could not load', 'The list has every bay and still works. Reload the page to try the map again.');
      if (window.console) console.warn('Map error', e && e.error);
    });

    map.on('load', function () {
      ['good', 'approx', 'council', 'hospital'].forEach(function (k) {
        var img = pinImage(k);
        map.addImage('pin-' + k, img.image, img.options);
      });
      map.addSource('places', { type: 'geojson', data: geojson() });
      map.addLayer({
        id: 'selected', type: 'circle', source: 'places', filter: ['==', ['get', 'id'], state.selected || ''],
        paint: { 'circle-radius': 20, 'circle-color': YELLOW, 'circle-stroke-color': INK, 'circle-stroke-width': 3 }
      });
      map.addLayer({
        id: 'pins', type: 'symbol', source: 'places',
        layout: {
          'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.55, 14, 1],
          'symbol-sort-key': ['match', ['get', 'icon'], 'pin-hospital', 3, 'pin-council', 2, 'pin-approx', 0, 1]
        }
      });
      mapReady = true;
      $('map-message').hidden = true;

      map.on('click', function (e) {
        // A 44px box around the tap, so small pins are easy to hit.
        var box = [[e.point.x - 22, e.point.y - 22], [e.point.x + 22, e.point.y + 22]];
        var hits = map.queryRenderedFeatures(box, { layers: ['pins'] });
        if (!hits.length) return;
        var best = hits[0], bestD = Infinity;
        hits.forEach(function (f) {
          var pt = map.project(f.geometry.coordinates);
          var d = Math.pow(pt.x - e.point.x, 2) + Math.pow(pt.y - e.point.y, 2);
          if (d < bestD) { bestD = d; best = f; }
        });
        var p = byId(best.properties.id);
        if (p) pickFromMap(p);
      });
      map.on('mousemove', function (e) {
        map.getCanvas().style.cursor = map.queryRenderedFeatures(e.point, { layers: ['pins'] }).length ? 'pointer' : '';
      });
    });
  }

  function renderMap() {
    if (mapReady) map.getSource('places').setData(geojson());
  }

  function byId(id) {
    for (var i = 0; i < state.places.length; i++) if (state.places[i].id === id) return state.places[i];
    return null;
  }

  function moveMap(opts) {
    if (!mapReady) return;
    if (reduceMotion.matches) map.jumpTo(opts); else map.easeTo(Object.assign({ duration: 600 }, opts));
  }

  function fitTo(points, maxZoom) {
    if (!mapReady || !points.length) return;
    var b = new maplibregl.LngLatBounds();
    points.forEach(function (p) { b.extend([p.lng, p.lat]); });
    map.fitBounds(b, { padding: 56, maxZoom: maxZoom || 16, animate: !reduceMotion.matches, duration: 600 });
  }

  // The card shown when a pin is chosen: type, name, where, then two key facts.
  function openPopup(p) {
    if (popup) popup.remove();
    var body = el('div', { class: 'pin-card' },
      el('p', { class: 'card-kind' }, kindLabel(p)),
      el('h3', { class: 'card-title' }, p.name),
      el('p', { class: 'card-where' }, subText(p)));
    body.appendChild(factsFor(p));
    var tags = positionTags(p);
    if (tags.length) {
      var t = el('p', { class: 'tags' });
      tags.forEach(function (x) { t.appendChild(x); });
      body.appendChild(t);
    }
    popup = new maplibregl.Popup({ offset: 18, maxWidth: 'none' }).setLngLat([p.lng, p.lat]).setDOMContent(body).addTo(map);
    popup.on('close', function () { if (state.selected === p.id) { state.selected = null; map.setFilter('selected', ['==', ['get', 'id'], '']); renderList(); } });
  }

  function focusMapOn(p, withPopup) {
    if (!mapReady || !hasPin(p)) { if (popup) { popup.remove(); popup = null; state.selected = p.id; } return; }
    if (popup) { var keep = p.id; popup.remove(); popup = null; state.selected = keep; map.setFilter('selected', ['==', ['get', 'id'], keep]); renderList(); focusItem(keep); }
    moveMap({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 16) });
    if (withPopup) openPopup(p);
  }

  function pickFromMap(p) {
    select(p.id);
    // Make sure the matching list row exists, then open it.
    var idx = state.filtered.indexOf(p);
    if (idx >= state.shown) state.shown = Math.ceil((idx + 1) / PAGE) * PAGE;
    renderList();
    if (wide.matches) { var li = itemNode(p.id); if (li) li.scrollIntoView({ block: 'nearest' }); }
    openPopup(p);
    // Bring the pin a little below the middle so the card above it is fully in view.
    moveMap({ center: [p.lng, p.lat], offset: [0, Math.min(120, map.getContainer().clientHeight / 4)] });
  }

  /* ---------- near me ---------- */

  function nearMessage(kind, title, detail) { feedback($('near-message'), kind, title, detail); }

  function findNearMe() {
    var btn = $('near-me');
    if (!navigator.geolocation) {
      nearMessage('error', 'Location is not available', 'This browser cannot share a location. Search for a street or place instead.');
      return;
    }
    btn.disabled = true;
    nearMessage('info', 'Finding your location', 'This can take a few seconds.');
    navigator.geolocation.getCurrentPosition(function (pos) {
      btn.disabled = false;
      state.here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      btn.setAttribute('aria-pressed', 'true');
      applyFilters();
      var near = state.filtered.filter(hasPin).slice(0, 5);
      var first = state.filtered[0];
      if (!first || first.dist === Infinity) {
        nearMessage('error', 'No places to measure to', 'Your location was found, but nothing matches the current search and filters. Clear the search or the filters.');
      } else if (first.dist > 30000) {
        nearMessage('info', 'You seem to be outside Belfast', 'The nearest bay is about ' + distanceText(first.dist) + ' away. This site only covers Belfast. The list is still sorted by distance from you.');
      } else {
        nearMessage('success', 'Nearest bay: ' + first.name + ', ' + distLabel(first), 'The list is now sorted nearest first. Press Near me again to stop using your location.');
      }
      if (mapReady) {
        if (!youMarker) {
          youMarker = new maplibregl.Marker({ element: el('div', { class: 'you-marker', role: 'img', 'aria-label': 'Your location', title: 'Your location' }) });
        }
        if (first && first.dist <= 30000) {
          youMarker.setLngLat([state.here.lng, state.here.lat]).addTo(map);
          fitTo(near.concat([state.here]), 17);
        }
      }
    }, function (err) {
      btn.disabled = false;
      if (err.code === 1) nearMessage('error', 'Location is blocked for this site', 'Allow location in your browser’s site settings and try again, or search for a street or place instead.');
      else if (err.code === 3) nearMessage('error', 'Finding your location took too long', 'Try again, moving outdoors if you can, or search for a street or place instead.');
      else nearMessage('error', 'Your location could not be found', 'Check that location is switched on and try again, or search for a street or place instead.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }

  function clearNearMe() {
    state.here = null;
    if (youMarker) youMarker.remove();
    $('near-me').setAttribute('aria-pressed', 'false');
    nearMessage('info', '');
    applyFilters();
    $('near-me').focus();
  }

  /* ---------- start ---------- */

  function wire() {
    document.querySelectorAll('[data-ico]').forEach(function (n) { n.innerHTML = ICONS[n.getAttribute('data-ico')]; });

    var timer = null, input = $('search');
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { state.query = input.value.trim(); applyFilters(); }, 250);
    });
    $('search-form').addEventListener('submit', function (e) {
      e.preventDefault();
      clearTimeout(timer);
      state.query = input.value.trim();
      applyFilters();
      var pins = state.filtered.filter(hasPin);
      if (state.query && pins.length) fitTo(pins, 16);
    });

    var chips = document.querySelectorAll('.chip');
    chips.forEach(function (b) {
      b.addEventListener('click', function () {
        b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true'));
        applyFilters();
      });
    });
    $('filters-reset').addEventListener('click', function () {
      chips.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      applyFilters();
      chips[0].focus();
    });

    // Near me is a toggle: press to sort by distance, press again to stop using your location.
    $('near-me').addEventListener('click', function () { if (state.here) clearNearMe(); else findNearMe(); });
    $('more').addEventListener('click', function () {
      var firstNew = state.filtered[state.shown];
      state.shown += PAGE;
      renderList();
      if (firstNew) focusItem(firstNew.id);
    });

    var about = $('about');
    function openAbout() { if (about.showModal) about.showModal(); else about.setAttribute('open', ''); }
    $('about-open-2').addEventListener('click', openAbout);
    $('about-close').addEventListener('click', function () { if (about.close) about.close(); else about.removeAttribute('open'); });
  }

  // Brand sizing. "DEAD ON" is always exactly as wide as "Disabled Bays". On wide screens the whole
  // brand (icon + words) is also scaled to the width of the list column below it.
  function fitBrand() {
    var top = document.querySelector('.brand-top'), bottom = document.querySelector('.brand-bottom');
    var icon = document.querySelector('.brand-badge'), text = document.querySelector('.brand-text');
    var results = $('results');
    if (!top || !bottom || !icon || !text) return;
    function matchTop() {
      top.style.fontSize = '20px';
      var ratio = bottom.getBoundingClientRect().width / top.getBoundingClientRect().width;
      if (ratio > 0 && isFinite(ratio)) top.style.fontSize = (20 * ratio).toFixed(2) + 'px';
    }
    bottom.style.fontSize = ''; icon.style.width = ''; icon.style.height = '';
    matchTop();
    if (!wide.matches || !results) return;
    var cs = getComputedStyle(results);
    var target = results.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    var gap = parseFloat(getComputedStyle(icon.parentNode).columnGap) || 0;
    // Icon height follows the text height, which follows the font size, so settle it in a few passes.
    for (var i = 0; i < 4; i++) {
      var size = parseFloat(getComputedStyle(bottom).fontSize);
      var room = target - icon.getBoundingClientRect().width - gap;
      bottom.style.fontSize = (size * room / bottom.getBoundingClientRect().width).toFixed(2) + 'px';
      matchTop();
      var h = text.getBoundingClientRect().height;
      icon.style.height = h.toFixed(1) + 'px';
      icon.style.width = h.toFixed(1) + 'px'; // the box is square
    }
    // The header height may have changed, so let the map fill its new space.
    if (map) map.resize();
  }

  function start() {
    fitBrand();
    if (document.fonts) {
      document.fonts.ready.then(fitBrand);
      document.fonts.addEventListener('loadingdone', fitBrand);
    }
    var resizeTimer = null;
    window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitBrand, 100); });
    wire();
    initMap();
    fetch('assets/places.json?v=2026-11-17f').then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      state.places = data.places;
      var counts = {};
      state.places.forEach(function (p) { p.text = searchText(p); counts[p.kind] = (counts[p.kind] || 0) + 1; });
      $('built').textContent = 'Data file built ' + niceDate(data.built) + '.';
      applyFilters();
    }).catch(function (err) {
      $('status').textContent = 'The list of bays could not load. Check your connection and reload the page.';
      if (window.console) console.error(err);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
