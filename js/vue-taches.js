/* ==========================================================================
   vue-taches.js — « Tâches & affiliées »

   Chaque tâche du planning ouvre une liste de tâches affiliées : ce qu'il
   reste à faire dessus, qu'on coche au fil de l'eau. Une affiliée n'a pas de
   dates et n'apparaît pas dans le Gantt — elle sert à ne pas oublier la
   poussière sous le tapis d'une tâche, jalon ou pas.
   ========================================================================== */
(function () {
  'use strict';

  var G = window.Gantt, U = G.util, V = G.view;
  var T = G.taches = {};

  var el = {};
  var ouvertes = {};      // tâches dépliées (par id) : tout est déplié au départ

  T.cache = function () {
    el.root = document.getElementById('vue-taches');
    el.corps = document.getElementById('taches-corps');
    el.bilan = document.getElementById('taches-bilan');
  };

  /* ------------------------------------------------------------- compteurs -- */
  var global = { faites: 0, total: 0 };

  function compter() {
    global = { faites: 0, total: 0 };
    G.state.tasks.forEach(function (t) {
      t.subs.forEach(function (s) {
        global.total++;
        if (s.fait) global.faites++;
      });
    });
  }

  /* ---------------------------------------------------------------- rendu -- */
  function ligneAffiliee(t, s) {
    return '' +
      '<li class="aff' + (s.fait ? ' faite' : '') + '" data-sub="' + s.id + '">' +
        '<label class="aff-case" title="Fait">' +
          '<input type="checkbox" data-sub-fait="' + s.id + '" data-tache="' + t.id + '"' +
            (s.fait ? ' checked' : '') + '>' +
        '</label>' +
        '<input class="aff-nom" data-sub-nom="' + s.id + '" data-tache="' + t.id + '"' +
          ' value="' + U.esc(s.name) + '" placeholder="Ce qu\'il reste à faire"' +
          ' spellcheck="false">' +
        '<button class="mini noprint" data-t="del-sub" data-sub="' + s.id + '" data-tache="' + t.id + '"' +
          ' title="Retirer cette tâche affiliée" aria-label="Retirer">×</button>' +
      '</li>';
  }

  function articleTache(t) {
    var b = G.subBilan(t);
    var col = G.taskColor(t);
    var date = t.milestone
      ? U.fmtShort(t.start)
      : U.fmtShort(t.start) + ' → ' + U.fmtShort(t.end);
    var ouvert = ouvertes[t.id] !== false;

    return '' +
      '<article class="tache" data-tache="' + t.id + '">' +
        '<div class="t-tete">' +
          '<span class="t-puce" style="background:' + col.bar + '"></span>' +
          '<input class="t-nom" data-t-nom="' + t.id + '" value="' + U.esc(t.name) + '"' +
            ' spellcheck="false" title="Renommer la tâche (le planning suit)">' +
          '<span class="t-meta">' + date +
            (t.milestone ? ' · jalon ' + U.esc(t.tag || '') : '') +
            ' · ' + t.progress + ' %</span>' +
          (b.total
            ? '<span class="t-bilan' + (b.faites === b.total ? ' tout' : '') + '">' +
                b.faites + '/' + b.total + '</span>'
            : '<span class="t-bilan vide">aucune affiliée</span>') +
          '<button class="mini noprint" data-t="avancement" data-tache="' + t.id + '"' +
            ' title="Reprendre l\'avancement du Gantt depuis les affiliées cochées">' +
            '↺ avancement</button>' +
          '<button class="mini noprint" data-t="plier" data-tache="' + t.id + '"' +
            ' title="Déplier / replier">' + (ouvert ? '▾' : '▸') + '</button>' +
        '</div>' +
        (ouvert
          ? '<ul class="affiliees">' +
              t.subs.map(function (s) { return ligneAffiliee(t, s); }).join('') +
              '<li class="aff-ajout noprint"><button class="mini" data-t="add-sub" data-tache="' + t.id + '">' +
              '+ tâche affiliée</button></li>' +
            '</ul>'
          : '') +
      '</article>';
  }

  function groupe(s) {
    var taches = G.state.tasks.filter(function (t) { return t.section === s.id; });
    if (!taches.length) return '';
    var col = G.colorOf(s.color);
    var n = 0;
    taches.forEach(function (t) { n += t.subs.length; });
    return '' +
      '<section class="t-groupe">' +
        '<header class="t-groupe-tete">' +
          '<span class="t-puce" style="background:' + col.bar + '"></span>' +
          '<h3>' + U.esc(s.name) + '</h3>' +
          '<span class="t-groupe-n">' + taches.length + ' tâche' + (taches.length > 1 ? 's' : '') +
            ' · ' + n + ' affiliée' + (n > 1 ? 's' : '') + '</span>' +
        '</header>' +
        taches.map(articleTache).join('') +
      '</section>';
  }

  T.rendre = function () {
    if (!el.root || !el.corps) T.cache();
    compter();

    var html = G.state.sections.map(groupe).join('');

    /* tâches hors groupe (groupe supprimé à la main) */
    var connus = {};
    G.state.sections.forEach(function (s) { connus[s.id] = 1; });
    var orphelines = G.state.tasks.filter(function (t) { return !connus[t.section]; });
    if (orphelines.length) {
      html += '<section class="t-groupe"><header class="t-groupe-tete">' +
        '<span class="t-puce" style="background:#8390a1"></span><h3>Sans groupe</h3>' +
        '<span class="t-groupe-n">' + orphelines.length + '</span></header>' +
        orphelines.map(articleTache).join('') + '</section>';
    }

    if (!html) {
      html = '<p class="vide">Aucune tâche dans le planning. La vue <b>Gantt</b> sert à ' +
             'en créer ; les tâches affiliées se rangent ici, dessous.</p>';
    }

    el.corps.innerHTML = html;
    majBilan();
  };

  function majBilan() {
    if (!el.bilan) return;
    el.bilan.textContent = global.total
      ? global.faites + ' / ' + global.total + ' tâches affiliées faites'
      : '';
  }

  /* Rien à redessiner pendant la frappe : on ne met à jour que ce qui bouge */
  T.majCompteurs = function (t) {
    var art = el.corps.querySelector('.tache[data-tache="' + t.id + '"]');
    if (!art) return;
    var b = G.subBilan(t);
    var badge = art.querySelector('.t-bilan');
    if (badge) {
      badge.textContent = b.total ? b.faites + '/' + b.total : 'aucune affiliée';
      badge.classList.toggle('tout', b.total > 0 && b.faites === b.total);
      badge.classList.toggle('vide', !b.total);
    }
    compter();
    majBilan();
  };

  /* ---------------------------------------------------------- interactions -- */
  T.bind = function () {
    if (!el.root) T.cache();

    el.root.addEventListener('click', function (e) {
      var b = e.target.closest('[data-t]');
      if (!b) return;
      var t = G.taskById(b.dataset.tache);

      switch (b.dataset.t) {
        case 'add-sub': {
          if (!t) break;
          var s = G.addSub(t, '');
          ouvertes[t.id] = true;
          G.history.commit();
          G.dirty = true;
          G.persist.saveSoon();
          T.rendre();
          var champ = el.corps.querySelector('[data-sub-nom="' + s.id + '"]');
          if (champ) champ.focus();
          break;
        }
        case 'del-sub': {
          if (!t) break;
          G.removeSub(t, b.dataset.sub);
          G.history.commit();
          G.dirty = true;
          G.persist.saveSoon();
          T.rendre();
          break;
        }
        case 'avancement': {
          if (!t) break;
          if (!t.subs.length) { V.toast('Aucune tâche affiliée à reprendre', 'warn'); break; }
          t.progress = G.progressDepuisSubs(t);
          G.history.commit();
          G.dirty = true;
          G.persist.saveSoon();
          V.render();
          T.rendre();
          V.toast('Avancement de « ' + t.name + ' » porté à ' + t.progress + ' %', 'ok');
          break;
        }
        case 'plier':
          ouvertes[b.dataset.tache] = ouvertes[b.dataset.tache] === false;
          T.rendre();
          break;
        case 'imprimer':
          T.imprimer();
          break;
      }
    });

    /* la case : cochée = faite */
    el.root.addEventListener('change', function (e) {
      var c = e.target;
      if (!c.dataset) return;
      var t = G.taskById(c.dataset.tache);
      if (!t) return;

      if (c.dataset.subFait) {
        var s = G.subById(t, c.dataset.subFait);
        if (!s) return;
        s.fait = !!c.checked;
        var li = c.closest('.aff');
        if (li) li.classList.toggle('faite', s.fait);
        T.majCompteurs(t);
        G.history.commit();
        G.dirty = true;
        G.persist.saveSoon();
        return;
      }
      if (c.dataset.tNom) {                    /* renommage d'une tâche du planning */
        t.name = c.value.trim() || t.name;
        G.history.commit();
        G.dirty = true;
        G.persist.saveSoon();
        V.renderInspector();
        return;
      }
      if (c.dataset.subNom) {                  /* renommage d'une affiliée */
        var a = G.subById(t, c.dataset.subNom);
        if (!a) return;
        a.name = c.value;
        G.history.commit();
        G.dirty = true;
        G.persist.saveSoon();
      }
    });

    /* on écrit dans le modèle à la frappe, sans redessiner (le focus reste) */
    el.root.addEventListener('input', function (e) {
      var c = e.target;
      if (!c.dataset) return;
      var t = G.taskById(c.dataset.tache);
      if (!t) return;
      if (c.dataset.subNom) {
        var a = G.subById(t, c.dataset.subNom);
        if (a) { a.name = c.value; G.dirty = true; G.persist.saveSoon(); }
      } else if (c.dataset.tNom) {
        t.name = c.value;
        G.dirty = true;
        G.persist.saveSoon();
      }
    });

    el.root.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      if (!e.target.dataset) return;
      if (e.target.dataset.subNom || e.target.dataset.tNom) {
        e.preventDefault();
        G.history.commit();
        e.target.blur();
      }
    });
  };

  /* ------------------------------------------------------------ impression -- */
  /* La liste imprimée sert de support papier : les cases y sont vides ou
     cochées telles qu'elles sont à l'écran. */
  T.imprimer = function () {
    G.vues.imprimer('taches');
  };

})();
