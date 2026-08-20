/* Case study demo driver.
 *
 * Everything shown comes from files rendered by the real pipeline: an overlay
 * video and the exact JSON the app's own /compliance_data endpoint produced for
 * that run. Nothing here recomputes a verdict; this only plays back what the
 * pipeline decided, paced to the video so the run reads the way it does live.
 */

(function () {
  'use strict';

  var DEMO = 'demo/';

  var els = {
    clip: document.getElementById('clip'),
    run: document.getElementById('run'),
    note: document.getElementById('clip-note'),
    video: document.getElementById('video'),
    veil: document.getElementById('veil'),
    runbar: document.getElementById('runbar'),
    runlabel: document.getElementById('runlabel'),
    frames: document.getElementById('frames'),
    nExceeds: document.getElementById('n-exceeds'),
    nAbstain: document.getElementById('n-abstain'),
    nTotal: document.getElementById('n-total'),
    report: document.getElementById('report'),
    honest: document.getElementById('honest'),
    sign: document.getElementById('sign'),
    postingKv: document.getElementById('posting-kv'),
    postingCaveat: document.getElementById('posting-caveat'),
    bridgeKv: document.getElementById('bridge-kv'),
    abstainList: document.getElementById('abstain-list'),
    structureLine: document.getElementById('structure-line'),
    byclass: document.getElementById('byclass'),
    disclaimers: document.getElementById('disclaimers')
  };

  var manifest = [];
  var current = null;   // manifest entry
  var report = null;    // parsed compliance_data for the current clip
  var raf = 0;

  // ---------- helpers ----------

  function text(el, s) { el.textContent = s == null ? '' : String(s); }

  function kv(dl, pairs) {
    dl.innerHTML = '';
    pairs.forEach(function (p) {
      if (p[1] === null || p[1] === undefined || p[1] === '') return;
      var row = document.createElement('div');
      var dt = document.createElement('dt');
      var dd = document.createElement('dd');
      dt.textContent = p[0];
      dd.textContent = p[1];
      row.appendChild(dt);
      row.appendChild(dd);
      dl.appendChild(row);
    });
  }

  function num(n) {
    return typeof n === 'number' ? n.toLocaleString('en-US') : n;
  }

  // ---------- playback-synced tally ----------

  // The ledger reports crossings in fixed-width time buckets. Turn those into a
  // cumulative count at an arbitrary playhead position, interpolating inside the
  // active bucket so the numbers climb steadily instead of jumping every 5 s.
  function tallyAt(t) {
    var out = { EXCEEDS: 0, ABSTAIN: 0, total: 0 };
    if (!report) return out;
    var s = report.session_summary || {};
    var buckets = s.timeline || [];
    var w = s.timeline_bucket_s || 5;

    buckets.forEach(function (b) {
      var start = b.start_s || 0;
      var frac;
      if (t >= start + w) frac = 1;
      else if (t <= start) frac = 0;
      else frac = (t - start) / w;
      out.EXCEEDS += (b.EXCEEDS || 0) * frac;
      out.ABSTAIN += (b.ABSTAIN || 0) * frac;
      out.total += (b.total || 0) * frac;
    });
    out.EXCEEDS = Math.floor(out.EXCEEDS);
    out.ABSTAIN = Math.floor(out.ABSTAIN);
    out.total = Math.floor(out.total);
    return out;
  }

  function paintTally(t) {
    var c = tallyAt(t);
    text(els.nExceeds, c.EXCEEDS);
    text(els.nAbstain, c.ABSTAIN);
    text(els.nTotal, c.total);
  }

  function tick() {
    if (els.video.paused || els.video.ended) { raf = 0; return; }
    var t = els.video.currentTime;
    paintTally(t);
    var fps = (current && current.fps) || 30;
    text(els.frames, 'frame ' + Math.min(Math.round(t * fps), current ? current.frames : 0));
    raf = requestAnimationFrame(tick);
  }

  // ---------- report rendering ----------

  function renderReport() {
    var s = report.session_summary || {};
    var p = report.posting || {};
    var b = (report.bridge_info && report.bridge_info.bridge) || {};

    text(els.honest, s.honest_label || '');

    text(els.sign, p.sign_text || 'no sign value on record');
    kv(els.postingKv, [
      ['posted limit', p.limit_short_tons != null ? p.limit_short_tons + ' short tons' : null],
      ['model-facing', p.limit_tons != null ? p.limit_tons.toFixed(3) + ' metric t' : null],
      ['restriction', p.restriction_kind],
      ['provenance', p.provenance_label],
      ['observed on', p.observed_on],
      ['load posted', p.is_load_posted === true ? 'yes' : (p.is_load_posted === false ? 'no' : null)]
    ]);
    text(els.postingCaveat, p.caveat || '');

    kv(els.bridgeKv, [
      ['structure no.', b.structure_number],
      ['carries', b.facility_carried],
      ['built', b.year_built],
      ['reconstructed', b.year_reconstructed],
      ['posting status', b.open_posted_status],
      ['inventory rating', b.inventory_rating_tons != null ? b.inventory_rating_tons + ' metric t' : null],
      ['deck / super / sub', [b.deck_cond, b.superstructure_cond, b.substructure_cond].join(' / ')],
      ['ADT', b.adt != null ? num(b.adt) + (b.adt_year ? ' (' + b.adt_year + ')' : '') : null]
    ]);

    // why it abstained
    els.abstainList.innerHTML = '';
    (report.abstention_breakdown || []).forEach(function (a) {
      var wrap = document.createElement('div');
      wrap.className = 'abstain-item';

      var h = document.createElement('p');
      h.className = 'abstain-head';
      h.textContent = a.title || a.key;
      wrap.appendChild(h);

      var c = document.createElement('span');
      c.className = 'abstain-count';
      c.textContent = a.count + ' of ' + a.denominator + ' crossings' +
        (a.share != null ? '  (' + Math.round(a.share * 100) + '%)' : '');
      wrap.appendChild(c);

      if (a.plain) {
        var why = document.createElement('p');
        why.className = 'abstain-why';
        why.textContent = a.plain;
        wrap.appendChild(why);
      }
      if (a.unblocks) {
        var un = document.createElement('p');
        un.className = 'abstain-un';
        un.innerHTML = '<strong>What would unblock it:</strong> ';
        un.appendChild(document.createTextNode(a.unblocks));
        wrap.appendChild(un);
      }
      els.abstainList.appendChild(wrap);
    });

    // structure-wide
    var ss = report.structure_summary || {};
    text(els.structureLine,
      num(ss.total_crossings || 0) + ' crossings across ' + num(ss.sessions || 0) +
      ' recorded run(s) against this structure. ' + (ss.honest_label || ''));

    els.byclass.innerHTML = '';
    var byClass = ss.by_class || {};
    Object.keys(byClass).sort(function (x, y) {
      return (byClass[y].total || 0) - (byClass[x].total || 0);
    }).forEach(function (cls) {
      var row = byClass[cls];
      var chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = '<b>' + cls + '</b> ' + num(row.total || 0);
      els.byclass.appendChild(chip);
    });

    els.disclaimers.innerHTML = '';
    (report.disclaimers || []).forEach(function (d) {
      var li = document.createElement('li');
      li.textContent = typeof d === 'string' ? d : JSON.stringify(d);
      els.disclaimers.appendChild(li);
    });

    els.report.hidden = false;
  }

  // ---------- wiring ----------

  function resetForClip() {
    els.report.hidden = true;
    els.veil.hidden = false;
    els.runbar.hidden = true;
    els.runbar.classList.remove('done');
    text(els.nExceeds, '0');
    text(els.nAbstain, '0');
    text(els.nTotal, '0');
    text(els.frames, 'frame 0');
    els.run.disabled = false;
    els.run.textContent = 'Analyze';
  }

  function selectClip(id) {
    current = manifest.filter(function (m) { return m.footage_id === id; })[0];
    if (!current) return;
    resetForClip();
    els.video.src = DEMO + current.video;
    els.video.load();
    text(els.note, current.seconds + ' s at ' + Math.round(current.fps) + ' fps, ' +
      current.frames + ' frames' + (current.credit ? '  ·  ' + current.credit : ''));

    report = null;
    fetch(DEMO + current.report)
      .then(function (r) { return r.json(); })
      .then(function (j) { report = j; })
      .catch(function () { text(els.note, 'could not load the report for this clip'); });
  }

  function start() {
    if (!current) return;
    els.veil.hidden = true;
    els.runbar.hidden = false;
    els.runbar.classList.remove('done');
    text(els.runlabel, 'analyzing');
    els.report.hidden = true;
    els.run.disabled = true;
    els.run.textContent = 'Analyzing';
    els.video.currentTime = 0;
    var play = els.video.play();
    if (play && play.catch) { play.catch(function () { /* autoplay refusal is harmless here */ }); }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  els.video.addEventListener('play', function () { if (!raf) raf = requestAnimationFrame(tick); });

  els.video.addEventListener('ended', function () {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    // Snap to the ledger's own totals rather than the interpolated estimate.
    var s = (report && report.session_summary) || {};
    var counts = s.counts || {};
    text(els.nExceeds, counts.EXCEEDS || 0);
    text(els.nAbstain, counts.ABSTAIN || 0);
    text(els.nTotal, s.total_crossings || 0);
    text(els.frames, 'frame ' + ((report && report.session && report.session.frame_count) || 0));
    text(els.runlabel, 'run complete');
    els.runbar.classList.add('done');
    els.run.disabled = false;
    els.run.textContent = 'Replay';
    if (report) renderReport();
  });

  els.clip.addEventListener('change', function () { selectClip(els.clip.value); });
  els.run.addEventListener('click', start);

  fetch(DEMO + 'index.json')
    .then(function (r) { return r.json(); })
    .then(function (list) {
      manifest = list;
      list.forEach(function (m) {
        var o = document.createElement('option');
        o.value = m.footage_id;
        o.textContent = m.label;
        els.clip.appendChild(o);
      });
      if (list.length) selectClip(list[0].footage_id);
    })
    .catch(function () {
      text(els.note, 'could not load the demo manifest');
      els.run.disabled = true;
    });
})();
