/* ==========================================================================
   vue-fiches.js — « Fiches & PDF »

   La vue tient un cahier de fiches (fiche de suivi, REX). Chaque fiche est une
   feuille A4 qu'on remplit à l'écran : mes idées dans une colonne, l'avis du
   tuteur dans une autre, ses demandes dans une troisième. La même feuille
   sort en PDF, par le bouton jsPDF ou par l'impression du navigateur.

   Deux cases ne veulent pas dire la même chose et ne sont jamais fusionnées :
   « je garde cette idée » est à moi, « d'accord / réserves / pas d'accord »
   est au tuteur.
   ========================================================================== */
(function () {
  'use strict';

  var G = window.Gantt, U = G.util, V = G.view;
  var F = G.fichesVue = {};

  var el = {};
  var courante = null;      // id de la fiche affichée

  F.cache = function () {
    el.root = document.getElementById('vue-fiches');
    el.items = document.getElementById('fiches-items');
    el.editeur = document.getElementById('fiches-editeur');
  };

  /* ============================================================ la liste == */
  function etiquette(f) {
    var n = f.numero ? 'n° ' + f.numero : (G.TYPES_FICHE[f.type].nom);
    return {
      titre: f.projet || 'Projet sans nom',
      sous: n + (f.periode ? ' · ' + f.periode : '') + ' · ' + U.fmtDayMonthYear(f.date)
    };
  }

  function rendreListe() {
    if (!G.state.fiches.length) {
      el.items.innerHTML = '<li class="vide">Aucune fiche. Les boutons ci-dessus en créent une.</li>';
      return;
    }
    el.items.innerHTML = G.state.fiches.map(function (f) {
      var e = etiquette(f);
      return '' +
        '<li class="fi' + (f.id === courante ? ' active' : '') + '" data-f="choisir" data-id="' + f.id + '">' +
          '<span class="fi-type ' + f.type + '">' + G.TYPES_FICHE[f.type].nom + '</span>' +
          '<span class="fi-titre">' + U.esc(e.titre) + '</span>' +
          '<span class="fi-sous">' + U.esc(e.sous) + '</span>' +
        '</li>';
    }).join('');
  }

  /* Garde la ligne de la liste à jour sans redessiner la feuille (sinon le
     curseur saute hors du champ en cours de frappe). */
  function majEtiquette(f) {
    var li = el.items.querySelector('.fi[data-id="' + f.id + '"]');
    if (!li) return;
    var e = etiquette(f);
    li.querySelector('.fi-titre').textContent = e.titre;
    li.querySelector('.fi-sous').textContent = e.sous;
  }

  /* =========================================================== la feuille == */
  function champ(chemin, valeur, o) {
    o = o || {};
    return '<input class="l' + (o.petit ? ' petit' : '') + (o.date ? ' date' : '') + '"' +
      ' data-ch="' + chemin + '"' +
      ' value="' + U.esc(valeur == null ? '' : valeur) + '"' +
      (o.placeholder ? ' placeholder="' + U.esc(o.placeholder) + '"' : '') +
      ' spellcheck="false">';
  }

  function caseA(chemin, coche, texte, type) {
    return '<label class="case"><input type="' + (type || 'checkbox') + '" data-ch="' + chemin + '"' +
      (coche ? ' checked' : '') + '><span>' + U.esc(texte) + '</span></label>';
  }

  function radioA(nom, chemin, valeur, courante2, texte) {
    return '<label class="case"><input type="radio" name="' + nom + '" data-ch="' + chemin + '"' +
      ' value="' + valeur + '"' + (courante2 === valeur ? ' checked' : '') + '><span>' +
      U.esc(texte) + '</span></label>';
  }

  var AVIS = [['ok', "d'accord"], ['reserves', 'd\'accord avec réserves'], ['non', 'pas d\'accord']];

  function blocAvis(f, nom) {
    return '<div class="fe-avis">' +
      '<div class="avis-ligne">' +
        AVIS.map(function (a) {
          return radioA(nom, 'avis.accord', a[0], f.avis.accord, a[1]);
        }).join('') +
        caseA('avis.vu', f.avis.vu, 'Le tuteur a pris connaissance de la fiche et des preuves') +
      '</div>' +
      '<textarea class="l" data-ch="avis.remarque" rows="3"' +
        ' placeholder="Remarques générales du tuteur">' + U.esc(f.avis.remarque) + '</textarea>' +
      '<div class="fe-sign">' +
        '<label>Nom du tuteur ' + champ('avis.nom', f.avis.nom, { petit: true }) + '</label>' +
        '<label>Date ' + champ('avis.date', f.avis.date, { petit: true, date: true }) + '</label>' +
      '</div>' +
    '</div>';
  }

  function entete(f) {
    var t = G.TYPES_FICHE[f.type];
    return '<header class="fe-tete">' +
      '<div class="fe-titre">' +
        '<h1>' + U.esc(t.nom) + '</h1>' +
        '<p>' + U.esc(t.aide) + '</p>' +
      '</div>' +
      '<label class="fe-num">Fiche n° ' + champ('numero', f.numero, { petit: true }) + '</label>' +
    '</header>' +
    '<table class="fe-champs"><tbody>' +
      '<tr><th>Projet</th><td>' + champ('projet', f.projet, { placeholder: 'nom du projet' }) + '</td></tr>' +
      '<tr><th>' + (f.type === 'rex' ? 'Période / étape couverte' : 'Période couverte') + '</th><td>' +
        champ('periode', f.periode, { placeholder: 'du … au …' }) + '</td></tr>' +
      '<tr><th>' + (f.type === 'rex' ? 'Date' : 'Rendez-vous du') + '</th><td>' +
        champ('date', f.date, { date: true }) + '</td></tr>' +
      '<tr><th>Rédigée par</th><td>' + champ('auteur', f.auteur, { placeholder: 'mon nom' }) + '</td></tr>' +
    '</tbody></table>';
  }

  /* ---------------------------------------------------------- fiche suivi -- */
  function feuilleSuivi(f) {
    var s = '';

    s += '<h2 class="fe-h2">1. Ce que j\'ai fait depuis la dernière fiche</h2>' +
      '<p class="fe-aide">Une ligne par tâche. « Preuve » = le fichier, la mesure ou la ' +
      'capture qui montre que c\'est fait. La case « vu » est celle du tuteur.</p>' +
      '<table class="fe-tab"><thead><tr>' +
        '<th>Tâche</th><th class="col-jalon">Jalon</th><th class="col-etat">État</th>' +
        '<th>Preuve / livrable</th><th class="col-vu">Vu</th><th class="noprint"></th>' +
      '</tr></thead><tbody>';

    f.fait.forEach(function (l, i) {
      s += '<tr>' +
        '<td>' + champ('fait.' + i + '.texte', l.texte, { placeholder: 'tâche' }) + '</td>' +
        '<td>' + champ('fait.' + i + '.jalon', l.jalon, { petit: true, placeholder: 'M1' }) + '</td>' +
        '<td class="etat">' +
          [['termine', 'terminé'], ['encours', 'en cours'], ['reporte', 'reporté']].map(function (e) {
            return radioA('etat-' + l.id, 'fait.' + i + '.etat', e[0], l.etat, e[1]);
          }).join('') +
        '</td>' +
        '<td>' + champ('fait.' + i + '.preuve', l.preuve, { petit: true }) + '</td>' +
        '<td class="c">' + caseA('fait.' + i + '.vu', l.vu, '') + '</td>' +
        '<td class="noprint c"><button class="mini" data-f="suppr-ligne" data-sec="fait" data-i="' + i + '"' +
          ' title="Retirer la ligne">×</button></td>' +
      '</tr>';
    });
    s += '</tbody></table>' +
      '<p class="fe-ajout noprint"><button class="mini" data-f="ajout" data-sec="fait">+ ligne</button></p>';

    s += '<h2 class="fe-h2">2. Ce que je propose — à valider par le tuteur</h2>' +
      '<p class="fe-aide">Chaque proposition est écrite pour pouvoir être refusée telle quelle : ' +
      'ce que je propose, pourquoi, ce que j\'écarte. La case de gauche est la mienne, ' +
      'celles de droite sont celles du tuteur.</p>' +
      '<table class="fe-tab"><thead><tr>' +
        '<th class="col-n">#</th><th>Proposition</th><th class="col-avis">Avis du tuteur</th>' +
        '<th class="noprint"></th>' +
      '</tr></thead><tbody>';

    f.idees.forEach(function (l, i) {
      s += '<tr>' +
        '<td class="c">' + (i + 1) + '</td>' +
        '<td>' + champ('idees.' + i + '.texte', l.texte, { placeholder: 'ce que je propose' }) +
          champ('idees.' + i + '.pourquoi', l.pourquoi, { petit: true,
            placeholder: 'pourquoi — options écartées, coût, risque' }) +
          caseA('idees.' + i + '.retenu', l.retenu, 'je garde cette idée') + '</td>' +
        '<td class="avis">' +
          AVIS.map(function (a) {
            return radioA('avis-idee-' + l.id, 'idees.' + i + '.avis', a[0], l.avis, a[1]);
          }).join('') +
          champ('idees.' + i + '.remarque', l.remarque, { petit: true, placeholder: 'remarque du tuteur' }) +
        '</td>' +
        '<td class="noprint c"><button class="mini" data-f="suppr-ligne" data-sec="idees" data-i="' + i + '"' +
          ' title="Retirer la proposition">×</button></td>' +
      '</tr>';
    });
    s += '</tbody></table>' +
      '<p class="fe-ajout noprint"><button class="mini" data-f="ajout" data-sec="idees">+ proposition</button></p>';

    s += '<h2 class="fe-h2">3. Ce que le tuteur demande</h2>' +
      '<p class="fe-aide">À remplir pendant le rendez-vous : les lignes vides servent à écrire ce ' +
      'qu\'il ajoute, les cases à cocher à le suivre d\'un rendez-vous à l\'autre.</p>' +
      '<table class="fe-tab"><thead><tr>' +
        '<th class="col-n">#</th><th>Demande</th><th class="col-ech">Pour le</th>' +
        '<th class="col-fait">Fait</th><th class="noprint"></th>' +
      '</tr></thead><tbody>';
    f.demandes.forEach(function (l, i) {
      s += '<tr>' +
        '<td class="c">' + (i + 1) + '</td>' +
        '<td>' + champ('demandes.' + i + '.texte', l.texte, {}) + '</td>' +
        '<td>' + champ('demandes.' + i + '.echeance', l.echeance, { petit: true, placeholder: 'date' }) + '</td>' +
        '<td class="c">' + caseA('demandes.' + i + '.fait', l.fait, '') + '</td>' +
        '<td class="noprint c"><button class="mini" data-f="suppr-ligne" data-sec="demandes" data-i="' + i + '"' +
          ' title="Retirer la ligne">×</button></td>' +
      '</tr>';
    });
    s += '</tbody></table>' +
      '<p class="fe-ajout noprint"><button class="mini" data-f="ajout" data-sec="demandes">+ demande</button></p>';

    s += '<h2 class="fe-h2">4. Avis général et visa du tuteur</h2>' + blocAvis(f, 'avis-general');
    return s;
  }

  /* ---------------------------------------------------------------- REX -- */
  function feuilleRex(f) {
    var s = '';
    s += '<h2 class="fe-h2">1. Fiches de retour d\'expérience</h2>' +
      '<p class="fe-aide">Chaque ligne part d\'un fait observé et mesuré, jamais d\'une ' +
      'impression. Cause inconnue s\'écrit « cause inconnue » : on ne l\'invente pas.</p>' +
      '<table class="fe-tab"><thead><tr>' +
        '<th class="col-n">#</th><th>Ce qui s\'est passé (fait observé, mesure)</th>' +
        '<th class="col-effet">Effet</th><th>Cause identifiée</th>' +
        '<th>Ce que je change / ce que je garde</th><th class="col-valide">Validé</th>' +
        '<th class="noprint"></th>' +
      '</tr></thead><tbody>';
    f.rex.forEach(function (l, i) {
      s += '<tr>' +
        '<td class="c">' + (i + 1) + '</td>' +
        '<td>' + champ('rex.' + i + '.fait', l.fait, { petit: true }) + '</td>' +
        '<td class="etat">' +
          radioA('effet-' + l.id, 'rex.' + i + '.effet', 'positif', l.effet, 'positif') +
          radioA('effet-' + l.id, 'rex.' + i + '.effet', 'negatif', l.effet, 'négatif') +
        '</td>' +
        '<td>' + champ('rex.' + i + '.cause', l.cause, { petit: true }) + '</td>' +
        '<td>' + champ('rex.' + i + '.change', l.change, { petit: true }) + '</td>' +
        '<td class="c">' + caseA('rex.' + i + '.valide', l.valide, '') + '</td>' +
        '<td class="noprint c"><button class="mini" data-f="suppr-ligne" data-sec="rex" data-i="' + i + '"' +
          ' title="Retirer la ligne">×</button></td>' +
      '</tr>';
    });
    s += '</tbody></table>' +
      '<p class="fe-ajout noprint"><button class="mini" data-f="ajout" data-sec="rex">+ ligne</button></p>' +
      '<h2 class="fe-h2">2. Avis du tuteur</h2>' + blocAvis(f, 'avis-general');
    return s;
  }

  function rendreEditeur() {
    var f = G.ficheById(courante);
    if (!f) {
      el.editeur.innerHTML = '<p class="vide">Choisissez une fiche à gauche, ou créez-en une.</p>';
      return;
    }
    el.editeur.innerHTML =
      '<div class="fe-outils noprint">' +
        '<button class="btn btn-primary" data-f="pdf" title="Écrire un vrai fichier .pdf">' +
          'Télécharger le PDF</button>' +
        '<button class="btn" data-f="imprimer" title="Impression du navigateur (Ctrl+P)">Imprimer</button>' +
        '<div class="espace"></div>' +
        '<button class="btn" data-f="dupliquer" title="Copier cette fiche pour la période suivante">' +
          'Dupliquer</button>' +
        '<button class="btn btn-danger" data-f="supprimer">Supprimer</button>' +
      '</div>' +
      '<article class="feuille" data-fiche="' + f.id + '">' +
        entete(f) +
        (f.type === 'rex' ? feuilleRex(f) : feuilleSuivi(f)) +
      '</article>' +
      '<p class="fe-note noprint">Le PDF téléchargé contient le texte, pas une image : il reste ' +
      'lisible et sélectionnable. Pour un envoi, le PDF suffit ; pour cocher à la souris, ' +
      'gardez la fiche ici — les cases sont modifiables à l\'écran.</p>';
  }

  F.rendre = function () {
    if (!el.root || !el.items) F.cache();
    if (!G.state.fiches.length) courante = null;
    else if (!courante || !G.ficheById(courante)) courante = G.state.fiches[0].id;
    rendreListe();
    rendreEditeur();
  };

  /* ======================================================= les interactions == */
  function ecrire(f, chemin, valeur) {
    var p = chemin.split('.');
    var o = f;
    for (var i = 0; i < p.length - 1; i++) {
      if (o[p[i]] === undefined || o[p[i]] === null) return;
      o = o[p[i]];
    }
    o[p[p.length - 1]] = valeur;
  }

  function surChamp(e, commit) {
    var c = e.target;
    if (!c.dataset || !c.dataset.ch) return;
    var f = G.ficheById(courante);
    if (!f) return;

    var val;
    if (c.type === 'checkbox') val = !!c.checked;
    else if (c.type === 'radio') { if (!c.checked) return; val = c.value; }
    else val = c.value;

    ecrire(f, c.dataset.ch, val);
    G.dirty = true;
    G.persist.saveSoon();
    majEtiquette(f);
    if (commit) G.history.commit();
  }

  F.bind = function () {
    if (!el.root) F.cache();

    el.root.addEventListener('input', function (e) { surChamp(e, false); });
    el.root.addEventListener('change', function (e) { surChamp(e, true); });

    /* Entrée valide le champ et referme l'édition (on ne parie pas sur blur) */
    el.root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var c = e.target;
      if (!c.dataset || !c.dataset.ch) return;
      if (c.tagName === 'TEXTAREA') return;      /* dans un texte long, Entrée écrit */
      e.preventDefault();
      G.history.commit();
      c.blur();
    });

    el.root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-f]');
      if (!b) return;
      var f = G.ficheById(courante);

      switch (b.dataset.f) {
        case 'choisir':
          courante = b.dataset.id;
          F.rendre();
          break;

        case 'nouvelle': {
          var n = G.newFiche(b.dataset.type, {
            projet: G.state.title && G.state.title !== 'Nouveau planning' ? G.state.title : ''
          });
          n.numero = String(G.state.fiches.length + 1);
          G.state.fiches.push(n);
          courante = n.id;
          G.history.commit();
          G.dirty = true;
          G.persist.save();
          F.rendre();
          V.toast(G.TYPES_FICHE[n.type].nom + ' créée', 'ok');
          break;
        }

        case 'dupliquer': {
          if (!f) break;
          var copie = JSON.parse(JSON.stringify(f));
          copie.id = U.uid('f');
          copie.numero = String(G.state.fiches.length + 1);
          copie.date = U.todayISO();
          copie.avis = { accord: '', remarque: '', vu: false, nom: '', date: '' };
          /* on repart des lignes vides : c'est une fiche neuve, pas un doublon */
          copie.fait = [G.newLigneFait()];
          copie.idees = [G.newLigneIdee()];
          copie.demandes = [G.newLigneDemande()];
          copie.rex = [G.newLigneRex()];
          G.state.fiches.push(copie);
          courante = copie.id;
          G.history.commit();
          G.dirty = true;
          G.persist.save();
          F.rendre();
          V.toast('Fiche dupliquée — lignes vidées, en-tête repris', 'ok');
          break;
        }

        case 'supprimer': {
          if (!f) break;
          if (!window.confirm('Supprimer définitivement « ' + (f.projet || G.TYPES_FICHE[f.type].nom) + ' » ?')) break;
          G.state.fiches = G.state.fiches.filter(function (x) { return x.id !== f.id; });
          courante = G.state.fiches.length ? G.state.fiches[0].id : null;
          G.history.commit();
          G.dirty = true;
          G.persist.save();
          F.rendre();
          break;
        }

        case 'ajout': {
          if (!f) break;
          var sec = b.dataset.sec;
          var fabrique = { fait: G.newLigneFait, idees: G.newLigneIdee,
                           demandes: G.newLigneDemande, rex: G.newLigneRex }[sec];
          if (!fabrique) break;
          f[sec].push(fabrique());
          G.history.commit();
          G.dirty = true;
          G.persist.saveSoon();
          F.rendre();
          var champs = el.editeur.querySelectorAll('[data-ch^="' + sec + '."]');
          if (champs.length) champs[champs.length - 1].focus();
          break;
        }

        case 'suppr-ligne': {
          if (!f) break;
          f[b.dataset.sec].splice(+b.dataset.i, 1);
          if (!f[b.dataset.sec].length) F.rendre();      /* plus rien : on remet une ligne vide */
          else { G.history.commit(); G.dirty = true; G.persist.saveSoon(); F.rendre(); }
          break;
        }

        case 'imprimer':
          if (f) F.imprimer();
          break;

        case 'pdf':
          if (f) G.pdfFiche.telecharger(f);
          break;
      }
      G.persist.saveSoon();
    });
  };

  /* =========================================================== impression == */
  /* La fiche est déjà à l'écran : on n'en construit pas une seconde version,
     on masque le reste et on imprime la feuille telle qu'elle est. */
  F.imprimer = function () {
    if (!G.ficheById(courante)) return;
    G.vues.imprimer('fiche');
  };

  F.courante = function () { return G.ficheById(courante); };

})();
