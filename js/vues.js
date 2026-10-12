/* ==========================================================================
   vues.js — la coquille : onglets, bascule de vue, mise en page d'impression

   Trois vues dans la même page : le Gantt (planifier), les tâches affiliées
   (ce qu'il reste à faire sur une tâche, qu'on coche), les fiches (ce que je
   propose, ce que le tuteur en pense, ce que ça donne en PDF).
   ========================================================================== */
(function () {
  'use strict';

  var G = window.Gantt, V = G.view;
  var vues = G.vues = {};

  var ORDRE = ['gantt', 'taches', 'fiches'];
  var CLE = 'gantt.vue';
  var STYLE_ID = 'regle-page';

  var el = {};
  var regle = null;

  vues.active = 'gantt';

  vues.cache = function () {
    el.barre = document.getElementById('vues');
    el.gantt = document.querySelector('.workspace');
    el.taches = document.getElementById('vue-taches');
    el.fiches = document.getElementById('vue-fiches');
  };

  /* Le Gantt seul se mesure mal caché : on remet la vue avant de redessiner,
     sinon la largeur du canevas vaut 0 et l'échelle repart de travers. */
  vues.aller = function (nom) {
    if (ORDRE.indexOf(nom) < 0) nom = 'gantt';
    vues.cache();
    if (!el.barre) return;

    vues.active = nom;
    document.body.dataset.vue = nom;
    if (el.gantt) el.gantt.hidden = (nom !== 'gantt');
    el.taches.hidden = (nom !== 'taches');
    el.fiches.hidden = (nom !== 'fiches');

    Array.prototype.forEach.call(el.barre.querySelectorAll('button'), function (b) {
      var on = b.dataset.vue === nom;
      b.setAttribute('aria-current', on ? 'page' : 'false');
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (nom === 'gantt') V.render();
    else if (nom === 'taches') G.taches.rendre();
    else G.fichesVue.rendre();

    try { localStorage.setItem(CLE, nom); } catch (e) { /* mode privé */ }
    G.persist.saveSoon();
  };

  vues.demarrer = function () {
    vues.cache();

    var depart = 'gantt';
    try { depart = localStorage.getItem(CLE) || 'gantt'; } catch (e) {}
    vues.aller(depart);

    if (el.barre) {
      el.barre.addEventListener('click', function (e) {
        var b = e.target.closest('[data-vue]');
        if (b) vues.aller(b.dataset.vue);
      });
    }

    /* Ctrl+1 / 2 / 3 : passer d'une vue à l'autre sans la souris */
    document.addEventListener('keydown', function (e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      var i = ['1', '2', '3'].indexOf(e.key);
      if (i < 0) return;
      e.preventDefault();
      vues.aller(ORDRE[i]);
    });
  };

  /* ============================================================== impression */
  /* @page ne se conditionne pas par une classe : la règle du format est donc
     posée par une feuille injectée au moment d'imprimer, et retirée après. */
  function poserRegle(mode) {
    if (!regle || !regle.parentNode) {
      regle = document.getElementById(STYLE_ID);
      if (!regle) {
        regle = document.createElement('style');
        regle.id = STYLE_ID;
        document.head.appendChild(regle);
      }
    }
    regle.textContent = (mode === 'gantt')
      ? '@page { size: A3 landscape; margin: 10mm; }'
      : '@page { size: A4 portrait; margin: 12mm; }';
  }

  vues.imprimer = function (mode) {
    vues.cache();
    var actif = mode || vues.active;

    poserRegle(actif);
    document.body.dataset.impression = actif;

    if (actif === 'gantt') {
      G.io.print();                       /* gère l'échelle puis window.print() */
      return;
    }
    if (actif === 'taches') G.taches.rendre();
    if (actif === 'fiches') G.fichesVue.rendre();

    setTimeout(function () {
      window.print();
      setTimeout(apresImpression, 500);
    }, 80);
  };

  function apresImpression() {
    if (!document.body.dataset.impression) return;
    delete document.body.dataset.impression;
    poserRegle(vues.active);
  }

  window.addEventListener('afterprint', apresImpression);

  /* ================================================================= clavier */
  vues.surGantt = function () { return vues.active === 'gantt'; };

})();
