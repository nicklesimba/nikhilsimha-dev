/* Case study demo driver.
 *
 * Everything shown comes from files rendered by the real pipeline: the source
 * clip, the overlay video, and the exact JSON the app's own /compliance_data
 * endpoint produced for that run. Nothing here recomputes a verdict; this only
 * plays back what the pipeline decided, paced to the video so the run reads the
 * way it does live.
 *
 * Wording follows the tool's own UI: "flagged" for a certificate-grade
 * exceedance, "undecided" for an abstention, "within limit" for the verdict it
 * never issues.
 */

(function () {
  'use strict';

  var DEMO = 'demo/';

  var els = {
    clip: document.getElementById('clip'),
    run: document.getElementById('run'),
    runState: document.getElementById('run-state'),
    note: document.getElementById('clip-note'),
    video: document.getElementById('video'),
    videoSrc: document.getElementById('video-src'),
    veil: document.getElementById('veil'),
    veilSrc: document.getElementById('veil-src'),
    runbar: document.getElementById('runbar'),
    runlabel: document.getElementById('runlabel'),
    frames: document.getElementById('frames'),
    nExceeds: document.getElementById('n-exceeds'),
    nAbstain: document.getElementById('n-abstain'),
    nClear: document.getElementById('n-clear'),
    nTotal: document.getElementById('n-total'),
    report: document.getElementById('report'),
    honest: document.getElementById('honest'),
    sign: document.getElementById('sign'),
    postingKv: document.getElementById('posting-kv'),
    postingCaveat: document.getElementById('posting-caveat'),
    bridgeKv: document.getElementById('bridge-kv'),
    abstainList: document.getElementById('abstain-list'),
    structureLine: document.getElementById('structure-line'),
    runKv: document.getElementById('run-kv'),
    cumulativeKv: document.getElementById('cumulative-kv'),
    byday: document.getElementById('byday'),
    byclass: document.getElementById('byclass'),
    timeline: document.getElementById('timeline'),
    bucketNote: document.getElementById('bucket-note'),
    tEnd: document.getElementById('t-end'),
    evidencePolicy: document.getElementById('evidence-policy'),
    evidenceHeuristic: document.getElementById('evidence-heuristic')
  };

  function table(el, headers, rows) {
    var html = '<tr>' + headers.map(function (h) {
      return '<th>' + h + '</th>';
    }).join('') + '</tr>';
    rows.forEach(function (r) {
      html += '<tr>' + r.map(function (c) {
        var cls = c && c.cls ? ' class="' + c.cls + '"' : '';
        var v = c && typeof c === 'object' ? c.v : c;
        return '<td' + cls + '>' + (v == null ? '' : v) + '</td>';
      }).join('') + '</tr>';
    });
    el.innerHTML = html;
  }

  // "0 of 0" rather than a reassuring 0%: the tool refuses to print a rate
  // whose denominator is zero, and so does this page.
  function rate(n, d) {
    if (!d) return 'no decided crossings';
    return Math.round((n / d) * 100) + '%  (' + n + ' of ' + d + ')';
  }

  var manifest = [];
  var current = null;
  var report = null;
  var raf = 0;

  function text(el, s) { if (el) el.textContent = s == null ? '' : String(s); }

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

  function num(n) { return typeof n === 'number' ? n.toLocaleString('en-US') : n; }

  // The ledger reports crossings in fixed-width time buckets. Turn those into a
  // cumulative count at an arbitrary playhead position, interpolating inside the
  // active bucket so the numbers climb steadily instead of jumping every 5 s.
  function tallyAt(t) {
    var out = { EXCEEDS: 0, ABSTAIN: 0, CLEAR: 0, total: 0 };
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
      out.CLEAR += (b.CLEAR || 0) * frac;
      out.total += (b.total || 0) * frac;
    });
    out.EXCEEDS = Math.floor(out.EXCEEDS);
    out.ABSTAIN = Math.floor(out.ABSTAIN);
    out.CLEAR = Math.floor(out.CLEAR);
    out.total = Math.floor(out.total);
    return out;
  }

  function tick() {
    if (els.video.paused || els.video.ended) { raf = 0; return; }
    var t = els.video.currentTime;
    var c = tallyAt(t);
    text(els.nExceeds, c.EXCEEDS);
    text(els.nAbstain, c.ABSTAIN);
    text(els.nClear, c.CLEAR);
    text(els.nTotal, c.total);
    var fps = (current && current.fps) || 30;
    text(els.frames, 'frame ' + Math.min(Math.round(t * fps), current ? current.frames : 0));

    // Keep the source pane locked to the overlay pane. They are the same clip at
    // the same rate, so they only drift if one stalls on a slow network.
    if (els.videoSrc.readyState >= 2 && Math.abs(els.videoSrc.currentTime - t) > 0.25) {
      els.videoSrc.currentTime = t;
    }
    raf = requestAnimationFrame(tick);
  }

  function renderReport() {
    var s = report.session_summary || {};
    var p = report.posting || {};
    var b = (report.bridge_info && report.bridge_info.bridge) || {};
    var priv = report.privacy || {};

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

    var risk = (report.bridge_info && report.bridge_info.risk) || {};
    kv(els.bridgeKv, [
      ['Bridge', b.location || b.facility_carried],
      ['Structure number', b.structure_number],
      ['Risk score', risk.score != null ? risk.score + ' / 100' : null],
      ['Built / reconstructed',
        [b.year_built, b.year_reconstructed].filter(Boolean).join(' / ')],
      ['Condition: deck / super / sub',
        [b.deck_cond, b.superstructure_cond, b.substructure_cond].join(' / ')],
      ['Load rating (operating)',
        b.operating_rating_tons != null ? b.operating_rating_tons + ' metric t' : null],
      ['NBI posting code (item 70)', b.posting_eval],
      ['ADT', b.adt != null ? num(b.adt) + (b.adt_year ? ' (' + b.adt_year + ')' : '') : null]
    ]);

    // --- this run -------------------------------------------------------
    var sess = report.session || {};
    kv(els.runKv, [
      ['Footage', report.footage_label || sess.footage_id],
      ['Structure number', sess.structure_number],
      ['Session', sess.session_id],
      ['Started / ended',
        [sess.started_at, sess.ended_at].filter(Boolean).join('  ->  ')],
      ['Frames read', num(sess.frame_count)],
      ['Posting used', p.sign_text || 'none on record'],
      ['Run notes', sess.notes || 'none']
    ]);

    // --- cumulative for this structure ----------------------------------
    var ss = report.structure_summary || {};
    kv(els.cumulativeKv, [
      ['Sessions', num(ss.sessions)],
      ['Crossings', num(ss.total_crossings)],
      ['Decided', num(ss.decided)],
      ['Flagged', num(ss.certificate_grade_exceedances)],
      ['Undecided', num(ss.abstentions)],
      ['Flag rate', rate(ss.certificate_grade_exceedances || 0,
                         ss.exceedance_rate_denominator || 0)]
    ]);
    text(els.structureLine, ss.honest_label || '');

    // --- by day ---------------------------------------------------------
    table(els.byday,
      ['Date', 'Crossings', 'Decided', 'Flagged', 'Undecided', 'Flag rate'],
      (ss.per_day || []).map(function (d) {
        return [d.date, num(d.total), num(d.decided),
                { v: num(d.exceeds), cls: d.exceeds ? 'flagged' : 'dim' },
                { v: num(d.abstain), cls: d.abstain ? 'undecided' : 'dim' },
                { v: rate(d.exceeds || 0, d.exceedance_rate_denominator || 0),
                  cls: 'dim' }];
      }));

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

    // --- crossings by vehicle class -------------------------------------
    var byClass = s.by_class || {};
    table(els.byclass,
      ['Class', 'Crossings', 'Flagged', 'Within limit', 'Undecided'],
      Object.keys(byClass).sort(function (x, y) {
        return (byClass[y].total || 0) - (byClass[x].total || 0);
      }).map(function (cls) {
        var r = byClass[cls];
        return [cls, num(r.total || 0),
                { v: num(r.EXCEEDS || 0), cls: r.EXCEEDS ? 'flagged' : 'dim' },
                { v: num(r.CLEAR || 0), cls: 'dim' },
                { v: num(r.ABSTAIN || 0), cls: r.ABSTAIN ? 'undecided' : 'dim' }];
      }));

    // --- timeline through the clip --------------------------------------
    var rows = s.timeline || [];
    text(els.bucketNote, rows.length
      ? 'One column = ' + (s.timeline_bucket_s || 5) + ' s of video.' : '');
    if (!rows.length) {
      els.timeline.innerHTML = '<span class="muted small">No crossings recorded.</span>';
      text(els.tEnd, '');
    } else {
      var max = Math.max.apply(null, rows.map(function (r) { return r.total || 0; })) || 1;
      els.timeline.innerHTML = rows.map(function (r) {
        var h = function (n) { return Math.round(((n || 0) / max) * 100); };
        return '<div class="tcol" title="' + (r.start_s || 0) + ' s: ' + (r.total || 0) +
          ' crossing(s)">' +
          '<div class="tseg e" style="height:' + h(r.EXCEEDS) + '%"></div>' +
          '<div class="tseg c" style="height:' + h(r.CLEAR) + '%"></div>' +
          '<div class="tseg a" style="height:' + h(r.ABSTAIN) + '%"></div>' +
          '</div>';
      }).join('');
      var last = rows[rows.length - 1];
      text(els.tEnd, Math.round((last.start_s || 0) + (s.timeline_bucket_s || 5)) + ' s');
    }

    text(els.evidencePolicy, priv.evidence_policy || '');
    text(els.evidenceHeuristic, priv.heuristic || '');

    els.report.hidden = false;
  }

  function resetForClip() {
    els.report.hidden = true;
    els.veil.hidden = false;
    els.veilSrc.hidden = false;
    els.runbar.hidden = true;
    els.runbar.classList.remove('done');
    text(els.nExceeds, '0');
    text(els.nAbstain, '0');
    text(els.nClear, '0');
    text(els.nTotal, '0');
    text(els.frames, 'frame 0');
    els.run.disabled = false;
    els.run.textContent = 'Analyze this crossing';
    els.runState.innerHTML =
      'Nothing running yet. Press <em>Analyze this crossing</em> to start.';
  }

  function selectClip(id) {
    current = manifest.filter(function (m) { return m.footage_id === id; })[0];
    if (!current) return;
    resetForClip();
    els.video.src = DEMO + current.video;
    els.videoSrc.src = DEMO + current.source;
    els.video.load();
    els.videoSrc.load();
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
    els.veilSrc.hidden = true;
    els.runbar.hidden = false;
    els.runbar.classList.remove('done');
    text(els.runlabel, 'analyzing');
    els.report.hidden = true;
    els.run.disabled = true;
    els.run.textContent = 'Analyzing';
    text(els.runState, 'Running. The tally fills in as the clip plays.');
    els.video.currentTime = 0;
    els.videoSrc.currentTime = 0;
    [els.videoSrc, els.video].forEach(function (v) {
      var play = v.play();
      if (play && play.catch) { play.catch(function () { /* autoplay refusal is harmless */ }); }
    });
    if (!raf) raf = requestAnimationFrame(tick);
  }

  els.video.addEventListener('play', function () { if (!raf) raf = requestAnimationFrame(tick); });

  els.video.addEventListener('ended', function () {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    els.videoSrc.pause();
    // Snap to the ledger's own totals rather than the interpolated estimate.
    var s = (report && report.session_summary) || {};
    var counts = s.counts || {};
    text(els.nExceeds, counts.EXCEEDS || 0);
    text(els.nAbstain, counts.ABSTAIN || 0);
    text(els.nClear, counts.CLEAR || 0);
    text(els.nTotal, s.total_crossings || 0);
    text(els.frames, 'frame ' + ((report && report.session && report.session.frame_count) || 0));
    text(els.runlabel, 'run complete');
    els.runbar.classList.add('done');
    els.run.disabled = false;
    els.run.textContent = 'Replay';
    text(els.runState, 'Run complete. The audit record is below.');
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
