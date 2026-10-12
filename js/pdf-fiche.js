/* ==========================================================================
   pdf-fiche.js — la fiche en PDF, écrite en texte vectoriel

   jsPDF 4.2.1 (MIT, embarqué dans vendor/) dessine la feuille : les cases à
   cocher sont des carrés tracés, jamais des caractères — les 14 polices
   standard d'un PDF ne savent pas écrire ☐ ni ✓, alors que les accents
   français passent sans problème.

   Le résultat est un vrai PDF : le texte se sélectionne, s'agrandit et
   s'imprime net, contrairement à un rendu d'écran rasterisé.
   ========================================================================== */
(function () {
  'use strict';

  var G = window.Gantt, U = G.util;
  var P = G.pdfFiche = {};

  var A4 = { l: 210, h: 297 };
  var MG = 12;                       // marge gauche / droite
  var HAUT = 14, BAS = 18;           // marges haute / basse
  var LARG = A4.l - 2 * MG;          // 186 mm utiles
  var MIN_LIGNES = 4;                // lignes par tableau dans le PDF, pour écrire à la main
  var AVIS = [['ok', "d'accord"], ['reserves', "d'accord avec réserves"], ['non', 'pas d\'accord']];

  P.dispo = function () { return !!(window.jspdf && window.jspdf.jsPDF); };

  P.nomFichier = function (f) {
    return U.slug(f.projet || G.TYPES_FICHE[f.type].nom) +
      '-fiche-' + f.type + (f.numero ? '-' + U.slug(f.numero) : '') + '.pdf';
  };

  /* ============================================================== la feuille */
  /* `construire` renvoie le document jsPDF sans l'enregistrer : c'est ce qui
     permet de le vérifier (nombre de pages, texte) en dehors du navigateur. */
  P.construire = function (f) {
    if (!P.dispo()) throw new Error('jsPDF absent');
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    doc.setProperties({
      title: G.TYPES_FICHE[f.type].nom + (f.numero ? ' n° ' + f.numero : '') + ' — ' + (f.projet || ''),
      subject: 'Suivi de projet',
      creator: 'Gantt — planificateur local',
      keywords: 'suivi de projet, tuteur, fiche'
    });

    var y = HAUT;

    /* --------------------------------------------------------- primitives -- */
    function bas() { return A4.h - BAS; }

    function saut() {
      doc.addPage();
      y = HAUT;
    }

    function carre(x, yy, cote, coche) {
      doc.setDrawColor(110);
      doc.setLineWidth(0.22);
      doc.rect(x, yy, cote, cote);
      if (!coche) return;
      doc.setDrawColor(20);
      doc.setLineWidth(0.5);
      doc.line(x + cote * 0.20, yy + cote * 0.52, x + cote * 0.42, yy + cote * 0.76);
      doc.line(x + cote * 0.42, yy + cote * 0.76, x + cote * 0.82, yy + cote * 0.22);
    }

    function h2(texte) {
      /* un titre ne part pas seul en bas de page : on veut le titre, l'en-tête
         du tableau et au moins deux lignes ensemble */
      if (y + 45 > bas()) saut();
      y += 3;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.6);
      doc.setTextColor(20);
      doc.text(texte, MG, y + 3.5);
      y += 5.4;
      doc.setDrawColor(205);
      doc.setLineWidth(0.2);
      doc.line(MG, y, MG + LARG, y);
      y += 3;
    }

    function aide(texte) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.4);
      doc.setTextColor(125);
      var lignes = doc.splitTextToSize(texte, LARG);
      lignes.forEach(function (lg) {
        if (y + 4 > bas()) saut();
        doc.text(lg, MG, y + 2.6);
        y += 3.4;
      });
      y += 1;
    }

    /* --- mesure et dessin d'une cellule ----------------------------------- */
    function hauteurBlocs(blocs, w) {
      var h = 2.4;
      blocs.forEach(function (b) {
        if (b.type === 'cases') {
          if (!b.inline) { h += 4.3 * b.items.length; return; }
          /* sur une ligne : on compte les retours à la ligne réels */
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.6);
          var dispo = w - 3, avance = 0, n = 1;
          b.items.forEach(function (it) {
            var wc = 4.4 + doc.getTextWidth(String(it.txt || '')) + 3.4;
            if (avance > 0 && avance + wc > dispo) { n++; avance = 0; }
            avance += wc;
          });
          h += 4.3 * n;
          return;
        }
        var n2 = doc.splitTextToSize(String(b.txt || ''), w - 3).length;
        h += n2 * (b.taille || 8) * 0.48 + 1;
      });
      return Math.max(h, 7.5);
    }

    function dessinerBlocs(blocs, x, yHaut, w) {
      var yy = yHaut + 2.2 + 2.6;
      blocs.forEach(function (b) {
        if (b.type === 'cases') {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.6);
          doc.setTextColor(45);
          if (!b.inline) {
            b.items.forEach(function (it) {
              carre(x + 1.6, yy - 3.1, 3.2, it.coche);
              doc.text(it.txt, x + 5.8, yy);
              yy += 4.3;
            });
            return;
          }
          var xx = x + 1.6, limite = x + w - 2;
          b.items.forEach(function (it) {
            var lib = String(it.txt || '');
            var wCase = 4.4 + doc.getTextWidth(lib) + 3.4;
            if (xx > x + 2 && xx + wCase > limite) { xx = x + 1.6; yy += 4.3; }
            carre(xx, yy - 3.1, 3.2, it.coche);
            if (lib) doc.text(lib, xx + 4.4, yy);
            xx += wCase;
          });
          yy += 4.3;
          return;
        }
        doc.setFont('helvetica', b.gras ? 'bold' : (b.italique ? 'italic' : 'normal'));
        doc.setFontSize(b.taille || 8);
        doc.setTextColor(b.gris ? 125 : 20);
        var lignes = doc.splitTextToSize(String(b.txt == null ? '' : b.txt), w - 3);
        if (!String(b.txt || '').length) lignes = [''];
        lignes.forEach(function (lg) {
          doc.text(lg, x + 1.6, yy);
          yy += (b.taille || 8) * 0.48;
        });
        yy += 1;
      });
    }

    /* --- tableau ---------------------------------------------------------- */
    function tableau(cols, rangees) {
      var total = cols.reduce(function (a, c) { return a + c.w; }, 0);
      if (Math.abs(total - LARG) > 0.6) {
        /* les largeurs sont écrites à la main : une erreur de somme doit se voir
           à l'écriture du PDF, pas se traduire par un tableau qui déborde */
        throw new Error('largeurs de colonnes = ' + total.toFixed(1) + ' mm au lieu de ' + LARG);
      }

      function entete() {
        /* l'en-tête se replie sur plusieurs lignes : mesuré, un libellé trop
           long débordait sur la colonne voisine */
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.4);
        var textes = cols.map(function (c) { return doc.splitTextToSize(c.t, c.w - 3); });
        var nLignes = Math.max.apply(null, textes.map(function (l) { return l.length; }));
        var h = 2.2 + nLignes * 3.2;
        doc.setFillColor(241, 243, 246);
        doc.setDrawColor(195);
        doc.setLineWidth(0.2);
        doc.rect(MG, y, LARG, h, 'FD');
        doc.setTextColor(55);
        var xx = MG;
        cols.forEach(function (c, i) {
          if (i) doc.line(xx, y, xx, y + h);
          textes[i].forEach(function (lg, k) {
            doc.text(lg, xx + 1.6, y + 2.2 + k * 3.2);
          });
          xx += c.w;
        });
        y += h;
      }

      if (y + 6 > bas()) saut();
      entete();

      rangees.forEach(function (r) {
        var h = Math.max.apply(null, r.map(function (cell, i) {
          return hauteurBlocs(cell.blocs, cols[i].w);
        }));
        if (y + h > bas()) { saut(); entete(); }
        var xx = MG;
        doc.setDrawColor(195);
        doc.setLineWidth(0.2);
        r.forEach(function (cell, i) {
          doc.rect(xx, y, cols[i].w, h);
          dessinerBlocs(cell.blocs, xx, y, cols[i].w);
          xx += cols[i].w;
        });
        y += h;
      });
      y += 3.5;
    }

    /* Complète les lignes d'un tableau jusqu'à MIN_LIGNES : la feuille
       imprimée doit rester remplissable au stylo. */
    function completer(rangees, gabaritVide) {
      var out = rangees.slice();
      while (out.length < MIN_LIGNES) out.push(gabaritVide());
      return out;
    }

    /* --- en-tête de la fiche ---------------------------------------------- */
    function enteteFeuille() {
      var t = G.TYPES_FICHE[f.type];
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(20);
      doc.text(t.nom, MG, y + 6);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.8);
      doc.setTextColor(125);
      doc.text(t.aide, MG, y + 10.6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(30);
      doc.text('n° ' + (f.numero || '—'), A4.l - MG, y + 6, { align: 'right' });
      y += 14;
      doc.setDrawColor(35);
      doc.setLineWidth(0.5);
      doc.line(MG, y, MG + LARG, y);
      y += 4;

      var wL = 38;
      var champs = [
        ['Projet', f.projet],
        [f.type === 'rex' ? 'Période / étape couverte' : 'Période couverte', f.periode],
        [f.type === 'rex' ? 'Date' : 'Rendez-vous du', f.date ? U.fmtDayMonthYear(f.date) : ''],
        ['Rédigée par', f.auteur]
      ];
      champs.forEach(function (c) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.4);
        doc.setTextColor(45);
        doc.text(c[0], MG, y + 4);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(20);
        doc.text(String(c[1] || ''), MG + wL, y + 4);
        doc.setDrawColor(200);
        doc.setLineWidth(0.2);
        doc.line(MG + wL, y + 5, MG + LARG, y + 5);
        y += 7;
      });
      y += 1;
    }

    /* --- avis général ----------------------------------------------------- */
    function blocAvis(titre) {
      h2(titre);
      var x = MG;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      AVIS.forEach(function (a) {
        if (x + 5 + doc.getTextWidth(a[1]) + 6 > MG + LARG) { x = MG; y += 5.4; }
        carre(x, y - 0.6, 3.4, f.avis.accord === a[0]);
        doc.setTextColor(20);
        doc.text(a[1], x + 5, y + 2.2);
        x += 5 + doc.getTextWidth(a[1]) + 7;
      });
      y += 6.4;

      carre(MG, y - 0.6, 3.4, f.avis.vu);
      doc.setFontSize(8.2);
      doc.setTextColor(20);
      doc.text('Le tuteur a pris connaissance de la fiche et des preuves', MG + 5, y + 2.2);
      y += 8;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.2);
      doc.text('Remarques générales :', MG, y + 2.2);
      y += 4.4;
      if (f.avis.remarque) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        doc.setTextColor(30);
        doc.splitTextToSize(f.avis.remarque, LARG).forEach(function (lg) {
          if (y + 4 > bas()) saut();
          doc.text(lg, MG, y + 2.4);
          y += 3.6;
        });
      } else {
        for (var i = 0; i < 3; i++) {
          doc.setDrawColor(205);
          doc.setLineWidth(0.2);
          doc.line(MG, y + 4, MG + LARG, y + 4);
          y += 5.6;
        }
      }
      y += 3;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(20);
      var droit = 'Tuteur : ' + (f.avis.nom || '') + '        Date : ' +
        (f.avis.date ? U.fmtDayMonthYear(f.avis.date) : '');
      doc.text(droit, MG, y + 2.2);
      doc.setDrawColor(170);
      doc.setLineWidth(0.2);
      doc.line(MG, y + 4.4, MG + LARG, y + 4.4);
      y += 8;
    }

    /* --------------------------------------------------- fiche de suivi -- */
    var COLS_FAIT = [
      { t: 'Tâche', w: 56 }, { t: 'Jalon', w: 14 }, { t: 'État', w: 38 },
      { t: 'Preuve / livrable', w: 68 }, { t: 'Vu', w: 10 }
    ];

    function rangeesFait() {
      return completer(f.fait.map(function (l) {
        return [
          { blocs: [{ txt: l.texte, taille: 8 }] },
          { blocs: [{ txt: l.jalon, taille: 7.8 }] },
          { blocs: [{ type: 'cases', inline: true, items: [
            { txt: 'terminé', coche: l.etat === 'termine' },
            { txt: 'en cours', coche: l.etat === 'encours' },
            { txt: 'reporté', coche: l.etat === 'reporte' }
          ] }] },
          { blocs: [{ txt: l.preuve, taille: 7.6, gris: true }] },
          { blocs: [{ type: 'cases', items: [{ txt: '', coche: !!l.vu }] }] }
        ];
      }), function () {
        return [
          { blocs: [{ txt: '' }] }, { blocs: [{ txt: '' }] },
          { blocs: [{ type: 'cases', inline: true, items: [
            { txt: 'terminé', coche: false }, { txt: 'en cours', coche: false },
            { txt: 'reporté', coche: false }] }] },
          { blocs: [{ txt: '' }] },
          { blocs: [{ type: 'cases', items: [{ txt: '', coche: false }] }] }
        ];
      });
    }

    var COLS_IDEES = [
      { t: '#', w: 8 }, { t: 'Proposition', w: 96 }, { t: 'Avis du tuteur', w: 82 }
    ];

    function rangeesIdees() {
      return completer(f.idees.map(function (l, i) {
        return [
          { blocs: [{ txt: String(i + 1), taille: 8 }] },
          { blocs: [
            { txt: l.texte || '', taille: 8, gras: false },
            { txt: l.pourquoi ? 'pourquoi : ' + l.pourquoi : '', taille: 7.2, gris: true },
            { type: 'cases', items: [{ txt: 'je garde cette idée', coche: l.retenu }] }
          ] },
          { blocs: [
            { type: 'cases', items: AVIS.map(function (a) {
              return { txt: a[1], coche: l.avis === a[0] };
            }) },
            { txt: l.remarque ? 'Remarque : ' + l.remarque : '', taille: 7.2, gris: true }
          ] }
        ];
      }), function () {
        return [
          { blocs: [{ txt: '' }] },
          { blocs: [{ txt: '' }, { type: 'cases', items: [{ txt: 'je garde cette idée', coche: false }] }] },
          { blocs: [{ type: 'cases', items: AVIS.map(function (a) {
            return { txt: a[1], coche: false };
          }) }] }
        ];
      });
    }

    var COLS_DEMANDES = [
      { t: '#', w: 8 }, { t: 'Ce que le tuteur demande', w: 118 },
      { t: 'Pour le', w: 30 }, { t: 'Fait', w: 30 }
    ];

    function rangeesDemandes() {
      return completer(f.demandes.map(function (l, i) {
        return [
          { blocs: [{ txt: String(i + 1), taille: 8 }] },
          { blocs: [{ txt: l.texte || '', taille: 8 }] },
          { blocs: [{ txt: l.echeance || '', taille: 7.8 }] },
          { blocs: [{ type: 'cases', items: [{ txt: '', coche: l.fait }] }] }
        ];
      }), function () {
        return [
          { blocs: [{ txt: '' }] }, { blocs: [{ txt: '' }] },
          { blocs: [{ txt: '' }] },
          { blocs: [{ type: 'cases', items: [{ txt: '', coche: false }] }] }
        ];
      });
    }

    var COLS_REX = [
      { t: '#', w: 7 }, { t: 'Fait observé, mesuré', w: 50 },
      { t: 'Effet', w: 24 }, { t: 'Cause identifiée', w: 41 },
      { t: 'Ce que je change / garde', w: 54 }, { t: 'Validé', w: 10 }
    ];

    function rangeesRex() {
      return completer(f.rex.map(function (l, i) {
        return [
          { blocs: [{ txt: String(i + 1), taille: 8 }] },
          { blocs: [{ txt: l.fait || '', taille: 7.8 }] },
          { blocs: [{ type: 'cases', inline: true, items: [
            { txt: 'positif', coche: l.effet === 'positif' },
            { txt: 'négatif', coche: l.effet === 'negatif' }
          ] }] },
          { blocs: [{ txt: l.cause || '', taille: 7.8 }] },
          { blocs: [{ txt: l.change || '', taille: 7.8 }] },
          { blocs: [{ type: 'cases', items: [{ txt: '', coche: l.valide }] }] }
        ];
      }), function () {
        return [
          { blocs: [{ txt: '' }] }, { blocs: [{ txt: '' }] },
          { blocs: [{ type: 'cases', items: [
            { txt: 'positif', coche: false }, { txt: 'négatif', coche: false }] }] },
          { blocs: [{ txt: '' }] }, { blocs: [{ txt: '' }] },
          { blocs: [{ type: 'cases', items: [{ txt: '', coche: false }] }] }
        ];
      });
    }

    /* ------------------------------------------------------------- dessin -- */
    enteteFeuille();

    if (f.type === 'rex') {
      h2('1. Fiches de retour d\'expérience');
      aide('Chaque ligne part d\'un fait observé et mesuré, jamais d\'une impression. ' +
           'Une cause inconnue s\'écrit « cause inconnue » : on ne l\'invente pas.');
      tableau(COLS_REX, rangeesRex());
      blocAvis('2. Avis du tuteur');
    } else {
      h2('1. Ce que j\'ai fait depuis la dernière fiche');
      aide('Une ligne par tâche. « Preuve » = le fichier, la mesure ou la capture qui montre ' +
           'que c\'est fait. La colonne « vu » est celle du tuteur.');
      tableau(COLS_FAIT, rangeesFait());

      h2('2. Ce que je propose — à valider par le tuteur');
      aide('Chaque proposition est écrite pour pouvoir être refusée telle quelle : ce que je ' +
           'propose, pourquoi, ce que j\'écarte. « je garde cette idée » est ma case, les trois ' +
           'autres sont celles du tuteur.');
      tableau(COLS_IDEES, rangeesIdees());

      h2('3. Ce que le tuteur demande');
      aide('À remplir pendant le rendez-vous : les lignes vides servent à écrire ce qu\'il ajoute.');
      tableau(COLS_DEMANDES, rangeesDemandes());

      blocAvis('4. Avis général et visa du tuteur');
    }

    /* ----------------------------------------------------- pied de page -- */
    var pages = doc.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setDrawColor(225);
      doc.setLineWidth(0.2);
      doc.line(MG, A4.h - 12, MG + LARG, A4.h - 12);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(135);
      doc.text((f.projet || 'Suivi de projet') + ' — ' + G.TYPES_FICHE[f.type].nom, MG, A4.h - 8);
      doc.text('page ' + p + ' / ' + pages, A4.l - MG, A4.h - 8, { align: 'right' });
    }

    doc.save(P.nomFichier(f));
    G.view.toast('PDF écrit : ' + P.nomFichier(f), 'ok', 4200);
    return doc;
  };

  P.telecharger = function (f) {
    if (!P.dispo()) {
      G.view.toast('jsPDF absent (dossier vendor/) — le bouton « Imprimer » produit le même PDF', 'warn', 5200);
      return;
    }
    try {
      P.construire(f);
    } catch (e) {
      /* une largeur de colonne fausse est une erreur de programmation : on la
         dit, plutôt que d'écrire un PDF de travers */
      G.view.toast('PDF non écrit — ' + e.message, 'warn', 6000);
    }
  };

})();
