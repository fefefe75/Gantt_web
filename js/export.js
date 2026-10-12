/* ==========================================================================
   export.js — enregistrer / ouvrir / exporter (JSON, SVG, PNG) / imprimer
   ========================================================================== */
(function () {
  'use strict';

  var G = window.Gantt, U = G.util, V = G.view;
  var io = G.io = {};

  /* ======================================================= fichier .json */
  function donnees() { return JSON.stringify(G.serialize(), null, 2); }

  io.nomCourant = null;                     // nom du fichier en cours (sert de suggestion)

  function nomFichier(ext) {
    var base = io.nomCourant
      ? String(io.nomCourant).replace(/\.[^.]+$/, '')
      : U.slug(G.state.title);
    /* un fichier tout neuf porte le nom de l'outil et du projet, pour se
       reconnaître dans un dossier ou dans un espace Confluence */
    if (ext === 'json' && !io.nomCourant) base = 'suivi_projet_' + base;
    return base + '.' + ext;
  }

  function ecrireDans(handle, texte) {
    return handle.createWritable().then(function (w) {
      return w.write(texte).then(function () { return w.close(); });
    });
  }

  function telecharger(texte) {
    U.download(nomFichier('json'), texte, 'application/json');
  }

  /* Le fichier a pu être ouvert en lecture : on demande l'écriture si besoin */
  function assurerEcriture(handle) {
    if (!handle || !handle.queryPermission) return Promise.resolve(true);
    return handle.queryPermission({ mode: 'readwrite' }).then(function (p) {
      if (p === 'granted') return true;
      if (!handle.requestPermission) return false;
      return handle.requestPermission({ mode: 'readwrite' }).then(function (r) { return r === 'granted'; });
    }).catch(function () { return false; });
  }

  function confirmeEcriture() {
    G.dirty = false;
    V.toast('Enregistré dans « ' + (G.state.fileHandle ? G.state.fileHandle.name : nomFichier('json')) + ' »', 'ok');
  }

  /* Ctrl+S : réécrit le fichier ouvert. S'il n'y en a pas (dépôt d'un fichier,
     repli sur le champ caché), on demande où UNE fois, puis on y retourne. */
  io.save = function (choisirUnFichier) {
    var texte = donnees();
    G.persist.save();

    var h = choisirUnFichier ? null : G.state.fileHandle;
    if (h && h.createWritable) {
      assurerEcriture(h).then(function (ok) {
        if (!ok) throw new Error('écriture refusée');
        return ecrireDans(h, texte);
      }).then(function () {
        io.nomCourant = h.name;
        confirmeEcriture();
      }).catch(function () {
        G.state.fileHandle = null;      // lien perdu : on redemande où
        demanderOu(texte);
      });
      return;
    }

    demanderOu(texte);
  };

  function demanderOu(texte) {
    if (window.showSaveFilePicker) {
      var choix;
      try {
        choix = window.showSaveFilePicker({
          suggestedName: nomFichier('json'),
          types: [{ description: 'Planning Gantt', accept: { 'application/json': ['.json'] } }]
        });
      } catch (e) { choix = null; }
      if (choix) {
        choix.then(function (h) {
          G.state.fileHandle = h;
          io.nomCourant = h.name;
          return ecrireDans(h, texte);
        }).then(function () {
          confirmeEcriture();
        }).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          telecharger(texte);
          G.dirty = false;
          V.toast('Téléchargé dans ~/Téléchargements', 'ok');
        });
        return;
      }
    }

    /* navigateur sans accès aux fichiers : téléchargement */
    telecharger(texte);
    G.dirty = false;
    V.toast('Fichier .json téléchargé', 'ok');
  }

  /* Enregistrer sous… : toujours redemander le fichier */
  io.saveAs = function () { io.save(true); };

  /* Nouveau document : on lâche le fichier en cours pour ne pas l'écraser */
  io.nouveauDocument = function () {
    G.state.fileHandle = null;
    io.nomCourant = null;
  };

  io.exportJSON = function () { telecharger(donnees()); };

  /* ============================================== une fiche, en JSON portable ==
     Une fiche seule dans un fichier : elle part chez quelqu'un qui n'a pas
     l'outil, il l'ouvre dans un éditeur de texte, la modifie, la renvoie.
     C'est le même objet que dans le fichier du planning — pas une copie
     approximative, donc rien ne se perd à l'aller-retour. */
  io.nomFiche = function (f) {
    return 'suivi_projet_' + U.slug(f.projet || G.TYPES_FICHE[f.type].nom) +
      '_fiche-' + f.type + (f.numero ? '-' + U.slug(f.numero) : '') +
      '_' + f.date + '.json';
  };

  io.ficheEnJSON = function (f) {
    return JSON.stringify({
      app: 'gantt-local',
      version: 2,
      type: 'fiche',
      exporte_le: U.todayISO(),
      fiche: f
    }, null, 2);
  };

  io.exportFicheJSON = function (f) {
    if (!f) { V.toast('Aucune fiche affichée', 'warn'); return; }
    var nom = io.nomFiche(f);
    U.download(nom, io.ficheEnJSON(f), 'application/json');
    V.toast('Fiche exportée : ' + nom, 'ok', 4200);
  };

  /* Extraction tolérante : une fiche seule, une liste de fiches, ou un
     planning complet dont on ne garde que les fiches. */
  function fichesDe(obj) {
    if (!obj || typeof obj !== 'object') return [];
    if (obj.type === 'fiche' && obj.fiche) return [obj.fiche];
    if (Array.isArray(obj)) return obj;
    if (Array.isArray(obj.fiches)) return obj.fiches;
    if (obj.projet !== undefined || obj.idees !== undefined || obj.fait !== undefined) return [obj];
    return [];
  }

  function integrer(texte, nom) {
    var obj;
    try { obj = JSON.parse(texte); }
    catch (e) { V.toast('JSON invalide', 'warn'); return; }

    var brutes = fichesDe(obj);
    if (!brutes.length) { V.toast('Aucune fiche dans ce fichier', 'warn', 3600); return; }

    var ajoutees = 0, maj = 0;
    brutes.forEach(function (b) {
      var f = G.normFiche(b);
      var place = G.ficheById(f.id);
      if (place) {
        /* la fiche revient corrigée : elle remplace la mienne, à sa place */
        var idx = G.state.fiches.indexOf(place);
        G.state.fiches[idx] = f;
        maj++;
      } else {
        G.state.fiches.push(f);
        ajoutees++;
      }
    });

    G.history.commit();
    G.dirty = true;
    G.persist.save();
    if (G.vues) G.vues.aller('fiches'); else V.render();

    var mots = [];
    if (ajoutees) mots.push(ajoutees + ' fiche(s) ajoutée(s)');
    if (maj) mots.push(maj + ' fiche(s) mise(s) à jour');
    V.toast('Import' + (nom ? ' de « ' + nom + ' »' : '') + ' : ' + mots.join(', '), 'ok', 4400);
  }

  io.importerFiches = function () {
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { integrer(String(r.result), f.name); };
      r.onerror = function () { V.toast('Lecture impossible', 'warn'); };
      r.readAsText(f);
    });
    inp.click();
  };

  /* même chemin quand un .json est déposé dans la fenêtre : si c'est une fiche,
     elle s'ajoute au lieu d'écraser le planning */
  io.estFicheJSON = function (texte) {
    try { return fichesDe(JSON.parse(texte)).length > 0 && !JSON.parse(texte).tasks; }
    catch (e) { return false; }
  };

  io.integrerFiches = integrer;

  /* ------------------------------------------------------------ ouvrir -- */
  io.openFile = function () {
    if (window.showOpenFilePicker) {
      var choix;
      try {
        choix = window.showOpenFilePicker({
          types: [{ description: 'Planning Gantt', accept: { 'application/json': ['.json'] } }],
          multiple: false,
          mode: 'readwrite'            // sinon Ctrl+S ne peut pas réécrire ce fichier
        });
      } catch (e) { choix = null; }
      if (choix) {
        choix.then(function (handles) {
          return handles[0].getFile().then(function (f) {
            return f.text().then(function (txt) {
              G.state.fileHandle = handles[0];
              io.nomCourant = handles[0].name;
              io.importer(txt);
            });
          });
        }).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          io.nouveauDocument();
          V.el.fileInput.click();
        });
        return;
      }
    }
    io.nouveauDocument();
    V.el.fileInput.click();
  };

  /* texte : contenu du .json ; nom : nom du fichier d'origine (facultatif) */
  io.importer = function (texte, nom) {
    var obj;
    try { obj = JSON.parse(texte); }
    catch (e) { V.toast('JSON invalide', 'warn'); return; }
    try {
      G.load(obj);
      if (nom) io.nomCourant = nom;
      G.dirty = false;
      V.render();
      V.toast('Planning chargé : ' + G.state.tasks.length + ' tâches', 'ok');
      try { V.ensureVisible(G.extent().min, true); } catch (e2) {}
    } catch (e) {
      V.toast('Fichier illisible : ' + e.message, 'warn', 3600);
    }
  };

  /* ========================================================== image SVG */
  function couleurs() {
    var sombre = G.state.theme === 'sombre';
    return {
      fond: sombre ? '#171a1f' : '#ffffff',
      encre: sombre ? '#e9ecf1' : '#14161a',
      encre2: sombre ? '#c3c9d2' : '#3c434d',
      discret: sombre ? '#8b93a1' : '#78808d',
      ligne: sombre ? '#2a2f38' : '#e4e7ec',
      grille: sombre ? '#23272f' : '#eceef2',
      grilleFort: sombre ? '#2f3540' : '#d9dde4',
      week: sombre ? '#1a1e24' : '#f7f8fa',
      lien: sombre ? '#5a6472' : '#a8b0bc',
      today: sombre ? '#ff6b6b' : '#e5484d'
    };
  }

  /* Reproduit le graphe en SVG autonome (aucune dépendance, aucune CSS). */
  io.buildSVG = function () {
    var M = V.metrics, C = couleurs(), g = V.granularite();   /* g = granularité réelle de l'axe */
    var rowH = M.rowH, headH = 50, titreH = 40, bord = 14;
    var leftW = 250;
    var W = leftW + M.width + bord * 2;
    var H = titreH + headH + M.rows.length * rowH + bord * 2;
    var ox = bord, oy = titreH + bord;          // origine de l'en-tête
    var X = function (iso) { return leftW + ox + V.x(iso); };
    var Y = function (i) { return oy + headH + i * rowH; };
    var s = [];
    var fSans = 'Open Sans, Noto Sans, DejaVu Sans, sans-serif';
    var fMono = 'JetBrains Mono, DejaVu Sans Mono, monospace';

    s.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H +
           '" viewBox="0 0 ' + W + ' ' + H + '" font-family="' + fSans + '">');
    s.push('<rect width="' + W + '" height="' + H + '" fill="' + C.fond + '"/>');

    /* titre */
    s.push('<text x="' + ox + '" y="' + (bord + 20) + '" font-size="16" font-weight="700" fill="' + C.encre + '">' +
           U.esc(G.state.title) + '</text>');

    /* ---- en-tête : mois + graduations ---- */
    var hx0 = leftW + ox, hx1 = hx0 + M.width;
    s.push('<rect x="' + hx0 + '" y="' + oy + '" width="' + M.width + '" height="' + headH +
           '" fill="' + C.fond + '"/>');

    /* bande haute : les mois, ou les années quand un mois devient trop étroit */
    if (M.px * 30.5 >= 36) {
      var mois = U.startOfMonth(M.startISO);
      while (mois <= M.endISO) {
        var fin = U.endOfMonth(mois);
        var m0 = Math.max(hx0, X(mois)), m1 = Math.min(hx1, X(U.addDays(fin, 1)));
        if (m1 > m0) {
          s.push('<line x1="' + m0 + '" y1="' + oy + '" x2="' + m0 + '" y2="' + (oy + headH) +
                 '" stroke="' + C.grilleFort + '"/>');
          var lbl = (m1 - m0) < 76 ? (U.mois[+mois.slice(5, 7) - 1] + ' ' + mois.slice(2, 4)) : U.fmtMonthYear(mois);
          s.push('<text x="' + (m0 + 8) + '" y="' + (oy + 16) + '" font-size="11" font-weight="600" fill="' +
                 C.encre2 + '">' + U.esc(lbl) + '</text>');
        }
        mois = U.addDays(fin, 1);
      }
    } else {
      var anH = M.startISO.slice(0, 4);
      while (anH + '-01-01' <= M.endISO) {
        var aH0 = Math.max(hx0, X(anH + '-01-01'));
        var aH1 = Math.min(hx1, X((anH * 1 + 1) + '-01-01'));
        if (aH1 > aH0) {
          s.push('<line x1="' + aH0 + '" y1="' + oy + '" x2="' + aH0 + '" y2="' + (oy + headH) +
                 '" stroke="' + C.grilleFort + '"/>');
          s.push('<text x="' + (aH0 + 8) + '" y="' + (oy + 16) + '" font-size="11" font-weight="600" fill="' +
                 C.encre2 + '">' + anH + '</text>');
        }
        anH = String(anH * 1 + 1);
      }
    }

    /* graduations basses, à la granularité réelle de l'axe */
    if (g === 'jour') {
      for (var i = 0; i < M.days; i++) {
        var d = U.addDays(M.startISO, i);
        s.push('<text x="' + (X(d) + M.px / 2) + '" y="' + (oy + headH - 8) +
               '" font-size="9" font-family="' + fMono + '" text-anchor="middle" fill="' + C.discret + '">' +
               d.slice(8, 10) + '</text>');
      }
    } else if (g === 'semaine') {
      var l = U.startOfWeek(M.startISO);
      while (U.diffDays(l, M.endISO) >= 0) {
        if (X(l) > hx0 - 30 && X(l) < hx1) {
          s.push('<line x1="' + X(l) + '" y1="' + (oy + headH - 26) + '" x2="' + X(l) + '" y2="' + (oy + headH) +
                 '" stroke="' + C.grille + '"/>');
          s.push('<text x="' + (X(l) + 7 * M.px / 2) + '" y="' + (oy + headH - 8) +
                 '" font-size="9" font-family="' + fMono + '" text-anchor="middle" fill="' + C.discret + '">' +
                 (7 * M.px < 44 ? 'S' + U.weekNumber(l) : U.fmtShort(l)) + '</text>');
        }
        l = U.addDays(l, 7);
      }
    } else if (g === 'mois') {
      var an = M.startISO.slice(0, 4);
      while (an + '-01-01' <= M.endISO) {
        var a0 = an + '-01-01', a1 = (an * 1 + 1) + '-01-01';
        var x0 = Math.max(hx0, X(a0)), x1 = Math.min(hx1, X(a1));
        if (x1 > x0) {
          s.push('<text x="' + (x0 + 8) + '" y="' + (oy + headH - 8) + '" font-size="10" font-family="' + fMono +
                 '" font-weight="600" fill="' + C.encre2 + '">' + an + '</text>');
        }
        an = String(an * 1 + 1);
      }
    } else {
      var q = U.startOfMonth(M.startISO);
      while (q <= M.endISO) {
        var tri = Math.floor((+q.slice(5, 7) - 1) / 3) + 1;
        var t0 = q.slice(0, 5) + U.pad2((tri - 1) * 3 + 1) + '-01';
        var t1 = U.addMonths(t0, 3);
        var qx0 = Math.max(hx0, X(t0)), qx1 = Math.min(hx1, X(t1));
        if (qx1 > qx0) {
          s.push('<text x="' + (qx0 + 8) + '" y="' + (oy + headH - 8) + '" font-size="10" font-family="' + fMono +
                 '" font-weight="600" fill="' + C.encre2 + '">T' + tri + ' ' + t0.slice(0, 4) + '</text>');
        }
        q = t1;
      }
    }
    s.push('<line x1="' + hx0 + '" y1="' + (oy + headH) + '" x2="' + hx1 + '" y2="' + (oy + headH) +
           '" stroke="' + C.grilleFort + '"/>');

    /* ---- corps ---- */
    var corpsH = M.rows.length * rowH;
    var bx0 = leftW + ox, by0 = oy + headH;

    /* week-ends (seulement si les jours sont assez larges) */
    if ((g === 'jour' || g === 'semaine') && M.px >= 3) {
      for (var w = 0; w < M.days; w++) {
        var wd = U.addDays(M.startISO, w);
        if (U.dow(wd) < 5) continue;
        s.push('<rect x="' + X(wd) + '" y="' + by0 + '" width="' + M.px + '" height="' + corpsH +
               '" fill="' + C.week + '"/>');
      }
    }

    /* fonds de groupe + lignes de séparation */
    M.rows.forEach(function (rw, i) {
      if (rw.kind === 'section') {
        var col = G.colorOf(rw.section.color);
        /* teinte du groupe en opacité : tient sur fond clair comme sur fond
           sombre, contrairement à la couleur « soft » de la palette (pensée
           pour du blanc, elle ressortait en bande claire en thème sombre) */
        s.push('<rect x="' + bx0 + '" y="' + Y(i) + '" width="' + M.width + '" height="' + rowH +
               '" fill="' + col.bar + '" fill-opacity="0.10"/>');
        s.push('<rect x="' + ox + '" y="' + Y(i) + '" width="' + leftW + '" height="' + rowH +
               '" fill="' + col.bar + '" fill-opacity="0.10"/>');
        s.push('<rect x="' + ox + '" y="' + Y(i) + '" width="4" height="' + rowH + '" fill="' + col.bar + '"/>');
        s.push('<text x="' + (ox + 12) + '" y="' + (Y(i) + rowH / 2 + 4) + '" font-size="11.5" font-weight="700" fill="' +
               C.encre + '">' + U.esc(rw.section.name) + '</text>');
      }
    });

    /* grille verticale, même granularité que l'axe */
    var gx = [];
    if (g === 'jour') {
      for (var k = 0; k <= M.days; k++) {
        var gd = U.addDays(M.startISO, k);
        gx.push([X(gd), (gd.slice(8, 10) !== '01' && U.dow(gd) !== 0) ? C.grille : C.grilleFort]);
      }
    } else if (g === 'semaine') {
      var gs = U.startOfWeek(M.startISO);
      while (U.diffDays(gs, M.endISO) >= -6) {
        gx.push([X(gs), C.grille]);
        gs = U.addDays(gs, 7);
      }
    } else if (g === 'mois') {
      var gm = U.startOfMonth(M.startISO);
      while (gm <= M.endISO) {
        gx.push([X(gm), gm.slice(5, 7) === '01' ? C.grilleFort : C.grille]);
        gm = U.addDays(U.endOfMonth(gm), 1);
      }
    } else {
      var gq = U.startOfMonth(M.startISO);
      var trq = Math.floor((+gq.slice(5, 7) - 1) / 3) * 3 + 1;
      gq = gq.slice(0, 5) + U.pad2(trq) + '-01';
      while (gq <= M.endISO) {
        gx.push([X(gq), gq.slice(5, 7) === '01' ? C.grilleFort : C.grille]);
        gq = U.addMonths(gq, 3);
      }
    }
    gx.forEach(function (lg) {
      s.push('<line x1="' + lg[0] + '" y1="' + by0 + '" x2="' + lg[0] + '" y2="' + (by0 + corpsH) +
             '" stroke="' + lg[1] + '"/>');
    });

    /* aujourd'hui */
    var today = U.todayISO();
    if (today >= M.startISO && today <= M.endISO) {
      s.push('<line x1="' + X(today) + '" y1="' + by0 + '" x2="' + X(today) + '" y2="' + (by0 + corpsH) +
             '" stroke="' + C.today + '" stroke-width="1.5"/>');
      s.push('<rect x="' + (X(today) - 28) + '" y="' + (by0 - 26) + '" width="56" height="13" rx="3" fill="' +
             C.today + '"/><text x="' + X(today) + '" y="' + (by0 - 16) +
             '" font-size="8.5" font-weight="700" text-anchor="middle" fill="#fff">AUJOURD\'HUI</text>');
    }

    /* flèches de dépendance (sous les barres) */
    G.state.tasks.forEach(function (t) {
      (t.deps || []).forEach(function (dep) {
        var from = G.taskById(dep.id);
        if (!from) return;
        var pts = V.depPoints(from, t);
        if (!pts) return;
        var geom = V.arrowGeom(pts);
        var dx0 = ox + leftW, dy0 = by0;
        s.push('<path d="' + V.chemin(geom.ligne, dx0, dy0) + '" fill="none" stroke="' + C.lien +
               '" stroke-width="1.3" stroke-linejoin="round"/>');
        s.push('<path d="' + V.chemin(geom.tete, dx0, dy0) + ' Z" fill="' + C.lien + '"/>');
      });
    });

    /* barres, jalons, textes */
    M.rows.forEach(function (rw, i) {
      if (rw.kind !== 'task') return;
      var t = rw.task, col = G.taskColor(t), y = Y(i) + rowH / 2, b = V.box(t);

      s.push('<line x1="' + ox + '" y1="' + (Y(i) + rowH) + '" x2="' + (bx0 + M.width) + '" y2="' + (Y(i) + rowH) +
             '" stroke="' + C.grille + '"/>');
      s.push('<text x="' + (ox + 12) + '" y="' + (y + 4) + '" font-size="11" fill="' + C.encre2 + '">' +
             U.esc(t.name.length > 30 ? t.name.slice(0, 29) + '…' : t.name) + '</text>');

      if (t.milestone) {
        var cx = ox + leftW + b.x;
        s.push('<rect x="' + (cx - 9) + '" y="' + (by0 + b.y - 9) + '" width="18" height="18" rx="4" fill="' +
               col.bar + '"/><text x="' + cx + '" y="' + (by0 + b.y + 3.5) +
               '" font-size="8.5" font-weight="700" text-anchor="middle" fill="#fff">' + U.esc(t.tag || '') + '</text>');
        s.push('<text x="' + (cx + 14) + '" y="' + (by0 + b.y + 4) + '" font-size="10.5" fill="' + C.encre2 + '">' +
               U.esc(t.name.length > 34 ? t.name.slice(0, 33) + '…' : t.name) + '</text>');
        return;
      }

      var bw = b.w, bh = Math.min(18, rowH - 12);
      s.push('<rect x="' + (bx0 + b.x) + '" y="' + (by0 + b.y - bh / 2) + '" width="' + bw + '" height="' + bh +
             '" rx="5" fill="' + col.bar + '"/>');
      if (t.progress > 0) {
        s.push('<rect x="' + (bx0 + b.x) + '" y="' + (by0 + b.y - bh / 2) + '" width="' + (bw * t.progress / 100) +
               '" height="' + bh + '" rx="5" fill="rgba(0,0,0,.22)"/>');
      }
      if (bw > t.name.length * 6.2 + 22) {
        s.push('<text x="' + (bx0 + b.x + 9) + '" y="' + (by0 + b.y + 4) + '" font-size="10.5" font-weight="600" fill="#fff">' +
               U.esc(t.name) + '</text>');
      } else {
        s.push('<text x="' + (bx0 + b.x + bw + 7) + '" y="' + (by0 + b.y + 4) + '" font-size="10.5" fill="' + C.encre2 + '">' +
               U.esc(t.name.length > 30 ? t.name.slice(0, 29) + '…' : t.name) + '</text>');
      }
    });

    /* colonne de gauche : filet */
    s.push('<line x1="' + bx0 + '" y1="' + oy + '" x2="' + bx0 + '" y2="' + (by0 + corpsH) +
           '" stroke="' + C.grilleFort + '"/>');

    s.push('</svg>');
    return s.join('\n');
  };

  /* Version serrée sur le projet, pour l'image exportée :
     — cadrage sur les dates réelles (à l'écran il s'aligne sur les mois, ce qui
       ajoute jusqu'à un mois de vide de chaque côté) ;
     — largeur plafonnée : un planning de trois ans au zoom « jour » fait près de
       40 000 px de large, illisible partout où on l'ouvre. On réduit la densité
       plutôt que la taille du dessin — l'axe se replie tout seul sur les
       semaines/mois/trimestres, donc l'image reste complète et lisible. */
  io.LARGEUR_MAX = 8000;
  io.plafonne = false;
  io.buildSVGexport = function () {
    var avantTight = G.state.rangeTight, avantPx = G.state.pxOverride;
    io.plafonne = false;
    G.state.rangeTight = true;
    V.measure();
    if (V.metrics.width > io.LARGEUR_MAX) {
      G.state.pxOverride = io.LARGEUR_MAX / V.metrics.days;
      V.measure();
      io.plafonne = true;
    }
    var svg = io.buildSVG();
    G.state.rangeTight = avantTight;
    G.state.pxOverride = avantPx;
    V.measure();
    return svg;
  };

  io.exportSVG = function () {
    U.download(nomFichier('svg'), io.buildSVGexport(), 'image/svg+xml;charset=utf-8');
    V.toast(io.plafonne
      ? 'SVG exporté — cadré sur le projet, densité ajustée pour rester lisible'
      : 'SVG exporté (vectoriel, pour LaTeX)', 'ok', 3200);
  };

  io.exportPNG = function () {
    var svg = io.buildSVGexport();
    var blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.onload = function () {
      /* Un canvas a une taille maximale (mesurée ici : 65535 px de côté) ;
         au-delà, toBlob ne renvoie plus rien et l'image sortait blanche sur un
         planning de plusieurs années. On adapte donc l'échelle. */
      var COTE_MAX = 60000, AIRE_MAX = 120e6;
      var k = 2;
      if (img.width * k > COTE_MAX) k = COTE_MAX / img.width;
      if (img.height * k > COTE_MAX) k = Math.min(k, COTE_MAX / img.height);
      if (img.width * k * img.height * k > AIRE_MAX) k = Math.sqrt(AIRE_MAX / (img.width * img.height));
      k = Math.max(k, 0.05);

      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k));
      c.height = Math.max(1, Math.round(img.height * k));
      var ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);

      c.toBlob(function (b) {
        if (!b) {
          V.toast('Export PNG impossible — utilisez le SVG ou l\'impression', 'warn', 4000);
          return;
        }
        U.download(nomFichier('png'), b);
        V.toast(io.plafonne
          ? 'PNG exporté — cadré sur le projet, densité ajustée pour rester lisible'
          : (k < 1
              ? 'PNG réduit à ' + Math.round(k * 100) + ' % (planning très large) — l\'SVG reste net à toute échelle'
              : 'PNG exporté (×' + (k === 2 ? '2' : k.toFixed(1)) + ')'),
          'ok', (io.plafonne || k < 1) ? 3400 : 2600);
      }, 'image/png');
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      V.toast('Export PNG impossible — utilisez le SVG', 'warn', 3200);
    };
    img.src = url;
  };

  /* ============================================================ imprimer */
  io.print = function () {
    var avant = G.state.pxOverride;
    var M = V.metrics;
    var papier = 1420;                    /* ~A3 paysage utile, à 96 dpi */
    var dispo = papier - M.leftW - 40;
    if (dispo > 200) G.state.pxOverride = Math.max(0.7, dispo / M.days);
    V.render();
    setTimeout(function () {
      window.print();
      setTimeout(function () {
        G.state.pxOverride = avant;
        V.render();
      }, 400);
    }, 120);
  };

})();
