/* ==========================================================================
   interact.js — souris, clavier, presse-papiers, inspecteur.
   Tous les écouteurs sont posés en délégation sur des conteneurs durables :
   re-rendre le corps du graphe ne casse jamais les interactions.
   ========================================================================== */
(function () {
  'use strict';

  var G = window.Gantt, U = G.util, V = G.view;
  var el = V.el, M = V.metrics;

  var drag = null;
  var ancreSelection = null;      // pour le shift-clic
  var fantome = null;             // <path> temporaire pendant un lien
  var editionEnCours = null;      // renommage sur place en cours
  var reorder = null;             // glisser vertical d'une ligne du tableau

  /* =============================================================== repères */
  function rectScroller() { return el.scroller.getBoundingClientRect(); }

  function pisteX(e) {
    var r = rectScroller();
    return e.clientX - r.left + el.scroller.scrollLeft - M.leftW;
  }
  function pisteY(e) {
    var r = rectScroller();
    return e.clientY - r.top + el.scroller.scrollTop - M.headH;
  }

  function tacheSous(x, y) {
    var i = Math.floor(y / M.rowH);
    var rw = M.rows[i];
    if (!rw || rw.kind !== 'task') return null;
    var t = rw.task, b = V.box(t);
    if (!b) return null;
    var largeur = Math.max(b.w, 18);
    if (x >= b.x - 7 && x <= b.x + largeur + 7) return t;
    return null;
  }

  function maj(mode) {
    if (mode !== 'rapide') V.render();
    V.syncToolbar();
  }
  function commit(rendu) {
    G.history.commit();
    G.persist.saveSoon();
    G.dirty = true;
    if (rendu !== false) V.render();
  }
  G.commit = commit;
  G.maj = maj;

  /* ========================================================= sélection */
  function selectionner(id, mode) {
    var s = G.state.selection;
    if (mode === 'toggle') {
      var i = s.indexOf(id);
      if (i >= 0) s.splice(i, 1); else { s.push(id); ancreSelection = id; }
    } else if (mode === 'plage' && ancreSelection) {
      var a = M.index[ancreSelection], b = M.index[id];
      if (a == null || b == null) { G.state.selection = [id]; }
      else {
        var ids = [];
        for (var k = Math.min(a, b); k <= Math.max(a, b); k++) {
          if (M.rows[k].kind === 'task') ids.push(M.rows[k].task.id);
        }
        G.state.selection = ids;
      }
    } else {
      G.state.selection = [id];
      ancreSelection = id;
    }
  }

  V.select = selectionner;
  V.deselect = function () { G.state.selection = []; ancreSelection = null; };

  /* ============================================================== souris */
  V.bind = function () {
    el.scroller.addEventListener('pointerdown', onDown, true);
    el.scroller.addEventListener('contextmenu', onContextMenu);
    el.scroller.addEventListener('dblclick', onDblClick);
    el.scroller.addEventListener('click', onClick);
    el.scroller.addEventListener('wheel', onWheel, { passive: false });

    document.addEventListener('keydown', onKey);

    el.inspector.addEventListener('input', onInspField);
    el.inspector.addEventListener('change', onInspField);
    el.inspector.addEventListener('click', onInspClick);

    /* Entrée dans un champ du panneau = on applique tout de suite (un champ
       texte ne signale son changement qu'en le quittant) */
    el.inspector.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (!e.target.dataset || !e.target.dataset.field) return;
      e.preventDefault();
      onInspField({ target: e.target, type: 'change' });
      e.target.blur();
    });

    /* le champ de renommage posé dans le graphique ne doit pas se retrouver
       à côté de sa barre si l'on fait défiler pendant la frappe */
    el.scroller.addEventListener('scroll', function () {
      if (editionEnCours && editionEnCours.flottant) editionEnCours.finir(true);
    });
  };

  function onDown(e) {
    if (e.button !== 0) return;
    var cible = e.target;

    /* un renommage sur place est en cours : le clic suivant le referme
       (en validant) plutôt que de déclencher autre chose */
    if (editionEnCours) {
      if (editionEnCours.input.contains(cible)) return;
      editionEnCours.finir(true);
      return;
    }

    /* libellé d'une petite barre ou d'un jalon, écrit dans le graphique :
       un clic sélectionne la tâche (au lieu de tout désélectionner) */
    var etiquette = cible.closest ? cible.closest('.blabel.out,.milestone-label') : null;
    if (etiquette) {
      var ligneE = etiquette.closest('.row');
      if (ligneE && ligneE.dataset.kind === 'task') {
        selectionner(ligneE.dataset.id, (e.ctrlKey || e.metaKey) ? 'toggle' : (e.shiftKey ? 'plage' : 'simple'));
        V.refreshSelection();
        V.renderInspector();
      }
      return;
    }

    /* champ en cours d'édition : on le laisse tranquille */
    if (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.isContentEditable) return;

    /* poignée de dépendance */
    var dh = cible.closest ? cible.closest('[data-dep]') : null;
    if (dh) { e.preventDefault(); demarrerLien(dh, e); return; }

    /* bord de barre = redimensionner */
    var grip = cible.closest ? cible.closest('[data-grip]') : null;
    if (grip) {
      e.preventDefault();
      var t0 = G.taskById(grip.dataset.id);
      if (!t0) return;
      selectionner(t0.id, e.ctrlKey || e.metaKey ? 'toggle' : 'simple');
      demarrerRedim(t0, grip.dataset.grip, e);
      return;
    }

    /* barre ou jalon = déplacer */
    var bar = cible.closest ? cible.closest('.bar,.milestone') : null;
    if (bar) {
      e.preventDefault();
      var t = G.taskById(bar.dataset.id);
      if (!t) return;
      var mode = (e.ctrlKey || e.metaKey) ? 'toggle' : (e.shiftKey ? 'plage' : 'simple');
      if (G.state.selection.indexOf(t.id) < 0) selectionner(t.id, mode);
      else if (mode === 'toggle') selectionner(t.id, 'toggle');
      else ancreSelection = t.id;
      V.refreshSelection();
      V.renderInspector();
      demarrerDepl(e);
      return;
    }

    /* colonne des noms : sélection simple, et glisser vertical pour réordonner */
    var rl = cible.closest ? cible.closest('.row-left') : null;
    if (rl) {
      var row = rl.closest('.row');
      var id = row && row.dataset.id;
      if (row && row.dataset.kind === 'task') {
        selectionner(id, (e.ctrlKey || e.metaKey) ? 'toggle' : (e.shiftKey ? 'plage' : 'simple'));
        V.refreshSelection();
        V.renderInspector();
      } else if (row) {
        /* un clic sur le nom du groupe ne replie pas : c'est la flèche ▾ */
      }
      if (row && !(cible.closest && cible.closest('[data-toggle]'))) {
        demarrerReordonnancement(row, e);
      }
      return;
    }

    /* clic dans le vide */
    if (cible === el.canvas || cible === el.body || cible.closest('.track')) {
      V.deselect();
      V.refreshSelection();
      V.renderInspector();
    }
  }

  /* --------------------------------------------------------------- déplacer */
  function demarrerDepl(e) {
    var taches = G.state.selection.map(G.taskById).filter(Boolean);
    if (!taches.length) return;

    if (e.altKey) {                          // Alt = dupliquer puis déplacer
      var copies = copierTaches(taches.map(function (t) { return t.id; }), 0);
      G.state.selection = copies.map(function (c) { return c.id; });
      V.refreshChart(); V.renderInspector();
      taches = copies;
    }

    drag = {
      mode: 'depl',
      startX: e.clientX,
      jours: 0,
      origine: taches.map(function (t) { return { id: t.id, start: t.start, end: t.end }; })
    };
    G.state.selection.forEach(function (id) {
      var b = el.body.querySelector('.bar[data-id="' + id + '"],.milestone[data-id="' + id + '"]');
      if (b) b.classList.add('is-dragging');
    });
    el.scroller.classList.add('is-busy');
    brancher();
  }

  function demarrerRedim(t, cote, e) {
    drag = {
      mode: 'redim', cote: cote, startX: e.clientX, jours: 0,
      origine: [{ id: t.id, start: t.start, end: t.end }]
    };
    var b = el.body.querySelector('.bar[data-id="' + t.id + '"]');
    if (b) b.classList.add('is-dragging');
    brancher();
  }

  function demarrerLien(poignee, e) {
    var t = G.taskById(poignee.dataset.id);
    if (!t) return;
    drag = { mode: 'lien', id: t.id, cote: poignee.dataset.dep, cible: null };
    fantome = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    fantome.setAttribute('class', 'ghost');
    el.links.appendChild(fantome);
    brancher();
  }

  function brancher() {
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  }
  function debrancher() {
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
  }

  function onMove(e) {
    if (reorder) { majReordonnancement(e); return; }
    if (!drag) return;
    e.preventDefault();

    /* défilement automatique près des bords */
    var r = rectScroller();
    if (e.clientX > r.right - 44) el.scroller.scrollLeft += 14;
    else if (e.clientX < r.left + M.leftW + 44) el.scroller.scrollLeft -= 14;

    if (drag.mode === 'depl' || drag.mode === 'redim') {
      var jours = Math.round((e.clientX - drag.startX) / M.px);
      if (jours === drag.jours) return;
      drag.jours = jours;
      drag.origine.forEach(function (o) {
        var t = G.taskById(o.id);
        if (!t) return;
        if (drag.mode === 'depl') {
          t.start = U.addDays(o.start, jours);
          t.end = U.addDays(o.end, jours);
        } else if (drag.cote === 'l') {
          /* Toujours calculé depuis la valeur d'origine, sinon le décalage
             s'accumule à chaque déplacement de souris. */
          var ns = U.addDays(o.start, jours);
          if (ns > o.end) ns = o.end;
          G.setDates(t, ns, t.end);
        } else {
          var ne = U.addDays(o.end, jours);
          if (ne < o.start) ne = o.start;
          G.setDates(t, t.start, ne);
        }
        V.refreshTask(t);
      });
      V.drawSvg();
      var t0 = G.taskById(drag.origine[0].id);
      var txt = t0.milestone
        ? U.fmtLong(t0.start)
        : U.fmtLong(t0.start) + '  →  ' + U.fmtLong(t0.end) + '   (' + G.duree(t0) + ' j)';
      if (drag.origine.length > 1) txt = '+' + drag.origine.length + ' tâches  ·  ' + (jours >= 0 ? '+' : '') + jours + ' j';
      V.tip(e.clientX, e.clientY, txt);
      return;
    }

    if (drag.mode === 'lien') {
      var t = G.taskById(drag.id);
      var dep = V.anchor(t, drag.cote);
      var x = pisteX(e), y = pisteY(e);
      var cible = tacheSous(x, y);

      /* la cible ne peut pas être la tâche elle-même ni créer un cycle */
      if (cible && (cible.id === t.id ||
          (drag.cote === 'r' ? G.wouldCycle(t.id, cible.id) : G.wouldCycle(cible.id, t.id)))) {
        cible = null;
      }

      var arrivee = { x: x, y: y };
      if (cible) arrivee = V.anchor(cible, drag.cote === 'r' ? 'l' : 'r');

      /* surbrillance de la cible */
      if (drag.cible !== cible) {
        if (drag.cible) {
          var ancienne = el.body.querySelector('[data-id="' + drag.cible.id + '"]');
          if (ancienne) ancienne.classList.remove('is-target');
        }
        if (cible) {
          var nouvel = el.body.querySelector('.row[data-id="' + cible.id + '"] .bar,' +
                                             '.row[data-id="' + cible.id + '"] .milestone');
          if (nouvel) nouvel.classList.add('is-target');
        }
        drag.cible = cible;
      }

      var pts = [[dep.x, dep.y]];
      if (drag.cote === 'r') pts.push([Math.max(dep.x + 10, arrivee.x - 14), arrivee.y], [arrivee.x, arrivee.y]);
      else pts.push([Math.min(dep.x - 10, arrivee.x + 14), arrivee.y], [arrivee.x, arrivee.y]);
      fantome.setAttribute('d', V.svgPath(pts, 5));

      V.tip(e.clientX, e.clientY, cible ? 'Lier à « ' + cible.name + ' »' : 'Glisser sur une barre…');
    }
  }

  function onUp() {
    if (reorder) { finReordonnancement(); return; }
    if (!drag) return;
    debrancher();
    V.untip();
    el.scroller.classList.remove('is-busy');

    if (drag.mode === 'lien') {
      if (fantome && fantome.parentNode) fantome.parentNode.removeChild(fantome);
      fantome = null;
      if (drag.cible) {
        var ok;
        if (drag.cote === 'r') ok = G.addDep(drag.id, drag.cible.id, 'FS');
        else ok = G.addDep(drag.cible.id, drag.id, 'FS');
        if (ok) V.toast('Lien créé', 'ok');
        else V.toast('Lien impossible (cycle)', 'warn');
      }
      drag = null;
      commit();
      return;
    }

    var bouge = drag.jours !== 0;
    if (drag.mode === 'depl' && !bouge && G.state.selection.length === 1 &&
        drag.origine.length === 1) {
      /* simple clic : rien à enregistrer */
    } else if (bouge) {
      G.persist.saveSoon();
      G.history.commit();
    }
    drag = null;
    V.render();
  }

  /* ============================================ réordonner par glisser ===== */
  /* Glisser une ligne du tableau vers le haut ou le bas change sa place dans
     la liste — et son groupe si on la lâche dans un autre — sans jamais
     toucher à ses dates. Ne démarre qu'après quelques pixels de mouvement,
     pour qu'un simple clic reste un clic. */
  function demarrerReordonnancement(row, e) {
    reorder = {
      row: row, kind: row.dataset.kind, id: row.dataset.id,
      startY: e.clientY, actif: false, idx: null
    };
    brancher();
  }

  function ligneInsertion() {
    var d = el.body.querySelector('.ligne-insertion');
    if (!d) {
      d = document.createElement('div');
      d.className = 'ligne-insertion';
      el.body.appendChild(d);
    }
    return d;
  }

  function majReordonnancement(e) {
    if (!reorder.actif) {
      if (Math.abs(e.clientY - reorder.startY) < 5) return;
      reorder.actif = true;
      el.scroller.classList.add('reordonne');
      reorder.row.classList.add('is-moving');
    }
    e.preventDefault();

    /* défilement automatique près des bords haut / bas */
    var r = rectScroller();
    if (e.clientY > r.bottom - 46) el.scroller.scrollTop += 12;
    else if (e.clientY < r.top + 46) el.scroller.scrollTop -= 12;

    var idx = U.clamp(Math.round(pisteY(e) / M.rowH), 0, M.rows.length);

    /* Pour un groupe, la ligne se colle aux frontières de groupes (ou tout en
       bas) : c'est là que le dépôt a un sens. */
    if (reorder.kind === 'section') {
      var meilleurL = -1, ecartL = Infinity, q;
      for (q = 0; q < M.rows.length; q++) {
        if (M.rows[q].kind !== 'section') continue;
        if (Math.abs(q - idx) < ecartL) { ecartL = Math.abs(q - idx); meilleurL = q; }
      }
      if (Math.abs(M.rows.length - idx) < ecartL) meilleurL = M.rows.length;
      if (meilleurL >= 0) idx = meilleurL;
    }

    reorder.idx = idx;
    ligneInsertion().style.top = (idx * M.rowH) + 'px';

    var apres = M.rows[idx], avant = idx > 0 ? M.rows[idx - 1] : null;
    var groupe = (apres && apres.section) ? apres.section.name
               : (avant && avant.section) ? avant.section.name : '';
    V.tip(e.clientX, e.clientY, 'Déposer ici' + (groupe ? '  ·  ' + groupe : ''));
  }

  function finReordonnancement() {
    debrancher();
    V.untip();
    el.scroller.classList.remove('reordonne');
    var l = el.body.querySelector('.ligne-insertion');
    if (l) l.parentNode.removeChild(l);
    var r = reorder;
    if (r && r.row) r.row.classList.remove('is-moving');
    reorder = null;
    if (!r || !r.actif || r.idx == null) return;       /* simple clic : rien à faire */
    appliquerReordonnancement(r.kind, r.id, r.idx);
  }

  /* idx = rang de la ligne devant laquelle on insère (0 … nombre de lignes) */
  function appliquerReordonnancement(kind, id, idx) {
    var lignes = M.rows;

    if (kind === 'section') {
      var s = G.sectionById(id);
      if (!s) return;

      var ordre = G.state.sections.slice();
      var depart = ordre.indexOf(s);
      if (depart < 0) return;
      ordre.splice(depart, 1);                 /* retiré d'abord, l'index se décale */

      var cible;
      if (idx >= lignes.length - 0.5) {
        cible = ordre.length;                  /* déposé tout en bas */
      } else {
        /* on vise le groupe dont l'en-tête est le plus proche du point de
           dépôt : le groupe glissé prend sa place, l'autre descend */
        var entetes = [], k2;
        for (k2 = 0; k2 < lignes.length; k2++) {
          if (lignes[k2].kind === 'section') entetes.push({ rang: entetes.length, ligne: k2 });
        }
        if (!entetes.length) return;
        var meilleur = entetes[0];
        entetes.forEach(function (e) {
          if (Math.abs(e.ligne - idx) < Math.abs(meilleur.ligne - idx)) meilleur = e;
        });
        cible = meilleur.rang;
        if (depart < cible) cible--;           /* il ne se comptait plus lui-même */
      }

      if (cible === depart) return;            /* déjà à sa place */
      ordre.splice(U.clamp(cible, 0, ordre.length), 0, s);
      G.state.sections = ordre;
      commit();
      return;
    }

    var t = G.taskById(id);
    if (!t) return;
    var apres = lignes[idx] || null;
    var avant = idx > 0 ? lignes[idx - 1] : null;

    /* groupe d'accueil : celui de la ligne devant laquelle on dépose */
    var nouveau = null;
    if (apres) nouveau = apres.kind === 'task' ? apres.task.section : apres.section.id;
    else if (avant) nouveau = avant.kind === 'task' ? avant.task.section : avant.section.id;
    if (nouveau && G.sectionById(nouveau)) t.section = nouveau;

    var arr = G.state.tasks;
    var i = arr.indexOf(t);
    if (i >= 0) arr.splice(i, 1);

    var pos = arr.length;
    if (apres && apres.kind === 'task') {
      var j = arr.indexOf(apres.task);
      pos = j >= 0 ? j : arr.length;
    } else if (apres && apres.kind === 'section') {
      /* déposé sur un en-tête de groupe : première place de ce groupe */
      for (var m = 0; m < arr.length; m++) {
        if (arr[m].section === apres.section.id) { pos = m; break; }
      }
    }
    arr.splice(U.clamp(pos, 0, arr.length), 0, t);
    commit();
  }
  G.reordonner = appliquerReordonnancement;

  /* ---------------------------------------------------------- clic / double */
  function onClick(e) {
    var tw = e.target.closest ? e.target.closest('[data-toggle]') : null;
    if (tw) {
      e.stopPropagation();
      var s = G.sectionById(tw.dataset.toggle);
      if (s) { s.collapsed = !s.collapsed; commit(); }
    }
  }

  function onDblClick(e) {
    var celluleNom = e.target.closest ? e.target.closest('.cell.name') : null;
    var row = e.target.closest ? e.target.closest('.row') : null;

    /* double-clic sur le nom dans le tableau : renommage sur place
       (sauf sur la petite flèche de pliage) */
    if (celluleNom && row && !(e.target.closest && e.target.closest('[data-toggle]'))) {
      e.preventDefault();
      if (row.dataset.kind === 'task') {
        selectionner(row.dataset.id, 'simple');
        V.refreshSelection();
        V.renderInspector();
      }
      renommerEnPlace(row);
      return;
    }

    /* libellé du graphique ou barre : renommage sur place, juste là où le
       nom est écrit (le panneau complet reste accessible par un simple clic
       puis Entrée) */
    var etiquette = e.target.closest ? e.target.closest('.blabel,.milestone-label') : null;
    var bar = e.target.closest ? e.target.closest('.bar,.milestone') : null;
    var id = bar ? bar.dataset.id
           : (etiquette && row && row.dataset.kind === 'task') ? row.dataset.id
           : (row && row.dataset.kind === 'task') ? row.dataset.id
           : null;
    if (!id) return;
    var t = G.taskById(id);
    if (!t) return;
    selectionner(id, 'simple');
    V.refreshSelection();
    V.renderInspector();
    renommerDansLeGraphe(t);
  }

  /* Renommage sur place. Deux emplacements possibles :
       - dans le tableau (double-clic sur le nom de la ligne, ou F2)
       - dans le graphique (double-clic sur la barre ou sur son libellé)
     Entrée valide, Échap annule, cliquer ailleurs valide.
     Pendant la frappe on ne redessine PAS le graphe, sinon le champ
     disparaîtrait sous les doigts : la mise à jour se fait à la validation. */
  function ouvrirEditeur(input, obj, flottant) {
    var termine = false;

    function finir(valider) {
      if (termine) return;
      termine = true;
      editionEnCours = null;
      var v = input.value.trim();
      if (valider && v && v !== obj.name) {
        obj.name = v;
        G.dirty = true;
        G.persist.saveSoon();
        G.history.commit();
      }
      if (flottant && input.parentNode) input.parentNode.removeChild(input);
      V.refreshChart();
      V.renderInspector();
    }

    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault(); ev.stopPropagation();
        finir(true);                  /* validation explicite : on ne dépend pas du blur */
      } else if (ev.key === 'Escape') {
        ev.preventDefault(); ev.stopPropagation();
        finir(false);
      }
    });
    input.addEventListener('blur', function () { finir(true); });   /* clic ailleurs = valide */

    editionEnCours = { input: input, finir: finir, flottant: !!flottant };
  }

  function fermerEdition() {
    if (editionEnCours) editionEnCours.finir(true);
  }

  /* --- dans le tableau --------------------------------------------------- */
  function renommerEnPlace(row) {
    if (!row) return;
    fermerEdition();
    var cell = row.querySelector('.cell.name');
    if (!cell) return;
    var span = cell.querySelector('.tname');
    if (!span) return;                                  /* édition déjà en cours */

    var estGroupe = row.dataset.kind === 'section';
    var obj = estGroupe ? G.sectionById(row.dataset.id) : G.taskById(row.dataset.id);
    if (!obj) return;

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'tname-edit';
    input.value = obj.name;
    input.spellcheck = false;
    input.setAttribute('aria-label', estGroupe ? 'Renommer le groupe' : 'Renommer la tâche');
    cell.replaceChild(input, span);
    input.focus();
    input.select();
    ouvrirEditeur(input, obj, false);
  }
  G.renommerEnPlace = renommerEnPlace;

  /* --- dans le graphique, sur le libellé de la tâche --------------------- */
  function renommerDansLeGraphe(t) {
    if (!t) return;
    fermerEdition();
    var row = el.body.querySelector('.row[data-id="' + t.id + '"]');
    if (!row) return;
    var etiquette = row.querySelector('.bar .blabel, .milestone-label');
    if (!etiquette) return;

    V.ensureVisible(t.start);                 /* au cas où la barre serait hors champ */
    var r = etiquette.getBoundingClientRect();

    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'label-edit';
    input.value = t.name;
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Renommer la tâche');

    var largeur = Math.min(Math.max(r.width + 46, 150), 430);
    var gauche = Math.min(Math.max(r.left - 3, 8), Math.max(8, window.innerWidth - largeur - 8));
    input.style.left = gauche + 'px';
    input.style.top = Math.max(r.top - 2, 4) + 'px';
    input.style.width = largeur + 'px';
    input.style.height = Math.max(r.height + 5, 23) + 'px';

    document.body.appendChild(input);
    input.focus();
    input.select();
    ouvrirEditeur(input, t, true);
  }
  G.renommerDansLeGraphe = renommerDansLeGraphe;

  /* ============================================================ calendrier == */
  /* Petit calendrier maison, posé en position fixe et rabattu dans la fenêtre :
     le sélecteur natif du navigateur, lui, sortait de l'écran. */
  var cal = null;

  function fermerCalendrier() {
    if (!cal) return;
    if (cal.el.parentNode) cal.el.parentNode.removeChild(cal.el);
    document.removeEventListener('keydown', cal.touche, true);
    document.removeEventListener('pointerdown', cal.clic, true);
    window.removeEventListener('resize', cal.place, true);
    cal = null;
  }
  G.fermerCalendrier = fermerCalendrier;

  function ouvrirCalendrier(ancre, valeurISO, onChoix) {
    fermerCalendrier();
    var mois = (valeurISO || U.todayISO()).slice(0, 7);
    var choisi = valeurISO || null;
    var aujourdhui = U.todayISO();

    var boite = document.createElement('div');
    boite.className = 'calendrier';
    boite.setAttribute('role', 'dialog');
    boite.setAttribute('aria-label', 'Choisir une date');

    function dessiner() {
      var premier = mois + '-01';
      var decalage = U.dow(premier);                 /* 0 = lundi */
      var h = [];
      h.push('<div class="cal-tete">' +
             '<button type="button" data-cal-nav="-1" aria-label="Mois précédent">&#8249;</button>' +
             '<span>' + U.fmtMonthYear(premier) + '</span>' +
             '<button type="button" data-cal-nav="1" aria-label="Mois suivant">&#8250;</button></div>');
      h.push('<div class="cal-jours">' + U.jours.map(function (j) {
        return '<span>' + j.charAt(0).toUpperCase() + '</span>';
      }).join('') + '</div>');
      h.push('<div class="cal-grille">');
      for (var v = 0; v < decalage; v++) h.push('<span class="vide"></span>');
      for (var d = 1; d <= U.daysInMonth(premier); d++) {
        var iso = mois + '-' + U.pad2(d);
        var cl = 'cal-jour' + (iso === aujourdhui ? ' aujourdhui' : '') + (iso === choisi ? ' choisi' : '');
        h.push('<button type="button" class="' + cl + '" data-cal-jour="' + iso + '">' + d + '</button>');
      }
      h.push('</div>');
      h.push('<div class="cal-pied"><button type="button" data-cal-jour="' + aujourdhui +
             '">Aujourd\'hui</button></div>');
      boite.innerHTML = h.join('');
    }

    function placer() {
      var r = ancre.getBoundingClientRect();
      var w = boite.offsetWidth || 236, hb = boite.offsetHeight || 260;
      var g = U.clamp(r.left, 8, Math.max(8, window.innerWidth - w - 8));
      var t = r.bottom + 6;
      if (t + hb > window.innerHeight - 8) t = r.top - hb - 6;   /* on bascule au-dessus */
      boite.style.left = g + 'px';
      boite.style.top = Math.max(8, t) + 'px';
    }

    function surTouche(ev) {
      if (ev.key === 'Escape') { ev.stopPropagation(); fermerCalendrier(); }
    }
    function surClicExterieur(ev) {
      if (boite.contains(ev.target)) return;
      if (ancre.contains(ev.target)) return;
      fermerCalendrier();
    }

    boite.addEventListener('click', function (ev) {
      var nav = ev.target.closest('[data-cal-nav]');
      if (nav) {
        mois = U.addMonths(mois + '-01', +nav.dataset.calNav).slice(0, 7);
        dessiner(); placer();
        return;
      }
      var jour = ev.target.closest('[data-cal-jour]');
      if (jour) {
        var iso = jour.dataset.calJour;
        fermerCalendrier();
        onChoix(iso);
      }
    });

    document.body.appendChild(boite);
    dessiner();
    placer();
    cal = { el: boite, touche: surTouche, clic: surClicExterieur, place: placer };
    document.addEventListener('keydown', surTouche, true);
    document.addEventListener('pointerdown', surClicExterieur, true);
    window.addEventListener('resize', placer, true);
  }
  G.ouvrirCalendrier = ouvrirCalendrier;

  /* =================================================== menu du clic droit == */
  /* Un clic droit sur une tâche, sur un groupe ou dans le vide du graphique
     ouvre un menu d'actions. Position fixe, rabattu dans la fenêtre, jamais
     coupé par un bord. */
  var menuCtx = null, ctxCible = null;

  function fermerMenuCtx() {
    if (!menuCtx) return;
    if (menuCtx.el.parentNode) menuCtx.el.parentNode.removeChild(menuCtx.el);
    document.removeEventListener('keydown', menuCtx.touche, true);
    document.removeEventListener('pointerdown', menuCtx.clic, true);
    window.removeEventListener('resize', fermerMenuCtx, true);
    el.scroller.removeEventListener('scroll', fermerMenuCtx, true);
    menuCtx = null;
  }
  G.fermerMenuCtx = fermerMenuCtx;

  function ctxItem(act, libelle, raccourci, desactive, danger) {
    return '<button role="menuitem" data-ctx="' + act + '"' +
      (desactive ? ' disabled' : '') + (danger ? ' class="danger"' : '') + '>' +
      '<span>' + libelle + '</span>' + (raccourci ? '<kbd>' + raccourci + '</kbd>' : '') + '</button>';
  }
  function ctxSep() { return '<div class="menu-sep"></div>'; }
  function ctxTitre(txt) { return '<span class="menu-label">' + U.esc(txt) + '</span>'; }

  function ouvrirMenuCtx(x, y, contenu) {
    fermerCalendrier();
    fermerMenuCtx();
    if (!contenu || !contenu.length) return;

    var boite = document.createElement('div');
    boite.className = 'menu menu-contexte';
    boite.setAttribute('role', 'menu');
    boite.innerHTML = contenu.join('');
    document.body.appendChild(boite);

    var w = boite.offsetWidth, h = boite.offsetHeight;
    boite.style.left = U.clamp(x, 6, Math.max(6, window.innerWidth - w - 6)) + 'px';
    boite.style.top = U.clamp(y, 6, Math.max(6, window.innerHeight - h - 6)) + 'px';

    boite.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-ctx]');
      if (!b || b.disabled) return;
      var act = b.dataset.ctx;
      fermerMenuCtx();
      if (actionsCtx[act]) actionsCtx[act](b);
    });

    function surTouche(ev) { if (ev.key === 'Escape') { ev.stopPropagation(); fermerMenuCtx(); } }
    function surClic(ev) { if (!boite.contains(ev.target)) fermerMenuCtx(); }

    menuCtx = { el: boite, touche: surTouche, clic: surClic };
    document.addEventListener('keydown', surTouche, true);
    document.addEventListener('pointerdown', surClic, true);
    window.addEventListener('resize', fermerMenuCtx, true);
    el.scroller.addEventListener('scroll', fermerMenuCtx, true);
  }

  function onContextMenu(e) {
    var cible = e.target;
    if (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.isContentEditable) return;
    if (!cible.closest) return;

    var bar = cible.closest('.bar,.milestone');
    var ligneJalon = cible.closest('.milestone-label');
    var row = cible.closest('.row');

    /* sur une barre, un jalon ou son libellé → menu de la tâche */
    if (bar || ligneJalon) {
      var id = bar ? bar.dataset.id : (row ? row.dataset.id : null);
      if (!id) return;
      ouvrirPourTache(id, e);
      return;
    }

    /* dans la colonne des noms → menu de la ligne (tâche ou groupe) */
    var rl = cible.closest('.row-left');
    if (rl && row) {
      e.preventDefault();
      if (row.dataset.kind === 'task') ouvrirPourTache(row.dataset.id, e);
      else {
        ctxCible = { kind: 'section', id: row.dataset.id };
        ouvrirMenuCtx(e.clientX, e.clientY, menuGroupe());
      }
      return;
    }

    /* ailleurs dans le graphique : le vide, même au-dessus d'une ligne */
    if (cible.closest('.track,.body,.head,#canvas,.chart-scroller')) {
      ctxCible = null;
      e.preventDefault();
      ouvrirMenuCtx(e.clientX, e.clientY, menuVide());
    }
  }

  function ouvrirPourTache(id, e) {
    if (G.state.selection.indexOf(id) < 0) {
      selectionner(id, 'simple');
      V.refreshSelection();
      V.renderInspector();
    }
    ctxCible = { kind: 'task', id: id };
    e.preventDefault();
    ouvrirMenuCtx(e.clientX, e.clientY, menuTache());
  }

  function menuTache() {
    var n = G.state.selection.length;
    var t = G.taskById(ctxCible.id);
    var plusieurs = n > 1;
    var h = [];
    if (plusieurs) h.push(ctxTitre(n + ' éléments sélectionnés'));
    h.push(ctxItem('renommer', 'Renommer', 'F2', plusieurs));
    h.push(ctxItem('dupliquer', 'Dupliquer à +7 jours', 'Ctrl+D'));
    h.push(ctxItem('copier', 'Copier', 'Ctrl+C'));
    h.push(ctxSep());
    h.push(ctxItem('dessus', 'Insérer une tâche au-dessus', null, plusieurs));
    h.push(ctxItem('dessous', 'Insérer une tâche en dessous', null, plusieurs));
    if (t && !plusieurs) {
      h.push(ctxSep());
      h.push(ctxItem('jalon', t.milestone ? 'Repasser en tâche' : 'Convertir en jalon'));
    }
    h.push(ctxSep());
    h.push(ctxItem('supprimer', plusieurs ? 'Supprimer les ' + n + ' éléments' : 'Supprimer', 'Suppr', false, true));
    return h;
  }

  function menuGroupe() {
    var s = G.sectionById(ctxCible.id);
    if (!s) return [];
    var nb = G.state.tasks.filter(function (t) { return t.section === s.id; }).length;
    var seul = G.state.sections.length <= 1;
    var h = [];
    h.push(ctxTitre(s.name + ' · ' + nb + ' tâche' + (nb > 1 ? 's' : '')));
    h.push(ctxItem('renommer', 'Renommer le groupe'));
    h.push(ctxItem('replier', s.collapsed ? 'Déplier' : 'Replier'));
    h.push(ctxItem('tacheGroupe', 'Ajouter une tâche ici'));
    h.push('<div class="menu-couleurs"><span class="menu-label">Couleur</span><div class="swatches">' +
      G.PALETTE.map(function (c) {
        return '<button type="button" class="swatch" data-ctx="couleur" data-color="' + c.id + '"' +
          ' style="background:' + c.bar + '" aria-pressed="' + (s.color === c.id ? 'true' : 'false') + '"' +
          ' title="' + c.name + '" aria-label="' + c.name + '"></button>';
      }).join('') + '</div></div>');
    h.push(ctxSep());
    h.push(ctxItem('supprimerGroupe',
      seul ? 'Supprimer le groupe et ses tâches' : 'Supprimer le groupe',
      null, false, true));
    return h;
  }

  function menuVide() {
    var h = [];
    h.push(ctxItem('nouvelleTache', 'Nouvelle tâche', 'Alt+N'));
    h.push(ctxItem('nouveauGroupe', 'Nouveau groupe'));
    var cb = G.state.clipboard;
    if (cb && cb.taches && cb.taches.length) h.push(ctxItem('coller', 'Coller', 'Ctrl+V'));
    h.push(ctxSep());
    h.push(ctxItem('toutSelectionner', 'Tout sélectionner', 'Ctrl+A'));
    return h;
  }

  var actionsCtx = {
    renommer: function () {
      var row = el.body.querySelector('.row[data-id="' + ctxCible.id + '"]');
      if (!row) return;
      if (ctxCible.kind === 'task') {
        selectionner(ctxCible.id, 'simple');
        V.refreshSelection();
        V.renderInspector();
      }
      renommerEnPlace(row);
    },
    dupliquer: function () { G.dupliquer(); },
    copier: function () { copier(); },
    coller: function () { coller(); },
    supprimer: function () { G.supprimer(); },
    toutSelectionner: function () {
      G.state.selection = G.state.tasks.map(function (t) { return t.id; });
      V.refreshSelection();
      V.renderInspector();
    },
    nouvelleTache: function () { G.ajouterTache(); },
    nouveauGroupe: function () {
      G.addSection('Groupe ' + (G.state.sections.length + 1));
      commit();
    },
    dessus: function () { insererTacheRelative(true); },
    dessous: function () { insererTacheRelative(false); },
    jalon: function () { basculerJalon(); },
    replier: function () {
      var s = G.sectionById(ctxCible.id);
      if (s) { s.collapsed = !s.collapsed; commit(); }
    },
    tacheGroupe: function () {
      var s = G.sectionById(ctxCible.id);
      if (!s) return;
      var t = G.addTask({ name: 'Nouvelle tâche', section: s.id });
      var meme = G.state.tasks.filter(function (x) { return x.section === s.id && x.id !== t.id; });
      if (meme.length) {
        var fin = meme.reduce(function (a, x) { return a > x.end ? a : x.end; }, meme[0].end);
        t.start = U.addDays(fin, 1);
        t.end = U.addDays(t.start, 4);
      }
      G.state.selection = [t.id];
      commit();
      var c = el.inspector.querySelector('[data-field="name"]');
      if (c) { c.focus(); c.select(); }
    },
    couleur: function (b) {
      var s = G.sectionById(ctxCible.id);
      if (!s) return;
      s.color = b.dataset.color;
      commit();
    },
    supprimerGroupe: function () {
      var s = G.sectionById(ctxCible.id);
      if (!s) return;
      var idx = G.state.sections.indexOf(s);
      var suivant = G.state.sections[idx + 1] || G.state.sections[idx - 1];
      var nb = G.state.tasks.filter(function (t) { return t.section === s.id; }).length;
      if (!suivant) {
        if (!window.confirm('Supprimer « ' + s.name + ' » et ses ' + nb + ' tâche(s) ?')) return;
      }
      G.removeSection(s.id);
      G.state.selection = [];
      commit();
      V.toast(suivant
        ? 'Groupe supprimé — ses tâches passent dans « ' + suivant.name + ' »'
        : 'Groupe supprimé avec ses tâches', 'ok', 3400);
    }
  };

  function insererTacheRelative(auDessus) {
    var ref = G.taskById(ctxCible.id);
    if (!ref) return;
    var t = G.newTask({ name: 'Nouvelle tâche', section: ref.section, start: ref.start, end: ref.end });
    var i = G.state.tasks.indexOf(ref);
    G.state.tasks.splice(auDessus ? i : i + 1, 0, t);
    G.state.selection = [t.id];
    commit();
    var c = el.inspector.querySelector('[data-field="name"]');
    if (c) { c.focus(); c.select(); }
  }

  function basculerJalon() {
    var t = G.taskById(ctxCible.id);
    if (!t) return;
    if (!t.milestone) {
      t._dureeAvant = G.duree(t);          /* pour la retrouver au retour */
      t.milestone = true;
      if (!t.tag) t.tag = G.nextMilestoneTag();
      t.end = t.start;
    } else {
      t.milestone = false;
      t.end = U.addDays(t.start, (t._dureeAvant || 5) - 1);
      delete t._dureeAvant;
    }
    G.state.selection = [t.id];
    commit();
  }


  function onWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    var i = G.ZOOM_ORDER.indexOf(G.state.zoom);
    var suivant = G.ZOOM_ORDER[U.clamp(i + (e.deltaY > 0 ? 1 : -1), 0, G.ZOOM_ORDER.length - 1)];
    if (suivant !== G.state.zoom) {
      V.zoomTo(suivant, e.clientX);
      G.persist.saveSoon();
    }
  }

  /* =========================================================== presse-papiers */
  function copierTaches(ids, decalage) {
    var taches = ids.map(G.taskById).filter(Boolean);
    if (!taches.length) return [];
    var debut = taches.reduce(function (a, t) { return a < t.start ? a : t.start; }, taches[0].start);
    var correspondance = {};                       // ancien id -> nouveau
    var copies = taches.map(function (t) {
      var c = G.newTask({
        name: t.name, section: t.section,
        start: U.addDays(t.start, decalage),
        end: U.addDays(t.end, decalage),
        progress: t.progress, milestone: t.milestone, tag: t.tag,
        color: t.color, notes: t.notes
      });
      correspondance[t.id] = c.id;
      return c;
    });

    /* liens internes recopiés, liens externes abandonnés */
    taches.forEach(function (t, i) {
      (t.deps || []).forEach(function (d) {
        if (correspondance[d.id]) copies[i].deps.push({ id: correspondance[d.id], type: d.type || 'FS' });
      });
    });
    /* jalons recopiés : nouvelle étiquette pour éviter les doublons */
    var num = parseInt(String(G.nextMilestoneTag()).slice(1), 10) || 1;
    copies.forEach(function (c) { if (c.milestone) c.tag = 'M' + (num++); });
    copies.origine = debut;
    return copies;
  }
  G.copierTaches = copierTaches;

  function coller() {
    var cb = G.state.clipboard;
    if (!cb || !cb.taches || !cb.taches.length) { collerTexte(); return; }

    var cible = G.state.selection.length === 1 ? G.taskById(G.state.selection[0]) : null;
    var decalage = cible ? U.diffDays(cb.origine, cible.start) : 7;
    var num = parseInt(String(G.nextMilestoneTag()).slice(1), 10) || 1;
    var copies = cb.taches.map(function (t) {
      var c = G.newTask({
        name: t.name, section: t.section,
        start: U.addDays(t.start, decalage), end: U.addDays(t.end, decalage),
        progress: t.progress, milestone: t.milestone, tag: t.tag,
        color: t.color, notes: t.notes
      });
      if (c.milestone) c.tag = 'M' + (num++);
      return c;
    });
    var cor = {};
    cb.taches.forEach(function (t, i) { cor[t.id] = copies[i].id; });
    cb.taches.forEach(function (t, i) {
      (t.deps || []).forEach(function (d) {
        if (cor[d.id]) copies[i].deps.push({ id: cor[d.id], type: d.type || 'FS' });
      });
    });

    var ancre = G.state.selection.length === 1 ? G.taskById(G.state.selection[0]) : null;
    var apres = ancre ? ancre.id : null;
    copies.forEach(function (c) {
      if (apres) { G.insertAfter(apres, c); apres = c.id; }
      else G.state.tasks.push(c);
    });

    G.state.selection = copies.map(function (c) { return c.id; });
    commit();
    V.toast(copies.length + ' tâche' + (copies.length > 1 ? 's' : '') + ' collée' +
            (copies.length > 1 ? 's' : '') + ' · ' + U.fmtLong(copies[0].start), 'ok', 3000);
  }

  /* Collage de texte : lignes « nom <tab|;> début <tab|;> fin » ou noms seuls */
  function collerTexte() {
    if (!navigator.clipboard || !navigator.clipboard.readText) {
      V.toast('Presse-papiers illisible — copiez une tâche ou un tableau', 'warn', 3200);
      return;
    }
    navigator.clipboard.readText().then(function (txt) {
      txt = (txt || '').trim();
      if (!txt) { V.toast('Rien à coller', 'warn'); return; }
      appliquerTexte(txt);
    }).catch(function () {
      V.toast('Le navigateur a refusé l\'accès au presse-papiers', 'warn', 3200);
    });
  }

  function appliquerTexte(txt) {
    var lignes = txt.split(/\r?\n/).filter(function (l) { return l.trim() !== ''; });
    var cree = [];
    var jours = 0;
    var section = G.state.sections.length
      ? (G.state.selection.length === 1 && G.taskById(G.state.selection[0])
          ? G.taskById(G.state.selection[0]).section
          : G.state.sections[G.state.sections.length - 1].id)
      : G.addSection('Groupe 1').id;

    lignes.forEach(function (l) {
      var c = l.split(/\t|;|\s\|\s/).map(function (x) { return x.trim(); });
      var nom = c[0];
      if (!nom) return;
      var d = U.parseLoose(c[1]);
      var f = U.parseLoose(c[2]);
      var debut, fin;
      if (d) {
        debut = d;
        fin = f && f >= d ? f : U.addDays(d, 4);
      } else {
        debut = U.addDays(U.todayISO(), jours);
        fin = U.addDays(debut, 4);
        jours += 1;
      }
      var t = G.newTask({ name: nom, section: section, start: debut, end: fin });
      cree.push(t);
    });

    if (!cree.length) { V.toast('Aucune ligne exploitable', 'warn'); return; }
    cree.forEach(function (t) { G.state.tasks.push(t); });
    G.state.selection = cree.map(function (t) { return t.id; });
    commit();
    V.toast(cree.length + ' tâche(s) créée(s) depuis le presse-papiers', 'ok', 3000);
  }
  G.appliquerTexte = appliquerTexte;

  /* ============================================================== clavier */
  var SAISIE = /^(INPUT|TEXTAREA|SELECT)$/;

  function onKey(e) {
    var dansSaisie = SAISIE.test((e.target.tagName || '')) || e.target.isContentEditable;
    var ctrl = e.ctrlKey || e.metaKey;

    /* Ctrl+S / Ctrl+O : toujours actifs */
    if (ctrl && !e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (e.shiftKey) G.io.saveAs(); else G.io.save();
      return;
    }
    if (ctrl && !e.altKey && (e.key === 'o' || e.key === 'O')) {
      e.preventDefault();
      G.io.openFile();
      return;
    }

    if (dansSaisie) {
      if (e.key === 'Escape') e.target.blur();
      return;
    }

    if (e.key === 'Escape') {
      if (el.menu && !el.menu.hidden) { el.menu.hidden = true; return; }
      V.deselect(); V.refreshSelection(); V.renderInspector();
      return;
    }

    if (ctrl && !e.altKey) {
      var gere = true;
      switch (e.key.toLowerCase()) {
        case 'c': copier(); break;
        case 'x': copier(); supprimer(); break;
        case 'v': coller(); break;
        case 'd': dupliquer(); break;
        case 'a':
          G.state.selection = G.state.tasks.map(function (t) { return t.id; });
          V.refreshSelection(); V.renderInspector();
          break;
        case 'z':
          if (e.shiftKey) { if (G.history.redo()) commit(); }
          else if (G.history.undo()) commit();
          break;
        case 'y':
          if (G.history.redo()) commit();
          break;
        case 'p':
          G.io.print();
          break;
        default:
          gere = false;                    /* Ctrl + flèche : traité plus bas */
      }
      if (gere) { e.preventDefault(); return; }
    }

    if (e.altKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      ajouterTache();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!G.state.selection.length) return;
      e.preventDefault();
      supprimer();
      return;
    }

    if (e.key === 'F2') {                       /* renommer sur place */
      if (G.state.selection.length !== 1) return;
      e.preventDefault();
      var ligne = el.body.querySelector('.row[data-id="' + G.state.selection[0] + '"]');
      if (ligne) renommerEnPlace(ligne);
      return;
    }

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (!G.state.selection.length) return;
      e.preventDefault();
      var sens = e.key === 'ArrowRight' ? 1 : -1;
      var pas = sens * (e.ctrlKey ? 7 : 1);       /* Ctrl = une semaine */
      if (e.shiftKey) {                            /* Maj = étirer la fin */
        G.state.selection.forEach(function (id) {
          var t = G.taskById(id);
          if (t && !t.milestone) G.resizeTask(t, 'r', pas);
        });
      } else {
        G.moveTasks(G.state.selection, pas);
      }
      commit();
      return;
    }

    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      var courant = G.state.selection.length ? M.index[G.state.selection[0]] : -1;
      var dir = e.key === 'ArrowDown' ? 1 : -1;
      var i = courant;
      for (var k = 0; k < M.rows.length + 1; k++) {
        i += dir;
        if (i < 0 || i >= M.rows.length) return;
        if (M.rows[i].kind === 'task') {
          e.preventDefault();
          selectionner(M.rows[i].task.id, 'simple');
          V.refreshSelection(); V.renderInspector();
          return;
        }
      }
      return;
    }

    if (e.key === 'Enter') {
      if (!G.state.selection.length) return;
      e.preventDefault();
      var c = el.inspector.querySelector('[data-field="name"]');
      if (c) { c.focus(); c.select(); }
    }
  }

  /* ---------------------------------------------------------- commandes */
  function copier() {
    var ids = G.state.selection.slice();
    if (!ids.length) { V.toast('Rien à copier', 'warn'); return; }
    var taches = copierTaches(ids, 0);
    var origine = taches.origine;
    taches.forEach(function (t) { delete t.origine; });
    G.state.clipboard = { taches: taches, origine: origine };
    var texte = taches.map(function (t) {
      return t.name + '\t' + t.start + '\t' + t.end;
    }).join('\n');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texte).catch(function () { /* refusé : sans importance */ });
      }
    } catch (err) { /* refusé : sans importance */ }
    V.toast(ids.length + ' tâche' + (ids.length > 1 ? 's' : '') + ' copiée' + (ids.length > 1 ? 's' : '') +
            ' · <kbd>Ctrl</kbd><kbd>V</kbd> pour coller', 'ok', 2600);
  }

  function dupliquer() {
    var ids = G.state.selection.slice();
    if (!ids.length) { V.toast('Rien à dupliquer', 'warn'); return; }
    var copies = copierTaches(ids, 0);
    copies.forEach(function (c) { c.start = U.addDays(c.start, 7); c.end = U.addDays(c.end, 7); });
    copies.forEach(function (c) { delete c.origine; G.state.tasks.push(c); });
    G.state.selection = copies.map(function (c) { return c.id; });
    commit();
    V.toast('Dupliqué à +7 jours', 'ok');
  }

  function supprimer() {
    var ids = G.state.selection.slice();
    if (!ids.length) return;
    G.removeTasks(ids);
    G.state.selection = [];
    commit();
    V.toast(ids.length + ' élément' + (ids.length > 1 ? 's' : '') + ' supprimé' + (ids.length > 1 ? 's' : ''), 'ok');
  }

  function ajouterTache() {
    var t = G.addTask({ name: 'Nouvelle tâche' });
    /* placée après la fin de la dernière tâche du groupe, sinon aujourd'hui */
    var meme = G.state.tasks.filter(function (x) { return x.section === t.section && x.id !== t.id; });
    if (meme.length) {
      var fin = meme.reduce(function (a, x) { return a > x.end ? a : x.end; }, meme[0].end);
      t.start = U.addDays(fin, 1);
      t.end = U.addDays(t.start, 4);
    }
    G.state.selection = [t.id];
    commit();
    var c = el.inspector.querySelector('[data-field="name"]');
    if (c) { c.focus(); c.select(); }
  }
  G.ajouterTache = ajouterTache;
  G.dupliquer = dupliquer;
  G.supprimer = supprimer;
  G.copier = copier;
  G.coller = coller;

  /* ============================================================ inspecteur */
  function onInspField(e) {
    var f = e.target.dataset ? e.target.dataset.field : null;
    if (!f) return;
    var v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;

    if (f === 'title') {
      G.state.title = v;
      if (el.title) el.title.value = v;
      G.persist.saveSoon(); G.history.commit();
      return;
    }
    if (f === 'zoom') { V.zoomTo(v); G.persist.saveSoon(); return; }
    if (f === 'theme') { G.state.theme = v; V.render(); G.persist.saveSoon(); return; }
    if (f === 'rowHeight') { G.state.rowHeight = +v; V.render(); G.persist.saveSoon(); return; }

    var t = G.state.selection.length === 1 ? G.taskById(G.state.selection[0]) : null;

    if (f === 'progressMulti') { G.setProgress(G.state.selection, v); commit(); return; }
    if (f === 'sectionMulti') {
      G.state.selection.forEach(function (id) { var x = G.taskById(id); if (x) x.section = v; });
      commit(); return;
    }
    if (!t) return;

    switch (f) {
      case 'name':
        t.name = v;
        V.refreshChart();
        break;
      case 'section':
        t.section = v;
        V.refreshChart();
        break;
      case 'start':
      case 'end': {
        /* champ texte : on n'applique qu'à la validation (Entrée ou sortie du
           champ), pas à chaque touche — sinon « 0 » ou « 2025 » seraient rejetés */
        if (e.type === 'input') {
          e.target.classList.remove('invalide');
          return;
        }
        var iso = U.parseLoose(v);
        if (!iso) {
          e.target.classList.add('invalide');
          return;
        }
        e.target.classList.remove('invalide');
        if (f === 'start') G.setDates(t, iso, t.end);
        else G.setDates(t, t.start, iso);
        e.target.value = (f === 'start') ? t.start : t.end;
        V.refreshChart();
        break;
      }
      case 'duration': {
        var d = Math.max(1, +v || 1);
        G.setDates(t, t.start, U.addDays(t.start, d - 1));
        V.refreshChart();
        break;
      }
      case 'progress':
        t.progress = U.clamp(+v || 0, 0, 100);
        V.refreshChart();
        break;
      case 'milestone':
        if (v && !t.milestone) {
          t._dureeAvant = G.duree(t);       /* pour la retrouver au retour */
          t.milestone = true;
          if (!t.tag) t.tag = G.nextMilestoneTag();
          t.end = t.start;
        } else if (!v && t.milestone) {
          t.milestone = false;
          t.end = U.addDays(t.start, (t._dureeAvant || 5) - 1);
          delete t._dureeAvant;
        }
        V.render();
        break;
      case 'notes':
        t.notes = v;
        break;
      case 'addpred': {
        if (!v) return;
        var ok = G.addDep(v, t.id, 'FS');
        if (!ok) { V.toast('Lien impossible (cycle ou doublon)', 'warn'); }
        V.render();
        break;
      }
      default:
        return;
    }
    G.persist.saveSoon();
    G.history.commit();
    V.syncToolbar();
  }

  function onInspClick(e) {
    /* bouton calendrier d'un champ de date */
    var bc = e.target.closest ? e.target.closest('[data-cal]') : null;
    if (bc) {
      var tc = G.state.selection.length === 1 ? G.taskById(G.state.selection[0]) : null;
      if (!tc) return;
      (function (cle, tache) {
        ouvrirCalendrier(bc, cle === 'start' ? tache.start : tache.end, function (iso) {
          if (cle === 'start') G.setDates(tache, iso, tache.end);
          else G.setDates(tache, tache.start, iso);
          G.dirty = true;
          G.persist.saveSoon();
          G.history.commit();
          V.render();
        });
      })(bc.dataset.cal, tc);
      return;
    }

    var b = e.target.closest ? e.target.closest('[data-act],[data-color],[data-unlink],[data-shift]') : null;
    if (!b) return;
    var t = G.state.selection.length === 1 ? G.taskById(G.state.selection[0]) : null;

    if (b.dataset.color !== undefined) {
      if (t) {
        t.color = b.dataset.color || null;
        var sw = el.inspector.querySelectorAll('.swatch');
        Array.prototype.forEach.call(sw, function (s) {
          s.setAttribute('aria-pressed', String((s.dataset.color || null) === t.color));
        });
        V.refreshChart();
        G.persist.saveSoon(); G.history.commit();
      }
      return;
    }
    if (b.dataset.unlink) {
      if (t) {
        t.deps = t.deps.filter(function (d) { return d.id !== b.dataset.unlink; });
        V.render(); G.persist.saveSoon(); G.history.commit();
      }
      return;
    }
    if (b.dataset.shift) {
      G.moveTasks(G.state.selection, +b.dataset.shift);
      commit();
      return;
    }

    switch (b.dataset.act) {
      case 'deselect': V.deselect(); V.refreshSelection(); V.renderInspector(); break;
      case 'dup': G.dupliquer(); break;
      case 'copy': G.copier(); break;
      case 'del': G.supprimer(); break;
      case 'add-task': G.ajouterTache(); break;
      case 'add-section': {
        var s = G.addSection('Groupe ' + (G.state.sections.length + 1));
        G.state.selection = [];
        commit();
        break;
      }
    }
  }

  /* ==================================================== largeur de colonne */
  V.bindGrip = function () {
    var enCours = false;
    el.grip.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      enCours = true;
      el.grip.setPointerCapture(e.pointerId);
      document.body.style.cursor = 'col-resize';
    });
    el.grip.addEventListener('pointermove', function (e) {
      if (!enCours) return;
      var r = rectScroller();
      G.state.leftWidth = U.clamp(Math.round(e.clientX - r.left), 220, 640);
      V.applyVars();
      V.measure();
      el.canvas.style.width = (M.leftW + M.width) + 'px';
      V.render();
    });
    el.grip.addEventListener('pointerup', function (e) {
      if (!enCours) return;
      enCours = false;
      document.body.style.cursor = '';
      G.persist.saveSoon();
    });
  };

})();
