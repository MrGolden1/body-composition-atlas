import { SUBJECT, SEGMENTS, TESTS, METRICS } from './data.js';
import { FAT_STOPS, fatColor } from './shape.js';
import { t, num, digits, testLabel, lang } from './i18n.js';

const hex = (c) => '#' + c.getHexString();
const bdi = (s) => `<bdi>${s}</bdi>`;

const ICON = {
  logo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.4"/><path d="M12 8v6m-4-4 4-1 4 1M9 21l3-7 3 7"/></svg>',
  play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
  globe: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>',
};

export const VIEWS = ['body', 'fat', 'tissue', 'compare'];
const short = (test) => testLabel(test, 'short');
const subjectName = () => (lang === 'fa' ? SUBJECT.nameFa : SUBJECT.name);

export function brandHTML() {
  const L = t();
  return `<div class="brand">
      <div class="logo">${ICON.logo}</div>
      <div class="bt"><h1>${L.brand}</h1><small>${L.brandSub}</small></div>
      <button class="lang" data-act="lang" title="${L.language}">${ICON.globe}<span>${L.language}</span></button>
    </div>`;
}

// ---------------------------------------------------------------------------------
export function leftHTML(s) {
  const L = t();
  const cards = TESTS.map((x, i) => {
    const note = testLabel(x, 'dateNote');
    const showNote = note && x.dateNote !== 'Today';
    return `
    <button class="test-card ${i === s.testIdx ? 'active' : ''}" data-test="${i}">
      <div class="t1">${short(x)}<span class="tag">${x.device}</span></div>
      <div class="t2">${testLabel(x, 'dateLabel')}${showNote ? ' · ' + note : ''}</div>
      <div class="tv"><b>${num(x.weight)}</b><span>${L.kgFat(num(x.pbf))}</span></div>
    </button>`;
  }).join('');

  const baseOpts = TESTS.map((x, i) => (i === s.testIdx ? '' :
    `<button data-base="${i}" class="${i === s.baseIdx ? 'active' : ''}">${short(x)}</button>`)).join('');

  const sw = (key, on, label) => `<div class="row"><label>${label}</label><button class="switch ${on ? 'on' : ''}" data-toggle="${key}" role="switch" aria-checked="${on}" aria-label="${label}"></button></div>`;

  let tissue = '';
  if (s.view === 'tissue') {
    const modes = ['xray', 'cut', 'slice'].map((m) => `<button data-tmode="${m}" class="${s.tmode === m ? 'active' : ''}">${L.modes[m]}</button>`).join('');
    const lay = (k, label, cls) => `<div class="row"><label><i class="dot ${cls}"></i>${label}</label><button class="switch ${s.layers[k] ? 'on' : ''}" data-layer="${k}" role="switch" aria-checked="${s.layers[k]}" aria-label="${label}"></button></div>`;
    let slider = '';
    if (s.tmode === 'cut') {
      slider = `<div class="row"><label>${L.cutDepth}</label><span id="cut-val"></span></div>
        <input id="cut" type="range" min="-0.12" max="0.14" step="0.005" value="${s.cutDepth}" />
        <div class="ticks2"><span>${L.back_}</span><span>${L.front_}</span></div>`;
    } else if (s.tmode === 'slice') {
      slider = `<div class="row"><label>${L.sliceHeight}</label><span id="cut-val"></span></div>
        <input id="cut" type="range" min="0.2" max="1.62" step="0.005" value="${s.sliceY}" />
        <div class="ticks2"><span>${L.feet}</span><span>${L.head}</span></div>`;
    }
    tissue = `
    <div class="field f-tissue">
      <p class="section-title">${L.tissue}</p>
      <div class="seg">${modes}</div>
      ${slider}
      <p class="hint">${L.tissueHint[s.tmode]}</p>
      <p class="section-title" style="margin:6px 0 0">${L.layers}</p>
      ${lay('fat', L.layerFat, 'fat')}
      ${lay('muscle', L.layerMuscle, 'lean')}
      ${lay('visc', L.layerVisc, 'visc')}
    </div>`;
  }

  return `
    ${brandHTML()}

    <div class="subject f-subject">
      <div class="avatar">${subjectName()[0]}</div>
      <div><div class="nm">${subjectName()}</div>
      <div class="meta">${L.male} · ${num(SUBJECT.heightCm, 0)} ${L.cm} · ${L.ageN(num(TESTS[s.testIdx].age, 0))}</div></div>
    </div>

    <div class="f-tests">
      <p class="section-title">${L.measurements}</p>
      <div class="tests">${cards}</div>
    </div>

    ${s.view === 'compare' ? `
    <div class="field f-compare">
      <p class="section-title">${L.compareAgainst}</p>
      <div class="seg">${baseOpts}</div>
      ${sw('changeMap', s.changeMap, L.changeColours)}
    </div>` : ''}

    ${tissue}

    <div class="field f-display">
      <p class="section-title">${L.display}</p>
      <div class="row"><label>${L.exaggerate}</label><span id="emph-val">${num(s.emph)}×</span></div>
      <input id="emph" type="range" min="1" max="3" step="0.1" value="${s.emph}" />
      <div class="hint">${L.exaggerateHint}</div>
      <div style="height:4px"></div>
      ${sw('labels', s.labels, L.labels)}
      ${s.view === 'body' || s.view === 'compare' ? sw('shorts', s.shorts, L.shorts) : ''}
      ${sw('rotate', s.rotate, L.turntable)}
    </div>

    <div class="field f-camera">
      <p class="section-title">${L.camera}</p>
      <div class="seg">
        <button data-cam="front">${L.front}</button><button data-cam="side">${L.side}</button>
        <button data-cam="back">${L.back}</button><button data-cam="three">${L.three}</button>
      </div>
      <div class="btn-row" style="margin-top:6px">
        <button class="btn primary" data-act="shot">${L.saveImage}</button>
      </div>
    </div>

    <p class="hint foot">${L.hint}</p>`;
}

// ---------------------------------------------------------------------------------
function deltaChip(m, cur, prev) {
  if (cur == null || prev == null) return '';
  const d = cur - prev;
  const dec = m.dec;
  if (Math.abs(d) < Math.pow(10, -dec) / 2) return `<span class="delta neutral">±${num(0, 0)}</span>`;
  const arrow = d > 0 ? '▲' : '▼';
  let cls = 'neutral';
  if (m.good) cls = (d > 0) === (m.good === 'up') ? 'good' : 'bad';
  return `<span class="delta ${cls}">${arrow} ${num(Math.abs(d), dec)}</span>`;
}

function metricCards(s) {
  const L = t();
  const x = TESTS[s.testIdx];
  const refIdx = s.view === 'compare' ? s.baseIdx : s.testIdx - 1;
  const ref = refIdx >= 0 ? TESTS[refIdx] : null;
  return METRICS.map((m) => {
    const v = x[m.key];
    let rng = '';
    if (m.range && v != null) {
      const out = v < m.range[0] || v > m.range[1];
      const nd = (v) => num(v, (String(v).split('.')[1] || '').length);
      rng = `<span class="${out ? 'out' : ''}">${L.ref} ${bdi(`${nd(m.range[0])}–${nd(m.range[1])}`)}</span>`;
    }
    const est = m.key === 'vfa' && x.vfaEstimated ? `<span class="tag" style="margin:0">${L.est}</span>` : '';
    return `<div class="metric">
      <div class="ml">${L.metrics[m.key]}</div>
      ${v == null ? `<div class="mv na">${L.notMeasured}</div>` :
        `<div class="mv">${num(v, m.dec)}<small>${L.units[m.unit]}</small></div>`}
      <div class="mf"><span>${rng}${est}</span>${ref ? deltaChip(m, v, ref[m.key]) : ''}</div>
    </div>`;
  }).join('');
}

function segmentTable(s) {
  const L = t();
  const x = TESTS[s.testIdx];
  const rows = SEGMENTS.map((g) => {
    const d = x.segments[g.id];
    const share = d.fat / (d.fat + d.lean);
    return `<tr>
      <td>${L.seg[g.id]}</td>
      <td style="color:var(--fat)">${num(d.fat)}</td>
      <td style="color:#ff8d82">${num(d.lean)}</td>
      <td style="width:92px"><div class="sh">${num(share * 100, 0)}${L.units['%']}</div>
        <div class="sbar"><i style="width:${Math.min(100, share * 100 * 1.8)}%;background:${hex(fatColor(share))}"></i></div></td>
    </tr>`;
  }).join('');
  return `<table class="seg-table"><thead><tr><th>${L.segment}</th><th>${L.fatKg}</th><th>${L.leanKg}</th><th>${L.fatShare}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// real cross-section of the 3D model at navel height (contours in metres, x right, z front)
function sectionSVG(s, sec) {
  const L = t();
  const x = TESTS[s.testIdx];
  if (!sec) return '';
  const W = 300, H = 230;
  const sc = Math.min(270 / sec.width, 186 / sec.depth); // px per metre, fitted
  const cx = W / 2, cy = 116;
  const P = (p) => [cx + p[0] * sc, cy - (p[1] - sec.zc) * sc];
  // light smoothing, then a closed Catmull-Rom curve through the contour
  const path = (loop) => {
    const n = loop.length;
    const pts = loop.map((_, i) => {
      const a = loop[(i - 1 + n) % n], b = loop[i], c = loop[(i + 1) % n];
      return P([(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4]);
    });
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
    }
    return d + 'Z';
  };
  let visc = '';
  if (x.vfa != null) {
    const vb = Math.sqrt(x.vfa / (1.5 * Math.PI)) / 100, va = vb * 1.5;
    const rb = Math.sqrt(100 / (1.5 * Math.PI)) / 100, ra = rb * 1.5;
    const vy = cy - (sec.viscZ - sec.zc) * sc;
    visc = `
      <ellipse cx="${cx}" cy="${vy}" rx="${va * sc}" ry="${vb * sc}" fill="url(#vg)" stroke="#ffd37a" stroke-width="1.2"/>
      <ellipse cx="${cx}" cy="${vy}" rx="${ra * sc}" ry="${rb * sc}" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="1" stroke-dasharray="4 3"/>
      <text x="${cx}" y="${vy + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#2a1700">${bdi(num(x.vfa, 0) + ' cm²')}</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${L.xsTitle}" style="direction:ltr">
    <defs>
      <radialGradient id="lg" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#b9483f"/><stop offset="1" stop-color="#7f2925"/></radialGradient>
      <radialGradient id="vg" cx="50%" cy="40%" r="65%"><stop offset="0" stop-color="#ffc94a"/><stop offset="1" stop-color="#f08a12"/></radialGradient>
      <radialGradient id="fg" cx="50%" cy="45%" r="62%"><stop offset="0" stop-color="#f1c56e"/><stop offset="1" stop-color="#c98f35"/></radialGradient>
    </defs>
    <path d="${path(sec.skin)}" fill="url(#fg)" fill-opacity=".8" stroke="#f3cf8a" stroke-width="1.5"/>
    ${sec.lean ? `<path d="${path(sec.lean)}" fill="url(#lg)" stroke="#d96a5d" stroke-width="1"/>` : ''}
    ${visc}
    <text x="8" y="14" font-size="10" fill="#8a96aa">${L.anterior}</text>
    <text x="8" y="${H - 4}" font-size="10" fill="#8a96aa">${L.posterior}</text>
    ${x.vfa == null ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="600" fill="#fff" stroke="#3a0f0c" stroke-width="3" paint-order="stroke">${L.xsNone}</text>` : ''}
  </svg>
  <div class="xs-legend">
    <span><i style="background:#e9b96a;opacity:.75"></i>${L.xsSubcut}</span>
    <span><i style="background:#b9483f"></i>${L.xsLean}</span>
    <span><i style="background:#ffb020"></i>${L.xsVisc}</span>
    <span><i style="border:1px dashed #fff;background:none"></i>${L.xsThresh}</span>
  </div>`;
}

function sparkline(key, label, unit, s) {
  const L = t();
  const vals = TESTS.map((x) => x[key]);
  const W = 300, H = 66, pad = 22;
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const x = (i) => pad + (i * (W - pad * 2)) / (TESTS.length - 1);
  const y = (v) => 46 - ((v - mn) / (mx - mn || 1)) * 24;
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const dots = vals.map((v, i) => {
    const act = i === s.testIdx;
    return `<circle cx="${x(i)}" cy="${y(v)}" r="${act ? 5 : 3.4}" fill="${act ? '#4fd1c5' : '#2a3448'}" stroke="${act ? '#4fd1c5' : '#6b7790'}" stroke-width="1.5"/>
      <text x="${x(i)}" y="${y(v) - 10}" text-anchor="middle" font-size="10.5" fill="${act ? '#e8edf5' : '#8a96aa'}" font-weight="${act ? 700 : 500}">${num(v)}</text>`;
  }).join('');
  const dl = vals[vals.length - 1] - vals[0];
  return `<div><div class="tl"><span>${label}</span><span><bdi dir="ltr">${dl > 0 ? '+' : '−'}${num(Math.abs(dl))}</bdi> ${L.units[unit]} ${L.overall}</span></div>
    <svg viewBox="0 0 ${W} ${H}" style="direction:ltr"><polyline points="${pts}" fill="none" stroke="#3a4660" stroke-width="2" stroke-linejoin="round"/>${dots}
    ${TESTS.map((q, i) => `<text x="${x(i)}" y="${H - 2}" text-anchor="middle" font-size="9.5" fill="#5c6779">${short(q)}</text>`).join('')}</svg></div>`;
}

export function rightHTML(s, ctx = {}) {
  const L = t();
  const x = TESTS[s.testIdx];
  const compare = s.view === 'compare';
  const b = TESTS[s.baseIdx];
  return `
    <div class="hdr">
      <div><h2>${short(x)} · ${testLabel(x, 'dateLabel')}</h2><div class="sub">${x.device} · ${compare ? L.changeVs(short(b)) : L.changeVsPrev}</div></div>
      <span class="badge">${L.scoreNames[x.scoreName] || x.scoreName} ${num(x.score, 0)}</span>
    </div>

    <div class="metrics">${metricCards(s)}</div>

    <div class="card"><h3>${L.segmental} <span>${L.units.kg}</span></h3>${segmentTable(s)}</div>

    <div class="card"><h3>${L.xsTitle} <span>${lang === 'fa' ? 'از مدل سه‌بعدی' : 'from the 3D model'}</span></h3>${sectionSVG(s, ctx.section)}</div>

    <div class="card"><h3>${L.progress} <span>${short(TESTS[0])} → ${short(TESTS[TESTS.length - 1])}</span></h3>
      <div class="trend">
        ${sparkline('weight', L.weight, 'kg', s)}
        ${sparkline('bfm', L.bfmLong, 'kg', s)}
        ${sparkline('smm', L.smmLong, 'kg', s)}
      </div></div>

    <div class="card"><h3>${L.notesTitle}</h3>
      <ul class="notes">${L.notes.map((n) => `<li>${n}</li>`).join('')}</ul></div>`;
}

// ---------------------------------------------------------------------------------
export function chipsHTML(s) {
  return VIEWS.map((v) => `<button class="chip ${v === s.view ? 'active' : ''}" data-view="${v}">${t().views[v]}</button>`).join('');
}

export function timelineHTML(s) {
  const L = t();
  const nodes = TESTS.map((x, i) => `
    ${i ? '<div class="tl-seg"></div>' : ''}
    <button class="tl-node ${i === s.testIdx ? 'active' : ''}" data-test="${i}">
      <div class="tl-dot"></div><div class="tl-t">${short(x)}</div><div class="tl-s">${num(x.weight)}<span class="u"> ${L.units.kg}</span></div>
    </button>`).join('');
  return `<button class="play" data-act="play" aria-label="${s.playing ? L.pause : L.play}">${s.playing ? ICON.pause : ICON.play}</button>
    <div class="tl-track">${nodes}</div>`;
}

function gradient(stops, lo, hi) {
  return `linear-gradient(90deg, ${stops.map(([v, c]) => `${hex(c)} ${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`).join(', ')})`;
}

export function legendHTML(s, changeStops) {
  const L = t();
  const pct = (v) => `${num(v, 0)}${L.units['%']}`;
  if (s.view === 'fat') {
    return `<div class="lt">${L.legendFat}</div>
      <div class="bar" style="background:${gradient(FAT_STOPS, 0.15, 0.45)}"></div>
      <div class="ticks"><span>${pct(15)}</span><span>${pct(25)}</span><span>${pct(35)}</span><span>${pct(45)}</span></div>
      <div class="lsub">${L.legendFatSub}</div>
      <div class="row"><span class="sw" style="background:#8d97a8"></span>${L.notDriven}</div>`;
  }
  if (s.view === 'compare') {
    const b = short(TESTS[s.baseIdx]);
    return `<div class="lt">${L.legendChange(b)}</div>
      ${s.changeMap ? `<div class="bar" style="background:${gradient(changeStops, -30, 15)}"></div>
      <div class="ticks"><span dir="ltr">−${pct(30)}</span><span>${num(0, 0)}</span><span dir="ltr">+${pct(15)}</span></div>` : ''}
      <div class="row" style="margin-top:7px"><span class="sw" style="background:#58a6ff"></span><span>${L.ghost(b)}</span></div>`;
  }
  if (s.view === 'tissue') {
    return `<div class="lt">${L.legendTissue}</div>
      <div class="row"><span class="sw" style="background:#f0c158"></span>${L.lgSkinFat}</div>
      <div class="row"><span class="sw" style="background:#b23c33"></span>${L.lgLean}</div>
      <div class="row"><span class="sw" style="background:#ff9a1f"></span>${L.lgVisc}</div>`;
  }
  return '';
}

export function mobileTabsHTML(s) {
  const L = t();
  return ['right', 'left'].map((k) => `<button class="${s.mtab === k ? 'active' : ''}" data-mtab="${k}">${L.panels[k]}</button>`).join('');
}

export { digits };
