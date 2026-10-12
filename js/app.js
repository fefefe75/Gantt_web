/* ==========================================================================
   app.js — démarrage : barre d'outils, menu, fichier, état initial.
   ========================================================================== */
(function () {
  'use strict';

  var G = window.Gantt, U = G.util, V = G.view, io = G.io;

  var premierLancement = false;

  /* Charger un exemple : les données brutes sont remises dans l'ordre
     chronologique, puis l'historique repart de CET ordre. `G.load()` installe
     son instantané de départ avant le tri ; sans ce reset, le premier annuler
     après une modification revenait à l'ordre non trié, tous les jalons
     regroupés à la fin de la liste. */
  function chargerExemple(ex) {
    G.load(ex);
    G.sortTasksByDate();
    G.history.reset();
  }

  function demarrer() {
    V.cache();
    V.bind();
    V.bindGrip();

    /* les vues ajoutées s'accrochent sur les mêmes données */
    G.taches.cache();
    G.taches.bind();
    G.fichesVue.cache();
    G.fichesVue.bind();

    /* ---- état initial : session précédente, sinon l'exemple maison ---- */
    var repris = G.persist.load();
    if (!repris) {
      chargerExemple(G.EXEMPLES.maison);
      premierLancement = true;
    }

    brancherBarre();
    brancherMenu();
    brancherFichier();

    V.render();

    var r = G.range();
    var aujourdhui = U.todayISO();
    var cible = (aujourdhui >= r.startISO && aujourdhui <= r.endISO) ? aujourdhui : G.extent().min;
    V.ensureVisible(cible, true);

    /* la vue où on s'était arrêté (le Gantt par défaut) */
    G.vues.demarrer();

    G.dirty = false;

    if (premierLancement) {
      V.toast('Exemple chargé — menu <b>⋯</b> pour l\'autre exemple ou <b>Nouveau</b>', null, 5200);
    }
  }

  /* ============================================================ barre d'outils */
  function brancherBarre() {
    var topbar = document.querySelector('.topbar');

    topbar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act],[data-zoom]');
      if (!b) return;

      if (b.dataset.zoom) {
        V.zoomTo(b.dataset.zoom);
        G.persist.saveSoon();
        return;
      }

      switch (b.dataset.act) {
        case 'add-task':    G.ajouterTache(); break;
        case 'add-section': {
          G.addSection('Groupe ' + (G.state.sections.length + 1));
          G.commit();
          break;
        }
        case 'fit':   V.fit(); break;
        case 'today': V.gotoToday(); break;
        case 'undo':  if (G.history.undo()) G.commit(); break;
        case 'redo':  if (G.history.redo()) G.commit(); break;
        case 'theme': {
          G.state.theme = G.state.theme === 'sombre' ? 'clair' : 'sombre';
          V.render();
          G.persist.saveSoon();
          break;
        }
        case 'save': io.save(); break;
        case 'open': io.openFile(); break;
        case 'toggle-panneau': V.togglePanneau(); break;
        case 'menu': basculerMenu(b); break;
      }
    });

    /* titre éditable */
    var titre = V.el.title;
    titre.addEventListener('input', function () {
      G.state.title = titre.value;
      G.dirty = true;
      G.persist.saveSoon();
    });
    titre.addEventListener('change', function () { G.history.commit(); });
    titre.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') titre.blur();
    });
  }

  /* ==================================================================== menu */
  function basculerMenu(bouton) {
    var ouvert = !V.el.menu.hidden;
    V.el.menu.hidden = ouvert;
    bouton.setAttribute('aria-expanded', String(!ouvert));
  }

  function fermerMenu() {
    if (!V.el.menu) return;
    V.el.menu.hidden = true;
    var b = document.querySelector('[data-act="menu"]');
    if (b) b.setAttribute('aria-expanded', 'false');
  }

  function brancherMenu() {
    V.el.menu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      fermerMenu();

      switch (b.dataset.act) {
        case 'vue-gantt':  G.vues.aller('gantt'); break;
        case 'vue-taches': G.vues.aller('taches'); break;
        case 'vue-fiches': G.vues.aller('fiches'); break;
        case 'new': {
          if (G.state.tasks.length && !window.confirm('Créer un planning vide ? (Ctrl+Z ne revient pas en arrière après cette action)')) return;
          G.blankState();
          io.nouveauDocument();
          G.addSection('Groupe 1');
          G.ajouterTache();
          G.dirty = false;
          G.persist.save();
          V.render();
          V.toast('Planning vide', 'ok');
          break;
        }
        case 'open':      io.openFile(); break;
        case 'save-as':   io.saveAs(); break;
        case 'ex-maison':
          io.nouveauDocument();
          chargerExemple(G.EXEMPLES.maison);
          V.render(); V.ensureVisible(G.extent().min, true);
          G.persist.save();
          V.toast('Exemple « Construction d\'une maison » chargé', 'ok');
          break;
        case 'ex-conduite':
          io.nouveauDocument();
          chargerExemple(G.EXEMPLES.conduite);
          V.render(); V.ensureVisible(G.extent().min, true);
          G.persist.save();
          V.toast('Exemple « Conduite de l\'action » chargé', 'ok');
          break;
        case 'x-json': io.exportJSON(); break;
        case 'x-svg':  io.exportSVG(); break;
        case 'x-png':  io.exportPNG(); break;
        case 'print':  G.vues.imprimer(); break;
      }
    });

    /* clic à l'extérieur = fermeture */
    document.addEventListener('pointerdown', function (e) {
      if (V.el.menu.hidden) return;
      if (e.target.closest('#main-menu') || e.target.closest('[data-act="menu"]')) return;
      fermerMenu();
    }, true);
  }

  /* ================================================================== fichier */
  function brancherFichier() {
    V.el.fileInput.addEventListener('change', function () {
      var f = this.files && this.files[0];
      this.value = '';
      if (!f) return;
      lireFichier(f);
    });

    /* glisser-déposer d'un .json n'importe où dans la fenêtre */
    var compteur = 0;
    window.addEventListener('dragenter', function (e) {
      if (!contientFichier(e)) return;
      e.preventDefault();
      compteur++;
      document.body.classList.add('depot');
    });
    window.addEventListener('dragover', function (e) {
      if (!contientFichier(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    window.addEventListener('dragleave', function (e) {
      if (!contientFichier(e)) return;
      compteur = Math.max(0, compteur - 1);
      if (!compteur) document.body.classList.remove('depot');
    });
    window.addEventListener('drop', function (e) {
      if (!contientFichier(e)) return;
      e.preventDefault();
      compteur = 0;
      document.body.classList.remove('depot');
      var f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) lireFichier(f);
    });
  }

  function contientFichier(e) {
    var t = e.dataTransfer && e.dataTransfer.types;
    if (!t) return false;
    for (var i = 0; i < t.length; i++) if (t[i] === 'Files') return true;
    return false;
  }

  function lireFichier(f) {
    var r = new FileReader();
    r.onload = function () {
      var txt = String(r.result);
      /* une fiche seule déposée dans la fenêtre s'ajoute au projet, elle
         n'écrase pas le planning en cours */
      if (io.estFicheJSON && io.estFicheJSON(txt)) io.integrerFiches(txt, f.name);
      else io.importer(txt, f.name);
    };
    r.onerror = function () { V.toast('Lecture impossible', 'warn'); };
    r.readAsText(f);
  }

  /* ================================================== avertissement de sortie */
  window.addEventListener('beforeunload', function (e) {
    if (G.dirty && G.state.fileHandle) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
    G.persist.save();
  });

  /* ================================================================ lancement */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', demarrer);
  } else {
    demarrer();
  }

  window.Gantt.app = { demarrer: demarrer, fermerMenu: fermerMenu };

})();
