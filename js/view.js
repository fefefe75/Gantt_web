/* ==========================================================================
   view.js — tout le rendu DOM + SVG.
   Aucun écouteur ici : les interactions vivent dans interact.js, posées en
   délégation sur des conteneurs stables (jamais recréés).
   ========================================================================== */
(function () {
  'use strict';

  var G = window.Gantt, U = G.util;
  var V = (G.view = {});

  var el = V.el = {};

  /* Opacité des bandeaux de groupe dans la frise. La teinte du groupe posée
     sur du blanc rend à peu près ça, et contrairement à une couleur « soft »
     figée dans la palette, elle tient aussi en thème sombre (où un fond clair
     faisait ressortir les bandeaux comme des bandes blanches). */
  var BANDE_OPACITE = 0.10;

  /* ============================================================== métriques */
  var M = V.metrics = {
    startISO: '', endISO: '', days: 0, px: 4.2, width: 0,
    leftW: 320, rowH: 34, headH: 52, height: 0,
    rows: [], index: {}, scroll: 'x'
  };

  V.x = function (iso) { return U.diffDays(M.startISO, iso) * M.px; };
  V.rowTop = function (i) { return i * M.rowH; };
  V.rowY = function (i) { return i * M.rowH + M.rowH / 2; };

  /* Boîte d'une tâche dans la piste (repère piste, y compris l'en-tête) */
  V.box = function (t) {
    var i = M.index[t.id];
    if (i == null) return null;
    var y = V.rowY(i);
    if (t.milestone) return { x: V.x(t.start) + M.px / 2, y: y, w: 0, mid: true, i: i };
    var x0 = V.x(t.start);
    var x1 = V.x(U.addDays(t.end, 1));
    return { x: x0, y: y, w: Math.max(x1 - x0, 6), mid: false, i: i };
  };

  /* Point d'accroche d'une flèche : côté 'r' (fin) ou 'l' (début) */
  V.anchor = function (t, side) {
    var b = V.box(t);
    if (!b) return null;
    if (b.mid) return { x: b.x + (side === 'r' ? 10 : -10), y: b.y };
    return { x: side === 'r' ? b.x + b.w : b.x, y: b.y };
  };

  V.measure = function () {
    var r = G.range();
    M.startISO = r.startISO;
    M.endISO = r.endISO;
    M.days = r.days;
    M.px = G.pxPerDay();
    M.width = Math.round(r.days * M.px);
    M.leftW = G.state.leftWidth;
    M.rowH = G.state.rowHeight;
    M.headH = 52;
    M.rows = G.rows();
    M.index = {};
    M.rows.forEach(function (rw, i) { M.index[rw.key] = i; });
    M.height = M.rows.length * M.rowH;
    return M;
  };

  /* ============================================================== références */
  V.cache = function () {
    el.scroller = document.getElementById('scroller');
    el.canvas = document.getElementById('canvas');
    el.head = document.getElementById('head');
    el.headTrack = document.getElementById('head-track');
    el.body = document.getElementById('body');
    el.fond = document.getElementById('fond');
    el.links = document.getElementById('links');
    el.inspector = document.getElementById('inspector');
    el.grip = document.getElementById('col-grip');
    el.tip = document.getElementById('drag-tip');
    el.title = document.getElementById('project-title');
    el.toasts = document.getElementById('toast-wrap');
    el.zoom = document.getElementById('zoom');
    el.fileInput = document.getElementById('file-input');
    el.menu = document.getElementById('main-menu');
    el.topbar = document.querySelector('.topbar');
  };

  function applyVars() {
    var s = document.documentElement.style;
    s.setProperty('--left-w', G.state.leftWidth + 'px');
    s.setProperty('--row-h', G.state.rowHeight + 'px');
    s.setProperty('--head-h', M.headH + 'px');
    document.documentElement.dataset.theme = G.state.theme === 'sombre' ? 'sombre' : 'clair';
  }
  V.applyVars = applyVars;

  /* ================================================================== en-tête */
  /* Granularité réelle de l'axe, d'après le nombre de pixels par jour — et non
     d'après le nom de l'échelle : un planning de trois ans au zoom « jour »
     comprimé pour l'impression doit se replier sur des graduations plus larges,
     sinon on obtient un trait par jour et des libellés empilés illisibles. */
  V.granularite = function () {
    var px = M.px;
    if (px >= 16) return 'jour';
    if (px >= 6) return 'semaine';
    if (px >= 1.6) return 'mois';
    return 'trimestre';
  };

  function renderHead() {
    var g = V.granularite();
    var h = [];

    /* bande haute : les mois, ou les années quand un mois devient trop étroit */
    if (M.px * 30.5 >= 36) {
      var cur = U.startOfMonth(M.startISO);
      var last = M.endISO;
      while (cur <= last) {
        var fin = U.endOfMonth(cur);
        var x0 = Math.max(0, V.x(cur));
        var x1 = V.x(U.addDays(fin, 1));
        var w = Math.min(x1, M.width) - x0;
        if (w > 0) {
          var court = w < 74;
          var label = court
            ? U.mois[+cur.slice(5, 7) - 1] + ' ' + cur.slice(2, 4)
            : U.fmtMonthYear(cur);
          h.push('<div class="axis-month" style="left:' + x0 + 'px;width:' + w + 'px">' +
                 U.esc(label) + '</div>');
        }
        cur = U.addDays(fin, 1);
      }
    } else {
      var anH = M.startISO.slice(0, 4);
      while (anH + '-01-01' <= M.endISO) {
        var h0 = anH + '-01-01', h1 = (anH * 1 + 1) + '-01-01';
        var hx = Math.max(0, V.x(h0));
        var hw = Math.min(V.x(h1), M.width) - hx;
        if (hw > 0) h.push('<div class="axis-month" style="left:' + hx + 'px;width:' + hw + 'px">' + anH + '</div>');
        anH = String(anH * 1 + 1);
      }
    }

    /* bande basse : graduations */
    if (g === 'jour') {
      for (var i = 0; i < M.days; i++) {
        var d = U.addDays(M.startISO, i);
        var d5 = +d.slice(8, 10);
        var we = U.dow(d) >= 5;
        h.push('<div class="axis-tick ctr' + (we ? ' weekend' : '') + (d5 === 1 ? ' strong' : '') +
               '" style="left:' + (i * M.px) + 'px;width:' + M.px + 'px">' + d5 + '</div>');
      }
    } else if (g === 'semaine') {
      var lundi = U.startOfWeek(M.startISO);
      while (U.diffDays(lundi, M.endISO) >= 0) {
        var xx = V.x(lundi);
        var lw = 7 * M.px;
        if (xx + lw > 0 && xx < M.width) {
          h.push('<div class="axis-tick ctr' + (lw < 46 ? ' tight' : '') + '" style="left:' + xx +
                 'px;width:' + lw + 'px" title="' + U.fmtFull(lundi) + '">' +
                 (lw < 46 ? 'S' + U.weekNumber(lundi) : U.fmtShort(lundi)) + '</div>');
        }
        lundi = U.addDays(lundi, 7);
      }
    } else if (g === 'mois') {
      var an = M.startISO.slice(0, 4);
      while (an + '-01-01' <= M.endISO) {
        var a0 = an + '-01-01', a1 = (an * 1 + 1) + '-01-01';
        var ax = Math.max(0, V.x(a0));
        var aw = Math.min(V.x(a1), M.width) - ax;
        if (aw > 0) h.push('<div class="axis-tick strong" style="left:' + ax + 'px;width:' + aw + 'px">' + an + '</div>');
        an = String(an * 1 + 1);
      }
    } else {
      var q = U.startOfMonth(M.startISO);
      while (q <= M.endISO) {
        var trim = Math.floor((+q.slice(5, 7) - 1) / 3) + 1;
        var t0 = q.slice(0, 5) + U.pad2((trim - 1) * 3 + 1) + '-01';
        var t1 = U.addMonths(t0, 3);
        var tx = Math.max(0, V.x(t0));
        var tw = Math.min(V.x(t1), M.width) - tx;
        if (tw > 0) {
          h.push('<div class="axis-tick strong" style="left:' + tx + 'px;width:' + tw + 'px">' +
                 (tw < 52 ? 'T' + trim : 'T' + trim + ' ' + t0.slice(0, 4)) + '</div>');
        }
        q = t1;
      }
    }

    el.headTrack.className = 'head-track';
    el.headTrack.style.width = M.width + 'px';
    el.headTrack.innerHTML = h.join('');
  }

  /* ==================================================================== corps */
  function renderBody() {
    var out = [];
    var sel = {};
    G.state.selection.forEach(function (id) { sel[id] = 1; });
    var today = U.todayISO();
    var inside = today >= M.startISO && today <= M.endISO;

    M.rows.forEach(function (rw, i) {
      if (rw.kind === 'section') {
        var s = rw.section, col = G.colorOf(s.color);
        out.push('<div class="row section" data-kind="section" data-id="' + s.id + '" style="height:' + M.rowH + 'px">' +
          '<div class="row-left">' +
            '<div class="cell name">' +
              '<span class="sec-badge" style="background:' + col.bar + '"></span>' +
              '<button class="twist" data-toggle="' + s.id + '" title="Replier / déplier" aria-label="Replier">' +
                (s.collapsed ? '&#9656;' : '&#9662;') + '</button>' +
              '<span class="tname">' + U.esc(s.name) + '</span>' +
            '</div>' +
            '<div class="cell d"></div><div class="cell d"></div><div class="cell p"></div>' +
          '</div>' +
          '<div class="track" style="width:' + M.width + 'px"></div>' +
        '</div>');
        return;
      }

      var t = rw.task;
      var col2 = G.taskColor(t);
      var isSel = !!sel[t.id];
      var nom = U.esc(t.name);
      var duree = G.duree(t);
      var dates = t.milestone
        ? '<div class="cell d">' + U.fmtShort(t.start) + '</div><div class="cell d">&nbsp;</div>'
        : '<div class="cell d">' + U.fmtShort(t.start) + '</div><div class="cell d">' + U.fmtShort(t.end) + '</div>';
      var pct = t.milestone ? 'j' : (t.progress ? t.progress : '·');

      var corps;
      if (t.milestone) {
        var cx = V.x(t.start) + M.px / 2;
        corps = '<div class="milestone' + (isSel ? ' is-sel' : '') + '" data-id="' + t.id + '"' +
                ' style="left:' + cx + 'px;--bar-color:' + col2.bar + '" title="' + U.esc(t.name + ' — ' + U.fmtFull(t.start)) + '">' +
                U.esc(t.tag || '') + '</div>' +
                '<span class="milestone-label" style="left:' + (cx + 14) + 'px">' + nom + '</span>';
      } else {
        var b = V.box(t);
        var w = b.w;
        var dedans = w > (t.name.length * 6.2 + 22);
        corps = '<div class="bar' + (isSel ? ' is-sel' : '') +
          (w < 10 ? ' court' : (w < 30 ? ' mince' : '')) +
          '" data-id="' + t.id + '"' +
          ' style="left:' + b.x + 'px;width:' + w + 'px;--bar-color:' + col2.bar + '"' +
          ' title="' + U.esc(t.name) + '&#10;' + U.fmtFull(t.start) + ' → ' + U.fmtFull(t.end) +
          '  (' + duree + ' j)' + (t.progress ? '&#10;Avancement ' + t.progress + ' %' : '') + '">' +
          (t.progress > 0 ? '<div class="prog" style="width:' + t.progress + '%"></div>' : '') +
          '<span class="blabel' + (dedans ? '' : ' out') + '">' + nom + '</span>' +
          '<div class="grip g-l" data-grip="l" data-id="' + t.id + '"></div>' +
          '<div class="grip g-r" data-grip="r" data-id="' + t.id + '"></div>' +
          '<div class="dep-handle h-l" data-dep="l" data-id="' + t.id + '" title="Glisser vers une tâche"></div>' +
          '<div class="dep-handle h-r" data-dep="r" data-id="' + t.id + '" title="Glisser vers une tâche"></div>' +
        '</div>';
      }

      out.push('<div class="row task' + (isSel ? ' is-sel' : '') + '" data-kind="task" data-id="' + t.id + '" style="height:' + M.rowH + 'px">' +
        '<div class="row-left">' +
          '<div class="cell name">' +
            '<i class="dot" style="background:' + col2.bar + '"></i>' +
            '<span class="tname">' + nom + '</span>' +
          '</div>' +
          dates +
          '<div class="cell p">' + pct + '</div>' +
        '</div>' +
        '<div class="track" style="width:' + M.width + 'px">' + corps + '</div>' +
      '</div>');
    });

    el.body.innerHTML = out.join('');
    el.canvas.style.width = (M.leftW + M.width) + 'px';
  }

  /* ====================================================================== SVG */
  function svgPath(pts, r) {
    if (pts.length < 2) return '';
    var d = 'M ' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 1; i < pts.length - 1; i++) {
      var p = pts[i - 1], c = pts[i], n = pts[i + 1];
      var d1 = Math.hypot(c[0] - p[0], c[1] - p[1]) || 1;
      var d2 = Math.hypot(n[0] - c[0], n[1] - c[1]) || 1;
      var rr = Math.min(r, d1 / 2, d2 / 2);
      var ex = c[0] - (c[0] - p[0]) / d1 * rr, ey = c[1] - (c[1] - p[1]) / d1 * rr;
      var sx = c[0] + (n[0] - c[0]) / d2 * rr, sy = c[1] + (n[1] - c[1]) / d2 * rr;
      d += ' L ' + ex + ' ' + ey + ' Q ' + c[0] + ' ' + c[1] + ' ' + sx + ' ' + sy;
    }
    var l = pts[pts.length - 1];
    return d + ' L ' + l[0] + ' ' + l[1];
  }
  V.svgPath = svgPath;

  /* Points d'une flèche de dépendance entre deux tâches.
     Trois cas :
       1. la suivante commence après un peu d'air  -> coude en Z classique
       2. la suivante commence juste après         -> petit coude serré
       3. la suivante commence avant la fin        -> on recule par le goutte
          entre deux lignes (la ligne qui sépare les deux tâches) : une barre fait
          ~20 px centrée dans une ligne de 34 px, donc cette bande est la seule
          toujours libre de barres sur toute la largeur. La flèche descend de la
          sortie, longe le séparateur vers l'arrière, puis ressort à 90° juste
          avant la tâche et se branche sur son début. */
  V.depPoints = function (from, to) {
    var a = V.anchor(from, 'r'), b = V.anchor(to, 'l'), bt = V.box(to);
    if (!a || !b) return null;
    var g = Math.max(9, Math.min(16, M.px * 1.6));
    var x1 = a.x, y1 = a.y, x2 = b.x - 1, y2 = b.y;   /* la pointe touche la barre */
    var pts;

    if (x2 - x1 >= g) {
      pts = [[x1, y1], [x1 + g, y1], [x1 + g, y2], [x2, y2]];
    } else if (x2 - x1 >= 0) {
      var m = Math.min((x2 - x1) / 2, g);
      pts = [[x1, y1], [x1 + m, y1], [x1 + m, y2], [x2, y2]];
    } else {
      var recul = Math.max(8, Math.min(14, g));
      /* séparateur au plus près de la cible : au-dessus de sa ligne si elle est
         plus basse, en dessous si elle est plus haute */
      var goutte = bt ? (bt.y > a.y ? V.rowTop(bt.i) : V.rowTop(bt.i) + M.rowH)
                      : (y2 - M.rowH / 2);
      pts = [[x1, y1], [x1 + g, y1], [x1 + g, goutte], [x2 - recul, goutte],
             [x2 - recul, y2], [x2, y2]];
    }

    /* supprime les points confondus (coude dégénéré) */
    var out = [];
    pts.forEach(function (p) {
      var q = out[out.length - 1];
      if (!q || Math.abs(p[0] - q[0]) > 0.6 || Math.abs(p[1] - q[1]) > 0.6) out.push(p);
    });
    if (out.length < 2) return null;
    out.forEach(function (p) { p[0] = Math.max(p[0], 2); });
    return out;
  };

  /* Sépare la ligne de sa pointe : le trait s'arrête à la base de la pointe
     (plus de jonction en pointe sèche qui « flotte » au bout du fil).
     Renvoie { ligne: [[x,y],…], tete: [[x,y],[x,y],[x,y]] } — des points, pour
     que le rendu écran et l'export SVG puissent les décaler chacun à sa façon. */
  V.arrowGeom = function (pts) {
    var tip = pts[pts.length - 1], prev = pts[pts.length - 2];
    var ligne = pts.slice();
    var demi = 3.9, hl = 7;
    var horizontal = Math.abs(tip[1] - prev[1]) < 0.8 && Math.abs(tip[0] - prev[0]) > 0.5;

    if (!horizontal) {
      return { ligne: ligne, tete: [[tip[0] - 6, tip[1] - 4], [tip[0], tip[1]], [tip[0] - 6, tip[1] + 4]] };
    }

    var longueur = Math.abs(tip[0] - prev[0]);
    hl = Math.min(hl, Math.max(3, longueur - 1));
    var bx = tip[0] - (tip[0] >= prev[0] ? hl : -hl);
    ligne[ligne.length - 1] = [bx, tip[1]];
    return {
      ligne: ligne,
      tete: [[bx, tip[1] - demi], [tip[0], tip[1]], [bx, tip[1] + demi]]
    };
  };

  function chemin(points, decalX, decalY) {
    var d = '';
    for (var i = 0; i < points.length; i++) {
      d += (i ? ' L ' : 'M ') + (points[i][0] + decalX) + ' ' + (points[i][1] + decalY);
    }
    return d;
  }
  V.chemin = chemin;

  function drawSvg() {
    var g = V.granularite();
    var fond = [];    /* bandeaux, week-ends, grille, ligne du jour : SOUS les barres */
    var out = [];     /* flèches de dépendance : au-dessus des barres */
    var H = M.height;

    /* --- fonds de groupe --- */
    M.rows.forEach(function (rw, i) {
      if (rw.kind !== 'section') return;
      var col = G.colorOf(rw.section.color);
      fond.push('<rect class="band" x="0" y="' + V.rowTop(i) + '" width="' + M.width +
                '" height="' + M.rowH + '" fill="' + col.bar + '" fill-opacity="' + BANDE_OPACITE + '"/>');
    });

    /* --- week-ends (seulement si les jours sont assez larges) --- */
    if ((g === 'jour' || g === 'semaine') && M.px >= 3) {
      for (var i = 0; i < M.days; i++) {
        var d = U.addDays(M.startISO, i);
        if (U.dow(d) < 5) continue;
        fond.push('<rect x="' + (i * M.px) + '" y="0" width="' + M.px + '" height="' + H +
                  '" fill="var(--weekend)"/>');
      }
    }

    /* --- lignes verticales, à la granularité réelle de l'axe --- */
    var lignes = [];
    function trace(iso, fort) {
      lignes.push('<line x1="' + V.x(iso) + '" y1="0" x2="' + V.x(iso) + '" y2="' + H +
                  '" stroke="var(--grid' + (fort ? '-strong' : '') + ')" stroke-width="1"/>');
    }
    if (g === 'jour') {
      for (var j = 0; j <= M.days; j++) {
        var dd = U.addDays(M.startISO, j);
        trace(dd, dd.slice(8, 10) === '01' || U.dow(dd) === 0);
      }
    } else if (g === 'semaine') {
      var l = U.startOfWeek(M.startISO);
      while (U.diffDays(l, M.endISO) >= -6) { trace(l, false); l = U.addDays(l, 7); }
    } else if (g === 'mois') {
      var mm = U.startOfMonth(M.startISO);
      while (mm <= M.endISO) {
        trace(mm, mm.slice(5, 7) === '01');
        mm = U.addDays(U.endOfMonth(mm), 1);
      }
    } else {
      var deb = U.startOfMonth(M.startISO);
      var trim0 = Math.floor((+deb.slice(5, 7) - 1) / 3) * 3 + 1;
      var cq = deb.slice(0, 5) + U.pad2(trim0) + '-01';
      while (cq <= M.endISO) {
        trace(cq, cq.slice(5, 7) === '01');
        cq = U.addMonths(cq, 3);
      }
    }
    var finD = U.addDays(M.endISO, 1);
    lignes.push('<line x1="' + V.x(finD) + '" y1="0" x2="' + V.x(finD) + '" y2="' + H +
                '" stroke="var(--grid-strong)" stroke-width="1"/>');
    fond.push(lignes.join(''));

    /* --- aujourd'hui --- */
    var today = U.todayISO();
    if (today >= M.startISO && today <= M.endISO) {
      var tx = V.x(today) + M.px / 2;
      fond.push('<line x1="' + tx + '" y1="0" x2="' + tx + '" y2="' + H +
                '" stroke="var(--today)" stroke-width="1.5" opacity=".5"/>');
    }

    /* --- dépendances --- */
    G.state.tasks.forEach(function (t) {
      (t.deps || []).forEach(function (dep) {
        var from = G.taskById(dep.id);
        if (!from) return;
        var pts = V.depPoints(from, t);
        if (!pts) return;
        var hot = G.state.selection.indexOf(t.id) >= 0 || G.state.selection.indexOf(from.id) >= 0;
        var geom = V.arrowGeom(pts);
        out.push('<path class="arrow' + (hot ? ' hot' : '') + '" d="' + svgPath(geom.ligne, 5) + '"/>');
        out.push('<path class="head-mark" d="' + chemin(geom.tete, 0, 0) + ' Z"/>');
      });
    });

    /* les deux calques reçoivent la même géométrie */
    [[el.fond, fond], [el.links, out]].forEach(function (couche) {
      var node = couche[0];
      if (!node) return;
      node.setAttribute('width', M.width);
      node.setAttribute('height', Math.max(H, 1));
      node.style.left = M.leftW + 'px';
      node.style.top = M.headH + 'px';
      node.style.width = M.width + 'px';
      node.style.height = Math.max(H, 1) + 'px';
      node.innerHTML = couche[1].join('');
    });
  }
  V.drawSvg = drawSvg;

  /* ================================================================= drapeau */
  function renderTodayFlag() {
    var today = U.todayISO();
    var flag = el.headTrack.querySelector('.today-flag');
    if (flag) flag.remove();
    if (today < M.startISO || today > M.endISO) return;
    var d = document.createElement('div');
    d.className = 'today-flag';
    d.textContent = "Aujourd'hui";
    d.style.left = (V.x(today) + M.px / 2) + 'px';
    el.headTrack.appendChild(d);
  }

  /* ============================================================= mise à jour */
  /* Rapide : utilisée pendant un glisser (pas de reconstruction du DOM). */
  V.refreshTask = function (t) {
    var bar = el.body.querySelector('.bar[data-id="' + t.id + '"],.milestone[data-id="' + t.id + '"]');
    var row = el.body.querySelector('.row[data-id="' + t.id + '"]');
    if (bar) {
      if (t.milestone) {
        var cx = V.x(t.start) + M.px / 2;
        bar.style.left = cx + 'px';
        var lab = row && row.querySelector('.milestone-label');
        if (lab) lab.style.left = (cx + 14) + 'px';
      } else {
        var b = V.box(t);
        bar.style.left = b.x + 'px';
        bar.style.width = b.w + 'px';
        var prog = bar.querySelector('.prog');
        if (prog) prog.style.width = (t.progress || 0) + '%';
      }
    }
    if (row) {
      var ds = row.querySelectorAll('.cell.d');
      if (ds.length === 2) {
        if (t.milestone) { ds[0].textContent = U.fmtShort(t.start); ds[1].innerHTML = '&nbsp;'; }
        else { ds[0].textContent = U.fmtShort(t.start); ds[1].textContent = U.fmtShort(t.end); }
      }
    }
  };

  V.refreshSelection = function () {
    var sel = {};
    G.state.selection.forEach(function (id) { sel[id] = 1; });
    var nodes = el.body.querySelectorAll('.row');
    for (var i = 0; i < nodes.length; i++) {
      var id = nodes[i].getAttribute('data-id');
      nodes[i].classList.toggle('is-sel', !!sel[id]);
    }
    var bars = el.body.querySelectorAll('.bar,.milestone');
    for (var k = 0; k < bars.length; k++) {
      bars[k].classList.toggle('is-sel', !!sel[bars[k].getAttribute('data-id')]);
    }
  };

  /* ================================================================ infobulle */
  V.tip = function (x, y, texte) {
    el.tip.textContent = texte;
    el.tip.hidden = false;
    el.tip.style.left = (x + 14) + 'px';
    el.tip.style.top = (y + 16) + 'px';
  };
  V.untip = function () { el.tip.hidden = true; };

  /* =================================================================== toasts */
  V.toast = function (msg, kind, ms) {
    var d = document.createElement('div');
    d.className = 'toast' + (kind ? ' ' + kind : '');
    d.innerHTML = msg;
    el.toasts.appendChild(d);
    setTimeout(function () {
      d.style.transition = 'opacity 200ms';
      d.style.opacity = '0';
      setTimeout(function () { d.remove(); }, 220);
    }, ms || 2200);
  };

  /* ================================================================ inspecteur */
  function champ(cle, libelle, contenu, hint) {
    return '<div class="field"><label for="f-' + cle + '">' + libelle + '</label>' + contenu +
           (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>';
  }

  function renderInspector() {
    var sel = G.state.selection;
    var html = null;
    if (sel.length === 1) {
      var t = G.taskById(sel[0]);
      if (t) html = panneauTache(t);
    }
    if (!html) html = sel.length > 1 ? panneauLot(sel) : panneauProjet();

    el.inspector.innerHTML = html;
    el.inspector.classList.toggle('open', G.panneauOuvert !== false);
  }
  V.renderInspector = renderInspector;

  V.togglePanneau = function () {
    G.panneauOuvert = (G.panneauOuvert === false);
    el.inspector.classList.toggle('open', G.panneauOuvert !== false);
  };

  function optionsGroupes(selId) {
    return G.state.sections.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === selId ? ' selected' : '') + '>' + U.esc(s.name) + '</option>';
    }).join('');
  }

  /* Champ de date : saisie libre (« 2025-10-01 », « 01/10/2025 », « 1.10.2025 »)
     plus un bouton calendrier. Le sélecteur natif du navigateur est écarté :
     son popup débordait de l'écran au bord droit du panneau. */
  function champDate(cle, libelle, valeur, desactive) {
    return '<div class="field"><label for="f-' + cle + '">' + libelle + '</label>' +
      '<div class="champ-date">' +
        '<input type="text" id="f-' + cle + '" data-field="' + cle + '" value="' + U.esc(valeur) + '"' +
        ' autocomplete="off" spellcheck="false" placeholder="AAAA-MM-JJ"' +
        (desactive ? ' disabled' : '') + '>' +
        '<button type="button" class="btn-cal" data-cal="' + cle + '"' + (desactive ? ' disabled' : '') +
        ' title="Choisir dans le calendrier" aria-label="Choisir dans le calendrier">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/>' +
        '<path d="M3.5 9.5h17M8 3.5v3M16 3.5v3"/></svg></button>' +
      '</div></div>';
  }

  function panneauTache(t) {
    var col = G.taskColor(t);
    var duree = G.duree(t);
    var autres = G.state.tasks.filter(function (x) { return x.id !== t.id; });
    var preds = (t.deps || []).map(function (d) {
      var p = G.taskById(d.id);
      if (!p) return '';
      return '<span class="chip"><span>' + U.esc(p.name) + '</span>' +
             '<button data-unlink="' + p.id + '" title="Retirer le lien">&#215;</button></span>';
    }).join('');

    var swatches = G.PALETTE.map(function (c) {
      return '<button class="swatch" data-color="' + c.id + '" style="background:' + c.bar + '"' +
             ' aria-pressed="' + (t.color === c.id ? 'true' : 'false') + '" title="' + c.name + '"' +
             ' aria-label="' + c.name + '"></button>';
    }).join('');

    return '<div class="insp">' +
      '<div class="insp-head"><h2>' + (t.milestone ? 'Jalon' : 'Tâche') + '</h2>' +
        '<button class="icon-btn" data-act="deselect" title="Désélectionner (Échap)" aria-label="Désélectionner">&#215;</button></div>' +
      '<div class="insp-body">' +

      champ('nom', 'Nom',
        '<input type="text" id="f-nom" data-field="name" value="' + U.esc(t.name) + '" spellcheck="false">') +

      champ('section', 'Groupe',
        '<select id="f-section" data-field="section">' + optionsGroupes(t.section) + '</select>') +

      '<div class="row2">' +
        champDate('start', 'Début', t.start, false) +
        champDate('end', 'Fin', t.end, t.milestone) +
      '</div>' +

      '<div class="row2">' +
        '<div class="field"><label for="f-duree">Durée (jours)</label>' +
          '<input type="number" id="f-duree" data-field="duration" min="0" value="' + duree + '"' +
          (t.milestone ? ' disabled' : '') + '></div>' +
        '<div class="field"><label for="f-av">Avancement %</label>' +
          '<input type="number" id="f-av" data-field="progress" min="0" max="100" step="5" value="' + t.progress + '"></div>' +
      '</div>' +

      champ('jalon', 'Type',
        '<label class="switch"><input type="checkbox" id="f-jalon" data-field="milestone"' +
        (t.milestone ? ' checked' : '') + '> Jalon (durée nulle)</label>') +

      champ('couleur', 'Couleur',
        '<div class="swatches">' +
          '<button class="swatch" data-color="" aria-pressed="' + (t.color ? 'false' : 'true') + '"' +
            ' style="background:' + G.colorOf(G.sectionById(t.section) ? G.sectionById(t.section).color : 'azur').bar +
            '" title="Couleur du groupe" aria-label="Couleur du groupe">&#8203;</button>' +
          swatches +
        '</div>') +

      champ('notes', 'Notes',
        '<textarea id="f-notes" data-field="notes" rows="3" placeholder="Détails, livrable, référence…">' + U.esc(t.notes) + '</textarea>') +

      champ('preds', 'Prédécesseurs',
        (preds ? '<div class="chips">' + preds + '</div>' : '<span class="hint">Aucun. Glissez le rond bleu d\'une barre vers une autre, ou :</span>') +
        '<select id="f-pred" data-field="addpred"><option value="">— ajouter un prédécesseur —</option>' +
        autres.map(function (x) { return '<option value="' + x.id + '">' + U.esc(x.name) + '</option>'; }).join('') +
        '</select>', 'Fin → début') +

      '<h3>Raccourcis</h3>' +
      '<div class="keys">' +
        '<div><b>Déplacer</b><span>glisser la barre</span></div>' +
        '<div><b>Durée</b><span>glisser les bords</span></div>' +
        '<div><b>Lien</b><span>glisser le rond bleu</span></div>' +
        '<div><b>± 1 jour</b><kbd>&#8592;</kbd><kbd>&#8594;</kbd></div>' +
      '</div>' +

      '</div>' +

      '<div class="insp-actions">' +
        '<button class="btn" data-act="dup">Dupliquer</button>' +
        '<button class="btn btn-danger" data-act="del">Supprimer</button>' +
      '</div>' +
    '</div>';
  }

  function panneauLot(sel) {
    var n = sel.length;
    var taches = sel.map(G.taskById).filter(Boolean);
    var tous = taches.every(function (t) { return t.milestone; });
    return '<div class="insp">' +
      '<div class="insp-head"><h2>' + n + ' éléments</h2>' +
        '<button class="icon-btn" data-act="deselect" title="Désélectionner (Échap)" aria-label="Désélectionner">&#215;</button></div>' +
      '<div class="insp-body">' +
        '<span class="empty-note">' + n + ' tâches sélectionnées.<br>' +
        (tous ? '<b>Tous des jalons.</b>' : '<b>' + taches.filter(function (t) { return !t.milestone; }).length + ' barres</b>, ' +
        taches.filter(function (t) { return t.milestone; }).length + ' jalons.') + '</span>' +
        champ('dec', 'Décaler de',
          '<div class="row2">' +
            '<button class="btn" data-shift="-7">&#8722; 7 j</button>' +
            '<button class="btn" data-shift="7">+ 7 j</button>' +
          '</div><div class="row2" style="margin-top:6px">' +
            '<button class="btn" data-shift="-1">&#8722; 1 j</button>' +
            '<button class="btn" data-shift="1">+ 1 j</button>' +
          '</div>') +
        champ('av', 'Avancement %',
          '<input type="number" data-field="progressMulti" min="0" max="100" step="5" value="' +
          Math.round(taches.reduce(function (a, t) { return a + (t.progress || 0); }, 0) / n) + '">') +
        champ('sec', 'Déplacer vers le groupe',
          '<select data-field="sectionMulti">' + optionsGroupes('') + '</select>') +
      '</div>' +
      '<div class="insp-actions">' +
        '<button class="btn" data-act="copy">Copier</button>' +
        '<button class="btn btn-danger" data-act="del">Supprimer</button>' +
      '</div>' +
    '</div>';
  }

  function panneauProjet() {
    var nbT = G.state.tasks.length;
    var nbJ = G.state.tasks.filter(function (t) { return t.milestone; }).length;
    var ex = G.extent();
    return '<div class="insp">' +
      '<div class="insp-head"><h2>Planning</h2></div>' +
      '<div class="insp-body">' +
        champ('titre', 'Titre',
          '<input type="text" data-field="title" value="' + U.esc(G.state.title) + '" spellcheck="false">') +
        champ('echelle', 'Échelle par défaut',
          '<select data-field="zoom">' +
          G.ZOOM_ORDER.map(function (z) {
            return '<option value="' + z + '"' + (G.state.zoom === z ? ' selected' : '') + '>' + G.ZOOMS[z].label + '</option>';
          }).join('') + '</select>') +
        champ('theme', 'Thème',
          '<select data-field="theme">' +
            '<option value="clair"' + (G.state.theme === 'clair' ? ' selected' : '') + '>Clair</option>' +
            '<option value="sombre"' + (G.state.theme === 'sombre' ? ' selected' : '') + '>Sombre</option>' +
          '</select>') +
        champ('densite', 'Hauteur de ligne',
          '<input type="range" min="26" max="56" step="2" data-field="rowHeight" value="' + G.state.rowHeight + '">') +
        '<span class="empty-note">' + nbT + ' tâches dont ' + nbJ + ' jalons.<br>' +
        'Du ' + U.fmtLong(ex.min) + ' au ' + U.fmtLong(ex.max) + '.</span>' +

        '<h3>Raccourcis</h3>' +
        '<div class="keys">' +
          '<div><b>Nouvelle tâche</b><kbd>Alt</kbd><kbd>N</kbd></div>' +
          '<div><b>Enregistrer un .json</b><kbd>Ctrl</kbd><kbd>S</kbd></div>' +
          '<div><b>Ouvrir un .json</b><kbd>Ctrl</kbd><kbd>O</kbd></div>' +
          '<div><b>Copier / coller</b><kbd>Ctrl</kbd><kbd>C</kbd><kbd>V</kbd></div>' +
          '<div><b>Dupliquer</b><kbd>Ctrl</kbd><kbd>D</kbd></div>' +
          '<div><b>Annuler / rétablir</b><kbd>Ctrl</kbd><kbd>Z</kbd></div>' +
          '<div><b>Tout sélectionner</b><kbd>Ctrl</kbd><kbd>A</kbd></div>' +
          '<div><b>Supprimer</b><kbd>Suppr</kbd></div>' +
          '<div><b>Zoom</b><kbd>Ctrl</kbd><kbd>molette</kbd></div>' +
          '<div><b>Déplacer 1 jour</b><kbd>&#8592;</kbd><kbd>&#8594;</kbd></div>' +
          '<div><b>Étirer la fin</b><kbd>Maj</kbd><kbd>&#8592;</kbd><kbd>&#8594;</kbd></div>' +
          '<div><b>Dupliquer en glissant</b><kbd>Alt</kbd><kbd>glisser</kbd></div>' +
          '<div><b>Lier deux tâches</b><span>rond bleu</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="insp-actions">' +
        '<button class="btn" data-act="add-section">+ Groupe</button>' +
        '<button class="btn btn-primary" data-act="add-task">+ Tâche</button>' +
      '</div>' +
    '</div>';
  }

  /* ================================================================== rendu */
  V.render = function () {
    if (G.fermerCalendrier) G.fermerCalendrier();
    if (G.fermerMenuCtx) G.fermerMenuCtx();
    applyVars();
    V.measure();
    renderHead();
    renderBody();
    drawSvg();
    renderTodayFlag();
    renderInspector();
    V.syncToolbar();
  };

  /* Rendu du graphe seul : ne touche pas à l'inspecteur (donc pas de perte
     de focus pendant qu'on tape dans un champ). */
  V.refreshChart = function () {
    applyVars();
    V.measure();
    renderHead();
    renderBody();
    drawSvg();
    renderTodayFlag();
  };

  V.syncToolbar = function () {
    if (el.title && el.title.value !== G.state.title) el.title.value = G.state.title;
    if (el.zoom) {
      Array.prototype.forEach.call(el.zoom.querySelectorAll('button'), function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.zoom === G.state.zoom && !G.state.pxOverride));
      });
    }
    ['undo', 'redo'].forEach(function (a) {
      var b = document.querySelector('[data-act="' + a + '"]');
      if (!b) return;
      b.disabled = a === 'undo' ? !G.history.canUndo() : !G.history.canRedo();
    });
  };

  /* ================================================================ viewport */
  /* Amène une date dans la zone visible (sans saut si déjà visible) */
  V.ensureVisible = function (iso, force) {
    var x = V.x(iso) + M.leftW;                 // abscisse dans le canevas
    var vw = el.scroller.clientWidth;
    var l = el.scroller.scrollLeft;
    if (force || x < l + M.leftW + 24 || x > l + vw - 60) {
      el.scroller.scrollLeft = Math.max(0, x - M.leftW - (vw - M.leftW) / 2);
    }
  };

  /* Change d'échelle en gardant sous le curseur la date pointée */
  V.zoomTo = function (zoom, anchorClientX) {
    if (!G.ZOOMS[zoom]) return;
    var ancienPx = G.pxPerDay();
    var rect = el.scroller.getBoundingClientRect();
    var vpX = (anchorClientX == null)
      ? (el.scroller.clientWidth + M.leftW) / 2
      : (anchorClientX - rect.left);
    var jour = (el.scroller.scrollLeft + vpX - M.leftW) / ancienPx;   // index de jour sous le curseur

    G.state.zoom = zoom;
    G.state.pxOverride = null;
    V.measure();
    V.render();
    el.scroller.scrollLeft = Math.max(0, M.leftW + jour * M.px - vpX);
  };

  V.fit = function () {
    var dispo = el.scroller.clientWidth - M.leftW - 16;
    var r = G.range();
    if (dispo <= 60 || r.days <= 0) return;
    G.state.pxOverride = Math.max(0.6, dispo / r.days);
    V.render();
    el.scroller.scrollLeft = 0;
  };

  V.gotoToday = function () { V.ensureVisible(U.todayISO(), true); };

})();
