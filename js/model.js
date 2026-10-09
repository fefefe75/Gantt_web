/* ==========================================================================
   model.js — état, données, dates, historique, persistance
   Aucune dépendance. Expose tout sous window.Gantt.
   ========================================================================== */
(function () {
  'use strict';

  var G = (window.Gantt = window.Gantt || {});

  /* ================================================================ dates ==
     Tout est stocké en "AAAA-MM-JJ". Les calculs passent par des timestamps
     UTC à midi : aucun décalage d'heure d'été, aucun fuseau qui décale un jour.
     ======================================================================== */

  var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
              'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  var MOIS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                   'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  var JOURS = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  var MS_JOUR = 86400000;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  var util = G.util = {
    pad2: pad2,

    uid: function (prefix) {
      return (prefix || 'id') + '_' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    },

    /* 'AAAA-MM-JJ' -> ms UTC (midi) */
    ts: function (iso) {
      if (!iso) return NaN;
      var p = String(iso).slice(0, 10).split('-');
      return Date.UTC(+p[0], +p[1] - 1, +p[2], 12, 0, 0);
    },

    /* ms -> 'AAAA-MM-JJ' */
    iso: function (ms) {
      var d = new Date(ms);
      return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
    },

    todayISO: function () {
      var d = new Date();
      return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    },

    addDays: function (iso, n) {
      return util.iso(util.ts(iso) + n * MS_JOUR);
    },

    /* b - a, en jours entiers */
    diffDays: function (a, b) {
      return Math.round((util.ts(b) - util.ts(a)) / MS_JOUR);
    },

    /* 0 = lundi … 6 = dimanche */
    dow: function (iso) { return (new Date(util.ts(iso)).getUTCDay() + 6) % 7; },

    startOfWeek: function (iso) { return util.addDays(iso, -util.dow(iso)); },

    startOfMonth: function (iso) { return iso.slice(0, 8) + '01'; },

    /* Premier jour du mois décalé de n mois */
    addMonths: function (iso, n) {
      var p = iso.split('-');
      var y = +p[0], m = +p[1] - 1 + n, d = +p[2];
      var dernier = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      var dd = Math.min(d, dernier);
      return util.iso(Date.UTC(y, m, dd, 12));
    },

    daysInMonth: function (iso) {
      var p = iso.split('-');
      return new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate();
    },

    endOfMonth: function (iso) {
      return util.startOfMonth(iso).slice(0, 8) + pad2(util.daysInMonth(iso));
    },

    /* Numéro de semaine ISO */
    weekNumber: function (iso) {
      var t = util.ts(iso), d = new Date(t);
      d.setUTCDate(d.getUTCDate() + 4 - ((d.getUTCDay() + 6) % 7));
      var y0 = Date.UTC(d.getUTCFullYear(), 0, 1);
      return Math.ceil(((d.getTime() - y0) / MS_JOUR + 1) / 7);
    },

    /* '1 oct. 2025' */
    fmtLong: function (iso) {
      if (!iso) return '';
      var p = iso.split('-');
      return (+p[2]) + ' ' + MOIS[+p[1] - 1] + ' ' + p[0];
    },

    /* '1 octobre 2025' */
    fmtFull: function (iso) {
      if (!iso) return '';
      var p = iso.split('-');
      return (+p[2]) + ' ' + MOIS_LONG[+p[1] - 1] + ' ' + p[0];
    },

    /* '01/10' */
    fmtShort: function (iso) {
      if (!iso) return '';
      var p = iso.split('-');
      return p[2] + '/' + p[1];
    },

    fmtMonthYear: function (iso) {
      var p = iso.split('-');
      return MOIS_LONG[+p[1] - 1] + ' ' + p[0];
    },

    fmtDayMonthYear: function (iso) {
      var p = iso.split('-');
      return p[2] + '/' + p[1] + '/' + p[0];
    },

    mois: MOIS, moisLong: MOIS_LONG, jours: JOURS,

    /* 12 -> "1 j", 5 -> "5 j", 0 -> "—" */
    fmtDuree: function (n) { return n <= 0 ? '—' : n + ' j'; },

    clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },

    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    },

    /* Accepte 2025-10-01, 01/10/2025, 1.10.2025, 10/2025 -> 'AAAA-MM-JJ' ou null */
    parseLoose: function (txt) {
      if (!txt) return null;
      var s = String(txt).trim();
      var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
      if (m) return m[1] + '-' + pad2(+m[2]) + '-' + pad2(+m[3]);
      m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})$/.exec(s);
      if (m) {
        var y = +m[3]; if (y < 100) y += 2000;
        return y + '-' + pad2(+m[2]) + '-' + pad2(+m[1]);
      }
      var d = new Date(s);
      if (!isNaN(d.getTime())) return util.iso(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 12));
      return null;
    },

    download: function (name, data, mime) {
      var blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    },

    slug: function (s) {
      return String(s || 'planning').toLowerCase()
        .replace(/[àâä]/g, 'a').replace(/[éèêë]/g, 'e').replace(/[îï]/g, 'i')
        .replace(/[ôö]/g, 'o').replace(/[ûüù]/g, 'u').replace(/ç/g, 'c')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'planning';
    }
  };

  /* ============================================================== palette == */
  G.PALETTE = [
    { id: 'azur',      name: 'Azur',      bar: '#4a9bf0', soft: '#e9f2fe', ink: '#1c4f8a' },
    { id: 'vert',      name: 'Vert',      bar: '#6fc26b', soft: '#ecf7ea', ink: '#2b6b29' },
    { id: 'violet',    name: 'Violet',    bar: '#9b7bf0', soft: '#f1eefe', ink: '#4a2f9c' },
    { id: 'ambre',     name: 'Ambre',     bar: '#eeb04a', soft: '#fdf4e3', ink: '#87590f' },
    { id: 'turquoise', name: 'Turquoise', bar: '#35bfb6', soft: '#e7f7f5', ink: '#12635d' },
    { id: 'rose',      name: 'Rose',      bar: '#ee7b9b', soft: '#fdeef2', ink: '#8d2b47' },
    { id: 'ardoise',   name: 'Ardoise',   bar: '#8390a1', soft: '#eef1f5', ink: '#3b4552' },
    { id: 'rouge',     name: 'Rouge',     bar: '#e5484d', soft: '#fdecec', ink: '#8c2125' }
  ];

  G.colorOf = function (id) {
    for (var i = 0; i < G.PALETTE.length; i++) if (G.PALETTE[i].id === id) return G.PALETTE[i];
    return G.PALETTE[0];
  };

  /* =============================================================== échelle == */
  G.ZOOMS = {
    jour:      { px: 34,   label: 'Jour',      ticks: 'jour' },
    semaine:   { px: 11.5, label: 'Semaine',   ticks: 'semaine' },
    mois:      { px: 4.2,  label: 'Mois',      ticks: null },
    trimestre: { px: 1.7,  label: 'Trimestre', ticks: null }
  };
  G.ZOOM_ORDER = ['jour', 'semaine', 'mois', 'trimestre'];

  /* ================================================================ état == */
  function blank() {
    return {
      version: 1,
      title: 'Nouveau planning',
      zoom: 'mois',
      theme: 'clair',
      leftWidth: 320,
      rowHeight: 34,
      pxOverride: null,        // utilisé par « Ajuster »
      rangeTight: false,       // cadrage serré, le temps d'un export
      sections: [],
      tasks: [],
      selection: [],
      clipboard: null,
      fileHandle: null
    };
  }

  var state = G.state = blank();

  /* ------------------------------------------------------------ fabriques -- */
  var seq = 0;
  function maxMilestone() {
    var max = 0;
    state.tasks.forEach(function (t) {
      if (!t.milestone) return;
      var m = /^M(\d+)$/.exec(t.tag || '');
      if (m) max = Math.max(max, +m[1]);
    });
    return max;
  }
  G.nextMilestoneTag = function () { return 'M' + (maxMilestone() + 1); };

  G.newSection = function (name, colorId) {
    return {
      id: util.uid('s'),
      name: name || 'Nouveau groupe',
      color: colorId || G.PALETTE[state.sections.length % G.PALETTE.length].id,
      collapsed: false
    };
  };

  G.newTask = function (o) {
    o = o || {};
    var start = o.start || util.todayISO();
    var end = o.end || util.addDays(start, (o.duration || 5) - 1);
    return {
      id: util.uid('t'),
      name: o.name || 'Nouvelle tâche',
      section: o.section || null,
      start: start,
      end: end,
      progress: o.progress == null ? 0 : util.clamp(+o.progress, 0, 100),
      milestone: !!o.milestone,
      tag: o.tag || '',
      color: o.color || null,          // null = couleur du groupe
      notes: o.notes || '',
      deps: o.deps ? o.deps.slice() : []
    };
  };

  /* ------------------------------------------------------------- lecture -- */
  G.sectionById = function (id) {
    for (var i = 0; i < state.sections.length; i++) if (state.sections[i].id === id) return state.sections[i];
    return null;
  };
  G.taskById = function (id) {
    for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) return state.tasks[i];
    return null;
  };
  G.taskIndex = function (id) {
    for (var i = 0; i < state.tasks.length; i++) if (state.tasks[i].id === id) return i;
    return -1;
  };

  G.taskColorId = function (t) {
    if (t.color) return t.color;
    var s = G.sectionById(t.section);
    return s ? s.color : 'azur';
  };
  G.taskColor = function (t) { return G.colorOf(G.taskColorId(t)); };

  G.duree = function (t) { return t.milestone ? 0 : Math.max(1, util.diffDays(t.start, t.end) + 1); };

  /* Toutes les lignes affichables, dans l'ordre */
  G.rows = function () {
    var out = [], i, j, s, t;
    var rang = {};
    state.sections.forEach(function (sec, k) { rang[sec.id] = k; });

    for (i = 0; i < state.sections.length; i++) {
      s = state.sections[i];
      out.push({ kind: 'section', key: s.id, section: s });
      if (s.collapsed) continue;
      for (j = 0; j < state.tasks.length; j++) {
        t = state.tasks[j];
        if (t.section === s.id) out.push({ kind: 'task', key: t.id, task: t, section: s });
      }
    }
    /* tâches orphelines (groupe supprimé à la main) */
    for (j = 0; j < state.tasks.length; j++) {
      t = state.tasks[j];
      if (!rang.hasOwnProperty(t.section)) {
        out.push({ kind: 'task', key: t.id, task: t, section: null });
      }
    }
    return out;
  };

  /* Étendue brute des données */
  G.extent = function () {
    var a = null, b = null;
    state.tasks.forEach(function (t) {
      var s = t.start, e = t.milestone ? t.start : t.end;
      if (!a || s < a) a = s;
      if (!b || e > b) b = e;
    });
    if (!a) { a = util.todayISO(); b = util.addDays(a, 45); }
    return { min: a, max: b };
  };

  /* Fenêtre temporelle affichée, alignée sur les bornes de l'échelle.
     state.rangeTight (export) : on se cale au plus près du projet — sinon
     l'alignement sur les mois ajoute jusqu'à un mois de vide de chaque côté,
     ce qui rapetisse tout le contenu dans l'image. */
  G.range = function () {
    var ex = G.extent(), z = state.zoom;
    var a = ex.min, b = ex.max;
    if (state.rangeTight) {
      a = util.addDays(a, -2);
      b = util.addDays(b, 9);              /* de la place pour un libellé à droite */
      return { startISO: a, endISO: b, days: util.diffDays(a, b) + 1 };
    }
    if (z === 'jour' || z === 'semaine') {
      a = util.startOfWeek(a); b = util.addDays(util.startOfWeek(b), 6);
    } else {
      a = util.startOfMonth(a); b = util.endOfMonth(b);
    }
    return { startISO: a, endISO: b, days: util.diffDays(a, b) + 1 };
  };

  G.pxPerDay = function () {
    return state.pxOverride || G.ZOOMS[state.zoom].px;
  };

  /* -------------------------------------------------------------- écriture -- */
  G.addSection = function (name, colorId) {
    var s = G.newSection(name, colorId);
    state.sections.push(s);
    return s;
  };

  G.addTask = function (o) {
    o = o || {};
    if (!o.section) {
      var last = state.selection.length === 1 ? G.taskById(state.selection[0]) : null;
      if (last && G.sectionById(last.section)) o.section = last.section;
      else if (state.sections.length) o.section = state.sections[state.sections.length - 1].id;
      else o.section = G.addSection('Groupe 1').id;
    }
    var t = G.newTask(o);
    if (t.milestone && !t.tag) t.tag = G.nextMilestoneTag();
    state.tasks.push(t);
    return t;
  };

  /* Insère une copie après la dernière tâche du même groupe */
  G.insertAfter = function (srcId, obj) {
    var src = G.taskById(srcId);
    var idx = src ? G.taskIndex(srcId) + 1 : state.tasks.length;
    state.tasks.splice(idx, 0, obj);
  };

  G.removeTasks = function (ids) {
    var set = {};
    ids.forEach(function (i) { set[i] = 1; });
    state.tasks = state.tasks.filter(function (t) { return !set[t.id]; });
    state.tasks.forEach(function (t) {
      t.deps = t.deps.filter(function (d) { return !set[d.id]; });
    });
    state.selection = state.selection.filter(function (i) { return !set[i]; });
  };

  G.removeSection = function (id) {
    var sec = G.sectionById(id);
    if (!sec) return;
    var idx = state.sections.indexOf(sec);
    var orphelins = state.tasks.filter(function (t) { return t.section === id; });
    var cible = state.sections[idx + 1] || state.sections[idx - 1];
    if (cible) {
      orphelins.forEach(function (t) { t.section = cible.id; });
    } else {
      G.removeTasks(orphelins.map(function (t) { return t.id; }));
    }
    state.sections.splice(idx, 1);
  };

  G.setDates = function (t, start, end) {
    if (end < start) end = start;
    t.start = start;
    t.end = t.milestone ? start : end;
    if (t.milestone) t.end = t.start;
  };

  G.moveTasks = function (ids, jours) {
    ids.forEach(function (id) {
      var t = G.taskById(id);
      if (!t) return;
      t.start = util.addDays(t.start, jours);
      t.end = util.addDays(t.end, jours);
    });
  };

  G.resizeTask = function (t, edge, jours) {
    if (t.milestone) { t.start = util.addDays(t.start, jours); t.end = t.start; return; }
    if (edge === 'l') {
      var ns = util.addDays(t.start, jours);
      if (ns > t.end) ns = t.end;
      t.start = ns;
    } else {
      var ne = util.addDays(t.end, jours);
      if (ne < t.start) ne = t.start;
      t.end = ne;
    }
  };

  G.setProgress = function (ids, v) {
    ids.forEach(function (id) { var t = G.taskById(id); if (t) t.progress = util.clamp(+v, 0, 100); });
  };

  /* Trie par groupe puis par date de début (appelé après le chargement
     d'un exemple, pour que les jalons se placent au fil de l'eau). */
  G.sortTasksByDate = function () {
    var rang = {};
    state.sections.forEach(function (s, i) { rang[s.id] = i; });
    state.tasks.sort(function (a, b) {
      var ra = rang.hasOwnProperty(a.section) ? rang[a.section] : 999;
      var rb = rang.hasOwnProperty(b.section) ? rang[b.section] : 999;
      if (ra !== rb) return ra - rb;
      if (a.start !== b.start) return a.start < b.start ? -1 : 1;
      if (!!a.milestone !== !!b.milestone) return a.milestone ? 1 : -1;
      return 0;
    });
  };

  /* ------------------------------------------------------------ graphes -- */
  G.addDep = function (fromId, toId, type) {
    if (fromId === toId) return null;
    var to = G.taskById(toId), from = G.taskById(fromId);
    if (!to || !from) return null;
    if (G.wouldCycle(fromId, toId)) return null;
    for (var i = 0; i < to.deps.length; i++) {
      if (to.deps[i].id === fromId && (to.deps[i].type || 'FS') === (type || 'FS')) return to.deps[i];
    }
    var d = { id: fromId, type: type || 'FS' };
    to.deps.push(d);
    return d;
  };

  G.removeDep = function (fromId, toId) {
    var to = G.taskById(toId);
    if (!to) return;
    to.deps = to.deps.filter(function (d) { return d.id !== fromId; });
  };

  /* Un ajout from -> to crée-t-il un cycle ? (parcours depuis from vers l'amont) */
  G.wouldCycle = function (fromId, toId) {
    if (fromId === toId) return true;
    var vus = {}, pile = [fromId];
    while (pile.length) {
      var cur = pile.pop();
      if (vus[cur]) continue;
      vus[cur] = 1;
      if (cur === toId) return true;   // toId atteint en remontant
      var t = G.taskById(cur);
      if (!t) continue;
      t.deps.forEach(function (d) { pile.push(d.id); });
    }
    return false;
  };

  /* ---------------------------------------------------------- historique -- */
  var historique = [], curseur = -1, enCours = false;

  function instantane() {
    return JSON.stringify({
      title: state.title, zoom: state.zoom, pxOverride: state.pxOverride,
      leftWidth: state.leftWidth, rowHeight: state.rowHeight,
      sections: state.sections, tasks: state.tasks, selection: state.selection
    });
  }

  G.history = {
    reset: function () {
      historique = [instantane()];
      curseur = 0;
      enCours = false;
    },
    commit: function () {
      if (enCours) return;
      var s = instantane();
      if (historique[curseur] === s) return;
      historique = historique.slice(0, curseur + 1);
      historique.push(s);
      if (historique.length > 120) historique.shift();
      curseur = historique.length - 1;
    },
    /* Groupe plusieurs modifications en une seule étape */
    transact: function (fn) {
      enCours = true;
      try { fn(); } finally { enCours = false; }
      G.history.commit();
    },
    undo: function () {
      if (curseur <= 0) return false;
      curseur--;
      applique(historique[curseur]);
      return true;
    },
    redo: function () {
      if (curseur >= historique.length - 1) return false;
      curseur++;
      applique(historique[curseur]);
      return true;
    },
    canUndo: function () { return curseur > 0; },
    canRedo: function () { return curseur < historique.length - 1; }
  };

  function applique(json) {
    var o = JSON.parse(json);
    state.title = o.title;
    state.zoom = o.zoom;
    state.pxOverride = o.pxOverride;
    state.leftWidth = o.leftWidth;
    state.rowHeight = o.rowHeight;
    state.sections = o.sections;
    state.tasks = o.tasks;
    state.selection = o.selection || [];
  }

  /* --------------------------------------------------------- persistance -- */
  var CLE = 'gantt.local.v1';
  var minuteur = null;

  G.persist = {
    save: function () {
      try { localStorage.setItem(CLE, instantane()); } catch (e) { /* mode privé */ }
    },
    saveSoon: function () {
      clearTimeout(minuteur);
      minuteur = setTimeout(G.persist.save, 400);
    },
    load: function () {
      try {
        var raw = localStorage.getItem(CLE);
        if (!raw) return false;
        applique(raw);
        historique = [instantane()];
        curseur = 0;
        return true;
      } catch (e) { return false; }
    },
    clear: function () { try { localStorage.removeItem(CLE); } catch (e) {} }
  };

  /* ------------------------------------------------------------ chargement -- */
  /* Chargé depuis un objet (fichier JSON, exemple) — tolérant sur la forme */
  G.load = function (data) {
    if (!data || typeof data !== 'object') throw new Error('Fichier illisible');

    var d = blank();
    d.title = data.title || 'Sans titre';
    d.zoom = G.ZOOMS[data.zoom] ? data.zoom : 'mois';
    d.theme = data.theme === 'sombre' ? 'sombre' : 'clair';
    d.leftWidth = util.clamp(+data.leftWidth || 320, 220, 640);
    d.rowHeight = util.clamp(+data.rowHeight || 34, 24, 80);

    var groupes = data.sections || data.groups || [];
    if (!Array.isArray(groupes) || !groupes.length) {
      groupes = [{ id: 's1', name: 'Tâches', color: 'azur' }];
    }
    d.sections = groupes.map(function (s, i) {
      return {
        id: s.id || ('s' + (i + 1)),
        name: s.name || s.title || ('Groupe ' + (i + 1)),
        color: G.colorOf(s.color).id === s.color ? s.color : (G.PALETTE[i % G.PALETTE.length].id),
        collapsed: !!s.collapsed
      };
    });

    var premier = d.sections[0].id;
    var taches = data.tasks || [];
    d.tasks = taches.map(function (t) {
      var sec = t.section || t.group;
      if (!G.sectionsHas(d.sections, sec)) sec = premier;
      var start = util.parseLoose(t.start) || util.todayISO();
      var end = util.parseLoose(t.end) || start;
      var tache = G.newTask({
        name: t.name || t.title || 'Tâche',
        section: sec,
        start: start,
        end: end,
        milestone: !!(t.milestone || t.jalon),
        tag: t.tag || '',
        color: t.color || null,
        progress: t.progress || 0,
        notes: t.notes || t.description || ''
      });
      tache.id = t.id || tache.id;
      return tache;
    });

    /* dépendances : par id de tâche */
    (data.tasks || []).forEach(function (t, i) {
      if (!Array.isArray(t.deps)) return;
      var cible = d.tasks[i];
      if (!cible) return;
      t.deps.forEach(function (dep) {
        var fromId = typeof dep === 'string' ? dep : (dep.id || dep.from);
        var type = typeof dep === 'object' && dep.type ? dep.type : 'FS';
        if (fromId && fromId !== cible.id && d.tasks.some(function (x) { return x.id === fromId; })) {
          cible.deps.push({ id: fromId, type: type });
        }
      });
    });

    /* jalon sans étiquette -> M1, M2, … */
    var n = 0;
    d.tasks.forEach(function (t) { if (t.milestone && !t.tag) t.tag = 'M' + (++n); });

    /* applique */
    state.version = 1;
    state.title = d.title;
    state.zoom = d.zoom;
    state.theme = d.theme;
    state.leftWidth = d.leftWidth;
    state.rowHeight = d.rowHeight;
    state.pxOverride = null;
    state.sections = d.sections;
    state.tasks = d.tasks;
    state.selection = [];

    G.history.reset();
    return true;
  };

  G.sectionsHas = function (list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return true;
    return false;
  };

  /* Export : objet JSON propre */
  G.serialize = function () {
    return {
      app: 'gantt-local',
      version: 1,
      title: state.title,
      zoom: state.zoom,
      theme: state.theme,
      leftWidth: state.leftWidth,
      rowHeight: state.rowHeight,
      sections: state.sections.map(function (s) {
        return { id: s.id, name: s.name, color: s.color, collapsed: s.collapsed };
      }),
      tasks: state.tasks.map(function (t) {
        return {
          id: t.id, name: t.name, section: t.section,
          start: t.start, end: t.end,
          progress: t.progress, milestone: t.milestone, tag: t.tag,
          color: t.color, notes: t.notes,
          deps: t.deps.map(function (d) { return { id: d.id, type: d.type || 'FS' }; })
        };
      })
    };
  };

  G.blankState = function () {
    var d = blank();
    Object.keys(d).forEach(function (k) { state[k] = d[k]; });
    state.sections = [];
    state.tasks = [];
    state.selection = [];
    G.history.reset();
  };

})();
