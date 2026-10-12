/* ==========================================================================
   pdf-fiche.js — la fiche en PDF *remplissable*

   Le PDF n'est pas une image de la fiche : c'est un formulaire AcroForm. Le
   tuteur l'ouvre dans un lecteur PDF (Acrobat, Firefox, Okular, Aperçu), coche
   les états, écrit dans les cases, ajoute ce qu'il veut, enregistre. Il n'a
   besoin ni de l'outil ni d'un réseau, et le fichier reste un PDF.

   Écrit avec pdf-lib 1.17.1 (MIT, embarqué dans vendor/). Trois conséquences
   tirées de la norme, pas de l'humeur du jour :

   - les cases et les choix exclusifs sont des *champs*, pas des caractères :
     les 14 polices standard d'un PDF ne savent écrire ni ☐ ni ✓.
   - aucun champ ne dépend d'un script : un lecteur PDF n'exécute pas de
     JavaScript ici, et Confluence le retire à l'upload.
   - les valeurs déjà saisies dans l'outil sont *dans* les champs, donc
     modifiables, et chaque tableau garde des lignes vides à écrire à la main.
   ========================================================================== */
(function () {
  'use strict';

  var G = window.Gantt, U = G.util;
  var P = G.pdfFiche = {};

  var A4 = { l: 595.28, h: 841.89 };                  /* A4 en points */
  var MM = 2.834645;
  var MG = 12 * MM;                                   /* marge gauche et droite */
  var HAUT = 14 * MM;
  var BAS = 18 * MM;
  var LARG = A4.l - 2 * MG;
  var MIN_LIGNES = 3;                                 /* lignes vides par tableau */

  var NOIR = [0.08, 0.09, 0.10];
  var GRIS = [0.48, 0.50, 0.53];
  var TRAIT = [0.76, 0.78, 0.82];

  var AVIS = [['ok', "d'accord"], ['reserves', "d'accord avec réserves"], ['non', "pas d'accord"]];
  var ETATS = [['termine', 'terminé'], ['encours', 'en cours'], ['reporte', 'reporté']];
  var EFFETS = [['positif', 'positif'], ['negatif', 'négatif']];

  P.dispo = function () { return !!(window.PDFLib && window.PDFLib.PDFDocument); };

  /* Le nom du fichier dit ce qu'il contient et de quel projet il vient, pour
     qu'un PDF retrouvé dans un dossier ou sur Confluence se reconnaisse. */
  P.nomFichier = function (f) {
    return 'suivi_projet_' + U.slug(f.projet || G.TYPES_FICHE[f.type].nom) +
      '_fiche-' + f.type + (f.numero ? '-' + U.slug(f.numero) : '') +
      '_' + f.date + '.pdf';
  };

  /* ======================================================================= */
  P.construire = async function (f) {
    if (!P.dispo()) throw new Error('pdf-lib absent (dossier vendor/)');

    var L = window.PDFLib;
    var doc = await L.PDFDocument.create();
    var helv = await doc.embedFont(L.StandardFonts.Helvetica);
    var helvB = await doc.embedFont(L.StandardFonts.HelveticaBold);
    var helvO = await doc.embedFont(L.StandardFonts.HelveticaOblique);
    var form = doc.getForm();

    doc.setTitle(G.TYPES_FICHE[f.type].nom + (f.numero ? ' n° ' + f.numero : '') +
      ' — ' + (f.projet || ''));
    doc.setSubject('Suivi de projet — fiche à remplir par le tuteur');
    doc.setCreator('Gantt — planificateur local (pdf-lib)');
    doc.setKeywords(['suivi de projet', 'tuteur', 'fiche', f.type]);

    var page = doc.addPage([A4.l, A4.h]);
    var y = HAUT;                                     /* curseur depuis le haut */
    var bas = A4.h - BAS;
    var noms = {};                                    /* garde-fou d'unicité */

    var rgb = function (c) { return L.rgb(c[0], c[1], c[2]); };
    var Y = function (haut) { return A4.h - haut; };  /* le repère d'un PDF part du bas */

    function texte(s, x, haut, o) {
      o = o || {};
      if (s === undefined || s === null || s === '') return;
      page.drawText(String(s), {
        x: x, y: Y(haut), size: o.taille || 8,
        font: o.gras ? helvB : (o.italique ? helvO : helv),
        color: rgb(o.gris ? (o.gris === true ? GRIS : o.gris) : NOIR)
      });
    }

    function regle(x1, haut, x2, c, ep) {
      page.drawLine({ start: { x: x1, y: Y(haut) }, end: { x: x2, y: Y(haut) },
        thickness: ep || 0.4, color: rgb(c || TRAIT) });
    }

    /* Découpe un texte en lignes qui tiennent dans `largeur`, en respectant les
       retours à la ligne de l'auteur : une ligne vide reste une ligne vide. */
    function couper(s, largeur, gras, taille) {
      var police = gras ? helvB : helv;
      var out = [];
      String(s == null ? '' : s).split(/\r?\n/).forEach(function (para) {
        var mots = para.split(/\s+/);
        if (mots.length === 1 && !mots[0]) { out.push(''); return; }
        var ligne = '';
        for (var i = 0; i < mots.length; i++) {
          var essai = ligne ? ligne + ' ' + mots[i] : mots[i];
          if (!ligne || police.widthOfTextAtSize(essai, taille) <= largeur) ligne = essai;
          else { out.push(ligne); ligne = mots[i]; }
        }
        if (ligne) out.push(ligne);
      });
      return out.length ? out : [''];
    }

    function hauteurTexte(s, largeur, gras, taille) {
      return couper(s, largeur, gras, taille).length * taille * 1.30;
    }

    function nouveauPage() { page = doc.addPage([A4.l, A4.h]); y = HAUT; }

    function nom(cle) {
      if (noms[cle]) throw new Error('champ « ' + cle + ' » créé deux fois');
      noms[cle] = true;
      return cle;
    }

    /* ------------------------------------------------------- les trois champs */
    /* Attention : dans pdf-lib, `y` est le coin BAS du rectangle du champ —
       passer Y(haut) place la case au-dessus de son libellé. D'où les - h. */
    function champTexte(cle, valeur, x, haut, w, h, o) {
      o = o || {};
      var t = form.createTextField(nom(cle));
      if (valeur) t.setText(String(valeur));
      if (o.multiligne) t.enableMultiline();
      t.addToPage(page, {
        x: x, y: Y(haut) - h, width: w, height: h,
        font: helv, size: o.taille || 8, textColor: rgb(NOIR),
        backgroundColor: rgb([0.98, 0.98, 0.99]),
        borderColor: rgb(TRAIT), borderWidth: 0.4
      });
      /* Après addToPage seulement : avant, le champ n'a pas encore de /DA, et
         sans taille fixe le lecteur étire le texte pour remplir le cadre
         (mesuré : des remarques écrites en 30 pt dans un cadre de 96 pt). */
      if (o.multiligne) t.setFontSize(o.taille || 8);
      return t;
    }

    function champCase(cle, coche, x, haut, cote) {
      cote = cote || 9;
      var cb = form.createCheckBox(nom(cle));
      cb.addToPage(page, {
        x: x, y: Y(haut) - cote, width: cote, height: cote,
        borderWidth: 0.65, borderColor: rgb([0.45, 0.47, 0.50]),
        backgroundColor: rgb([1, 1, 1])
      });
      if (coche) cb.check();
      return cb;
    }

    /* Choix exclusif : un seul état, et on peut en changer — c'est un groupe de
       boutons radio, pas des cases indépendantes. */
    function champChoix(cle, options, choisi, x0, haut, places) {
      var rg = form.createRadioGroup(nom(cle));
      options.forEach(function (opt, i) {
        var p = places[i];
        rg.addOptionToPage(opt[0], page, {
          x: x0 + p.x, y: Y(haut + p.ligne * 12.4) - 9, width: 9, height: 9,
          borderWidth: 0.65, borderColor: rgb([0.45, 0.47, 0.50]),
          backgroundColor: rgb([1, 1, 1])
        });
      });
      if (choisi) rg.select(choisi);
      return rg;
    }

    /* Place les cases d'une cellule : côte à côte, et on replie si la colonne
       est trop étroite. Une seule fois, pour la mesure comme pour le dessin.
       `taille` doit être celle du libellé réellement écrit, sinon la place
       réservée est trop courte et les colonnes se chevauchent. */
    function placesCases(b, w, taille) {
      taille = taille || b.tailleLibelle || 7.6;
      var dispo = w - 10, places = [], av = 0, ligne = 0;
      b.cases.forEach(function (it) {
        var wc = 12 + helv.widthOfTextAtSize(it.txt || '', taille) + 9;
        if (!b.inline) { places.push({ it: it, x: 0, ligne: ligne }); ligne++; return; }
        if (av > 0 && av + wc > dispo) { av = 0; ligne++; }
        places.push({ it: it, x: av, ligne: ligne });
        av += wc;
      });
      return { places: places, lignes: ligne + 1 };
    }

    /* ------------------------------------------------------- sections, titres */
    function h2(t) {
      /* un titre ne part pas seul en bas de page : on veut le titre, l'en-tête
         du tableau et au moins deux lignes ensemble */
      if (y + 45 * MM > bas) nouveauPage();
      y += 8;
      texte(t, MG, y + 3.5, { taille: 9.6, gras: true });
      y += 5.5;
      regle(MG, y, MG + LARG, [0.80, 0.82, 0.85]);
      y += 3;
    }

    function aide2(t) {
      couper(t, LARG, false, 7.4).forEach(function (lg) {
        if (y + 10 > bas) nouveauPage();
        texte(lg, MG, y + 2.6, { taille: 7.4, italique: true, gris: true });
        y += 9.6;
      });
      y += 2;
    }

    /* Hauteur d'un champ dans une cellule : une seule formule, pour la mesure
       comme pour le dessin — sinon le champ déborde de sa ligne. */
    function hauteurChamp(c, w) {
      var taille = c.taille || 8;
      if (!c.multiligne) {
        return c.valeur ? hauteurTexte(c.valeur, w - 10, false, taille) : 12.4;
      }
      /* une ligne de marge : le lecteur replie parfois un mot de plus */
      return (couper(c.valeur || '', w - 10, false, taille).length + 0.75) * 10.6 + 6;
    }

    /* ----------------------------------------------- hauteur / dessin cellule */
    function hauteurBlocs(blocs, w) {
      var h = 5.6;
      blocs.forEach(function (b) {
        if (b.cases) { h += placesCases(b, w).lignes * 12.4; return; }
        if (b.champ) { h += hauteurChamp(b.champ, w) + 1.6; return; }
        h += hauteurTexte(b.txt, w - 10, false, b.taille || 8) + 2;
      });
      return Math.max(h, 20);
    }

    function dessinerBlocs(blocs, x, hautCell, w, prefixe) {
      var yy = hautCell + 3;
      blocs.forEach(function (b) {
        if (b.cases) {
          var pl = placesCases(b, w);
          var x0 = x + 4;
          if (b.type === 'choix') {
            champChoix(prefixe + '_' + b.choixCle,
              b.cases.map(function (c) { return [c.valeur, c.txt]; }),
              b.choisi, x0, yy, pl.places);
          }
          pl.places.forEach(function (p, i) {
            var haut = yy + p.ligne * 12.4;
            if (b.type !== 'choix') {
              var cle = (b.cases.length === 1 && b.cle)
                ? prefixe + '_' + b.cle
                : prefixe + '_' + (b.cle || 'case') + '_' + p.it.valeur;
              champCase(cle, !!p.it.coche, x0 + p.x, haut + 1.4, 9);
            }
            texte(p.it.txt, x0 + p.x + 12, haut + 10, { taille: 7.6, gris: [0.28, 0.30, 0.33] });
          });
          yy += pl.lignes * 12.4 + 1;
          return;
        }
        if (b.champ) {
          var c = b.champ, h = hauteurChamp(c, w);
          champTexte(prefixe + '_' + c.cle, c.valeur, x + 4, yy, w - 8, h + 1,
            { multiligne: c.multiligne, taille: c.taille || 8 });
          yy += h + 3;
          return;
        }
        if (b.champCases) {
          var pl2 = placesCases({ cases: b.champCases, inline: b.inline }, w);
          var x2 = x + 4;
          b.champCases.forEach(function (it, i) {
            var p = pl2.places[i], haut = yy + p.ligne * 12.4;
            champCase(prefixe + '_' + b.prefixeCases + '_' + i, !!it.coche, x2 + p.x, haut + 1.4, 9);
            texte(it.txt, x2 + p.x + 12, haut + 10, { taille: 7.6, gris: [0.28, 0.30, 0.33] });
          });
          yy += pl2.lignes * 12.4 + 1;
          return;
        }
        couper(b.txt, w - 10, false, b.taille || 8).forEach(function (lg) {
          texte(lg, x + 4, yy + 8.8, { taille: b.taille || 8, gris: b.gris, gras: b.gras });
          yy += (b.taille || 8) * 1.30;
        });
        yy += 2;
      });
    }

    /* --------------------------------------------------------------- tableau */
    function tableau(cols, rangees, prefixe) {
      var total = cols.reduce(function (a, c) { return a + c.w; }, 0);
      if (Math.abs(total - LARG) > 1.5) {
        throw new Error('largeurs de colonnes = ' + total.toFixed(1) +
          ' pt au lieu de ' + LARG.toFixed(1));
      }

      function entete() {
        var textes = cols.map(function (c) { return couper(c.t, c.w - 8, true, 7.4); });
        var n = Math.max.apply(null, textes.map(function (l) { return l.length; }));
        var h = 7 + n * 9.6;
        page.drawRectangle({ x: MG, y: Y(y + h), width: LARG, height: h,
          color: rgb([0.949, 0.953, 0.965]),
          borderColor: rgb(TRAIT), borderWidth: 0.4 });
        var xx = MG;
        cols.forEach(function (c, i) {
          if (i) page.drawLine({ start: { x: xx, y: Y(y) }, end: { x: xx, y: Y(y + h) },
            thickness: 0.4, color: rgb(TRAIT) });
          textes[i].forEach(function (lg, k) {
            texte(lg, xx + 4, y + 9.6 + k * 9.6, { taille: 7.4, gras: true, gris: [0.26, 0.28, 0.31] });
          });
          xx += c.w;
        });
        y += h;
      }

      if (y + 20 > bas) nouveauPage();
      entete();

      rangees.forEach(function (r, ir) {
        var h = Math.max.apply(null, r.map(function (cell, i) {
          return hauteurBlocs(cell.blocs, cols[i].w);
        }));
        if (y + h > bas) { nouveauPage(); entete(); }
        var xx = MG;
        r.forEach(function (cell, i) {
          page.drawRectangle({ x: xx, y: Y(y + h), width: cols[i].w, height: h,
            borderColor: rgb(TRAIT), borderWidth: 0.4 });
          dessinerBlocs(cell.blocs, xx, y, cols[i].w, prefixe + '_l' + ir + '_c' + i);
          xx += cols[i].w;
        });
        y += h;
      });
      y += 9;
    }

    /* --------------------------------------------------------------- en-tête */
    function enteteFeuille() {
      var t = G.TYPES_FICHE[f.type];
      texte(t.nom, MG, y + 17, { taille: 16, gras: true });
      texte(t.aide, MG, y + 25, { taille: 7.8, italique: true, gris: true });
      texte('n° ' + (f.numero || '—'), A4.l - MG - 60, y + 17, { taille: 9, gras: true });
      y += 33;
      regle(MG, y, MG + LARG, NOIR, 1.1);
      y += 10;

      var wL = 38 * MM;
      [
        ['projet', 'Projet', f.projet],
        ['periode', f.type === 'rex' ? 'Période / étape couverte' : 'Période couverte', f.periode],
        ['date', f.type === 'rex' ? 'Date' : 'Rendez-vous du',
          f.date ? U.fmtDayMonthYear(f.date) : ''],
        ['auteur', 'Rédigée par', f.auteur]
      ].forEach(function (c) {
        texte(c[1], MG, y + 10, { taille: 8.4, gras: true, gris: [0.24, 0.26, 0.29] });
        champTexte(c[0], c[2], MG + wL, y, LARG - wL, 13, { taille: 8.4 });
        y += 18;
      });
      y += 3;
    }

    /* ------------------------------------------------------------ avis, visa */
    function blocAvis(titre2) {
      h2(titre2);

      var pl = placesCases({ cases: AVIS.map(function (a) {
        return { valeur: a[0], txt: a[1] };
      }), inline: true }, LARG - 8, 8);
      champChoix('avis_accord', AVIS, f.avis.accord, MG + 4, y, pl.places);
      pl.places.forEach(function (p) {
        texte(p.it.txt, MG + 4 + p.x + 12, y + p.ligne * 12.4 + 8.5, { taille: 8 });
      });
      y += pl.lignes * 12.4 + 4;

      champCase('avis_vu', f.avis.vu, MG, y + 1.4, 10);
      texte('Le tuteur a pris connaissance de la fiche et des preuves', MG + 14, y + 10, { taille: 8 });
      y += 20;

      texte('Remarques générales, et ce qu\'il demande en plus :', MG, y + 8, { taille: 8, gras: true });
      y += 11;
      /* le cadre grandit avec les remarques : un compte rendu long ne doit pas
         être rogné dans un carré trop petit */
      var lignesRem = couper(f.avis.remarque || '', LARG - 10, false, 8).length;
      var hTxt = Math.max(96, (lignesRem + 1.5) * 10.6 + 8);
      if (y + hTxt + 34 > bas) nouveauPage();
      champTexte('avis_remarque', f.avis.remarque, MG, y, LARG, hTxt, { multiligne: true, taille: 8 });
      y += hTxt + 8;

      texte('Tuteur :', MG, y + 10, { taille: 8.4 });
      champTexte('tuteur_nom', f.avis.nom, MG + 42, y, 90, 13, { taille: 8.4 });
      texte('Date :', MG + 160, y + 10, { taille: 8.4 });
      champTexte('tuteur_date', f.avis.date ? U.fmtDayMonthYear(f.avis.date) : '',
        MG + 192, y, 90, 13, { taille: 8.4 });
      y += 22;
    }

    /* -------------------------------------------------------- fiche de suivi */
    var COLS_FAIT = [
      { t: 'Tâche', w: 165 }, { t: 'Jalon', w: 42 }, { t: 'État', w: 110 },
      { t: 'Preuve / livrable', w: 186 }, { t: 'Vu', w: 24.3 }
    ];

    function rangeeFaitVide() {
      return [
        { blocs: [{ champ: { cle: 'texte', valeur: '', multiligne: true } }] },
        { blocs: [{ champ: { cle: 'jalon', valeur: '', taille: 7.8 } }] },
        { blocs: [{ cases: ETATS.map(function (e) {
          return { valeur: e[0], txt: e[1] }; }), type: 'choix', choixCle: 'etat', choisi: '', inline: true }] },
        { blocs: [{ champ: { cle: 'preuve', valeur: '', taille: 7.6, multiligne: true } }] },
        { blocs: [{ cases: [{ valeur: 'vu', txt: '' }], cle: 'vu' }] }
      ];
    }

    function rangeesFait() {
      var out = f.fait.map(function (l) {
        return [
          { blocs: [{ champ: { cle: 'texte', valeur: l.texte, multiligne: true } }] },
          { blocs: [{ champ: { cle: 'jalon', valeur: l.jalon, taille: 7.8 } }] },
          { blocs: [{ cases: ETATS.map(function (e) {
            return { valeur: e[0], txt: e[1] }; }), type: 'choix', choixCle: 'etat',
            choisi: l.etat, inline: true }] },
          { blocs: [{ champ: { cle: 'preuve', valeur: l.preuve, taille: 7.6, multiligne: true } }] },
          { blocs: [{ cases: [{ valeur: 'vu', txt: '', coche: !!l.vu }], cle: 'vu' }] }
        ];
      });
      while (out.length < MIN_LIGNES) out.push(rangeeFaitVide());
      return out;
    }

    var COLS_IDEES = [{ t: '#', w: 22 }, { t: 'Proposition', w: 310 },
      { t: 'Avis du tuteur', w: 195.3 }];

    function rangeeIdeeVide(numero) {
      return [
        { blocs: [{ txt: String(numero) }] },
        { blocs: [
          { champ: { cle: 'texte', valeur: '', multiligne: true } },
          { champ: { cle: 'pourquoi', valeur: '', taille: 7.4, multiligne: true } },
          { txt: '', taille: 7, gris: true },
          { cases: [{ valeur: 'retenu', txt: 'je garde cette idée' }], cle: 'retenu' }
        ] },
        { blocs: [
          { cases: AVIS.map(function (a) { return { valeur: a[0], txt: a[1] }; }),
            type: 'choix', choixCle: 'avis', choisi: '' },
          { champ: { cle: 'remarque', valeur: '', taille: 7.4, multiligne: true } }
        ] }
      ];
    }

    function rangeesIdees() {
      var out = f.idees.map(function (l, i) {
        return [
          { blocs: [{ txt: String(i + 1) }] },
          { blocs: [
            { champ: { cle: 'texte', valeur: l.texte, multiligne: true } },
            { champ: { cle: 'pourquoi', valeur: l.pourquoi, taille: 7.4, multiligne: true } },
            /* le jalon visé, écrit tel qu'il est dans le Gantt au moment du PDF */
            { txt: l.jalon ? 'Jalon : ' + G.libelleJalon(l.jalon) : '', taille: 7, gris: true },
            { cases: [{ valeur: 'retenu', txt: 'je garde cette idée', coche: !!l.retenu }], cle: 'retenu' }
          ] },
          { blocs: [
            { cases: AVIS.map(function (a) { return { valeur: a[0], txt: a[1] }; }),
              type: 'choix', choixCle: 'avis', choisi: l.avis },
            { champ: { cle: 'remarque', valeur: l.remarque, taille: 7.4, multiligne: true } }
          ] }
        ];
      });
      while (out.length < MIN_LIGNES) out.push(rangeeIdeeVide(out.length + 1));
      return out;
    }

    var COLS_DEMANDES = [{ t: '#', w: 22 }, { t: 'Ce que le tuteur demande', w: 392 },
      { t: 'Pour le', w: 80 }, { t: 'Fait', w: 33.3 }];

    function rangeeDemandeVide(numero) {
      return [
        { blocs: [{ txt: String(numero) }] },
        { blocs: [{ champ: { cle: 'texte', valeur: '', multiligne: true } },
                  { txt: '', taille: 7, gris: true }] },
        { blocs: [{ champ: { cle: 'echeance', valeur: '', taille: 7.8 } }] },
        { blocs: [{ cases: [{ valeur: 'fait', txt: '' }], cle: 'fait' }] }
      ];
    }

    function rangeesDemandes() {
      var out = f.demandes.map(function (l, i) {
        return [
          { blocs: [{ txt: String(i + 1) }] },
          { blocs: [
            { champ: { cle: 'texte', valeur: l.texte, multiligne: true } },
            { txt: l.jalon ? 'Jalon : ' + G.libelleJalon(l.jalon) : '', taille: 7, gris: true }
          ] },
          { blocs: [{ champ: { cle: 'echeance', valeur: l.echeance, taille: 7.8 } }] },
          { blocs: [{ cases: [{ valeur: 'fait', txt: '', coche: !!l.fait }], cle: 'fait' }] }
        ];
      });
      while (out.length < MIN_LIGNES) out.push(rangeeDemandeVide(out.length + 1));
      return out;
    }

    var COLS_REX = [{ t: '#', w: 18 }, { t: 'Fait observé, mesuré', w: 132 },
      { t: 'Effet', w: 66 }, { t: 'Cause identifiée', w: 118 },
      { t: 'Ce que je change / garde', w: 162 }, { t: 'Validé', w: 31.3 }];

    function rangeeRexVide(numero) {
      return [
        { blocs: [{ txt: String(numero) }] },
        { blocs: [{ champ: { cle: 'fait', valeur: '', taille: 7.8, multiligne: true } }] },
        { blocs: [{ cases: EFFETS.map(function (e) {
          return { valeur: e[0], txt: e[1] }; }), type: 'choix', choixCle: 'effet',
          choisi: '', inline: true }] },
        { blocs: [{ champ: { cle: 'cause', valeur: '', taille: 7.8, multiligne: true } }] },
        { blocs: [{ champ: { cle: 'change', valeur: '', taille: 7.8, multiligne: true } }] },
        { blocs: [{ cases: [{ valeur: 'valide', txt: '' }], cle: 'valide' }] }
      ];
    }

    function rangeesRex() {
      var out = f.rex.map(function (l, i) {
        return [
          { blocs: [{ txt: String(i + 1) }] },
          { blocs: [{ champ: { cle: 'fait', valeur: l.fait, taille: 7.8, multiligne: true } }] },
          { blocs: [{ cases: EFFETS.map(function (e) {
            return { valeur: e[0], txt: e[1] }; }), type: 'choix', choixCle: 'effet',
            choisi: l.effet, inline: true }] },
          { blocs: [{ champ: { cle: 'cause', valeur: l.cause, taille: 7.8, multiligne: true } }] },
          { blocs: [{ champ: { cle: 'change', valeur: l.change, taille: 7.8, multiligne: true } }] },
          { blocs: [{ cases: [{ valeur: 'valide', txt: '', coche: !!l.valide }], cle: 'valide' }] }
        ];
      });
      while (out.length < MIN_LIGNES) out.push(rangeeRexVide(out.length + 1));
      return out;
    }

    /* ------------------------------------------------------------ assemblage */
    enteteFeuille();

    if (f.type === 'rex') {
      h2('1. Fiches de retour d\'expérience');
      aide2('Chaque ligne part d\'un fait observé et mesuré, jamais d\'une impression. ' +
            'Une cause inconnue s\'écrit « cause inconnue » : on ne l\'invente pas.');
      tableau(COLS_REX, rangeesRex(), 'rex');
      blocAvis('2. Avis du tuteur');
    } else {
      h2('1. Ce que j\'ai fait depuis la dernière fiche');
      aide2('Une ligne par tâche. « Preuve » = le fichier, la mesure ou la capture qui montre ' +
            'que c\'est fait. La colonne « vu » est celle du tuteur.');
      tableau(COLS_FAIT, rangeesFait(), 'fait');

      h2('2. Ce que je propose — à valider par le tuteur');
      aide2('Chaque proposition est écrite pour pouvoir être refusée telle quelle. « je garde ' +
            'cette idée » est ma case ; les trois autres sont celles du tuteur.');
      tableau(COLS_IDEES, rangeesIdees(), 'idee');

      h2('3. Ce que le tuteur demande');
      aide2('Lignes libres : le tuteur écrit ici ce qu\'il ajoute, et coche au fur et à mesure.');
      tableau(COLS_DEMANDES, rangeesDemandes(), 'demande');

      blocAvis('4. Avis général et visa du tuteur');
    }

    /* ------------------------------------------------- pied de page, par page */
    var pages = doc.getPages();
    pages.forEach(function (p, i) {
      p.drawLine({ start: { x: MG, y: A4.h - 12 * MM }, end: { x: MG + LARG, y: A4.h - 12 * MM },
        thickness: 0.4, color: rgb([0.87, 0.88, 0.90]) });
      p.drawText((f.projet || 'Suivi de projet') + ' — ' + G.TYPES_FICHE[f.type].nom +
        ' — page ' + (i + 1) + ' / ' + pages.length,
        { x: MG, y: A4.h - 8 * MM, size: 7.2, font: helv, color: rgb(GRIS) });
      p.drawText('champs modifiables dans le lecteur PDF',
        { x: MG + LARG - 130, y: A4.h - 8 * MM, size: 7.2, font: helv, color: rgb(GRIS) });
    });

    /* Sans cette passe, un lecteur qui ne regénère pas les apparences affiche
       un champ vide à la place de sa valeur. */
    form.updateFieldAppearances(helv);

    return doc;
  };

  /* ======================================================================= */
  P.octets = async function (f) {
    var doc = await P.construire(f);
    return await doc.save();
  };

  P.telecharger = async function (f) {
    if (!P.dispo()) {
      G.view.toast('pdf-lib absent (dossier vendor/) — « Imprimer » produit le même PDF', 'warn', 5200);
      return;
    }
    try {
      var octets = await P.octets(f);
      var nomF = P.nomFichier(f);
      U.download(nomF, new Blob([octets], { type: 'application/pdf' }));
      G.view.toast('PDF à remplir écrit : ' + nomF + ' — le tuteur coche et écrit dedans', 'ok', 5200);
    } catch (e) {
      G.view.toast('PDF non écrit — ' + e.message, 'warn', 6000);
    }
  };

})();
