/* ==========================================================================
   exemples.js — jeux de données de démonstration
   Chargés depuis le menu ⋯ > Exemples. Aucun accès réseau (donc utilisables
   en ouvrant index.html directement, sans serveur).
   ========================================================================== */
(function () {
  'use strict';
  var G = window.Gantt;

  var EX = G.EXEMPLES = {};

  /* ---------------------------------------------------------------------
     1. Construction d'une maison — planning long (18 mois), 5 groupes,
        6 jalons. Sert aussi de cas d'essai pour les longues périodes :
        un an et demi au zoom « mois » et les exports.
        Les dates partent du 05/01/2026 pour que la ligne « aujourd'hui »
        tombe en pleine construction.
     --------------------------------------------------------------------- */
  EX.maison = {
    title: 'Construction d’une maison — 18 mois',
    zoom: 'mois',
    theme: 'clair',
    sections: [
      { id: 'm1', name: 'Études & autorisations', color: 'azur' },
      { id: 'm2', name: 'Gros œuvre',             color: 'ambre' },
      { id: 'm3', name: "Clos & couvert",         color: 'turquoise' },
      { id: 'm4', name: 'Lots techniques',        color: 'vert' },
      { id: 'm5', name: 'Second œuvre & finitions', color: 'violet' }
    ],
    tasks: [
      { id: 'e1', section: 'm1', name: 'Étude de faisabilité et budget',       start: '2026-01-05', end: '2026-01-23', progress: 100 },
      { id: 'e2', section: 'm1', name: 'Étude de sol (G5) et relevé topographique', start: '2026-01-12', end: '2026-01-30', progress: 100 },
      { id: 'e3', section: 'm1', name: "Avant-projet et plans de l'architecte", start: '2026-01-26', end: '2026-03-06', progress: 100,
        deps: [{ id: 'e1' }] },
      { id: 'e4', section: 'm1', name: 'Dépôt du permis de construire',        start: '2026-03-09', end: '2026-03-13', progress: 100,
        deps: [{ id: 'e3' }] },
      { id: 'e5', section: 'm1', name: 'Instruction du permis en mairie',      start: '2026-03-16', end: '2026-05-15', progress: 100,
        deps: [{ id: 'e4' }] },
      { id: 'e6', section: 'm1', name: 'Consultation des entreprises',         start: '2026-05-25', end: '2026-06-19', progress: 100,
        deps: [{ id: 'e5' }] },
      { id: 'e7', section: 'm1', name: 'Choix des artisans',                   start: '2026-06-22', end: '2026-07-03', progress: 100,
        deps: [{ id: 'e6' }] },

      { id: 'g1', section: 'm2', name: 'Installation de chantier et terrassement', start: '2026-07-06', end: '2026-07-24', progress: 100,
        deps: [{ id: 'e7' }] },
      { id: 'g2', section: 'm2', name: 'Fondations et semelles',               start: '2026-07-27', end: '2026-08-14', progress: 100,
        deps: [{ id: 'g1' }] },
      { id: 'g3', section: 'm2', name: 'Dallage et dalle',                     start: '2026-08-17', end: '2026-08-28', progress: 100,
        deps: [{ id: 'g2' }] },
      { id: 'g4', section: 'm2', name: 'Élévation des murs (maçonnerie)',      start: '2026-08-31', end: '2026-10-09', progress: 80,
        deps: [{ id: 'g3' }] },
      { id: 'g5', section: 'm2', name: 'Charpente',                            start: '2026-10-12', end: '2026-11-06',
        deps: [{ id: 'g4' }] },
      { id: 'g6', section: 'm2', name: 'Couverture et zinguerie',              start: '2026-11-09', end: '2026-12-04',
        deps: [{ id: 'g5' }] },

      { id: 'c1', section: 'm3', name: 'Menuiseries extérieures (fenêtres, portes)', start: '2026-12-07', end: '2026-12-25',
        deps: [{ id: 'g6' }] },
      { id: 'c2', section: 'm3', name: 'Volets et brise-soleil',               start: '2026-12-28', end: '2027-01-15',
        deps: [{ id: 'c1' }] },

      { id: 't1', section: 'm4', name: 'Électricité (gaines, tableaux)',       start: '2026-12-28', end: '2027-01-29',
        deps: [{ id: 'c1' }] },
      { id: 't2', section: 'm4', name: 'Plomberie et évacuations',             start: '2026-12-28', end: '2027-01-29',
        deps: [{ id: 'c1' }] },
      { id: 't3', section: 'm4', name: 'Chauffage et pompe à chaleur',         start: '2027-02-01', end: '2027-02-19',
        deps: [{ id: 't2' }] },
      { id: 't4', section: 'm4', name: 'VMC et ventilation',                   start: '2027-02-01', end: '2027-02-12',
        deps: [{ id: 't1' }] },

      { id: 's1', section: 'm5', name: 'Isolation et plaques de plâtre',       start: '2027-01-18', end: '2027-02-19',
        deps: [{ id: 't1' }] },
      { id: 's2', section: 'm5', name: 'Chapes',                               start: '2027-02-22', end: '2027-03-05',
        deps: [{ id: 's1' }] },
      { id: 's3', section: 'm5', name: 'Carrelage',                            start: '2027-03-08', end: '2027-04-02',
        deps: [{ id: 's2' }] },
      { id: 's4', section: 'm5', name: 'Peinture',                             start: '2027-04-05', end: '2027-04-30',
        deps: [{ id: 's3' }] },
      { id: 's5', section: 'm5', name: 'Parquet et sols souples',              start: '2027-05-03', end: '2027-05-21',
        deps: [{ id: 's4' }] },
      { id: 's6', section: 'm5', name: 'Cuisine et salle de bain',             start: '2027-05-24', end: '2027-06-11',
        deps: [{ id: 's5' }] },
      { id: 's7', section: 'm5', name: 'Raccordements et finitions',           start: '2027-06-14', end: '2027-07-02',
        deps: [{ id: 's6' }] },
      { id: 's8', section: 'm5', name: 'Réception et levée des réserves',      start: '2027-07-05', end: '2027-07-23',
        deps: [{ id: 's7' }] },

      /* jalons */
      { id: 'j1', section: 'm1', name: 'Permis déposé',          start: '2026-03-13', end: '2026-03-13', milestone: true, tag: 'M1', progress: 100, deps: [{ id: 'e4' }] },
      { id: 'j2', section: 'm1', name: 'Permis accordé',         start: '2026-05-22', end: '2026-05-22', milestone: true, tag: 'M2', progress: 100, deps: [{ id: 'e5' }] },
      { id: 'j3', section: 'm2', name: 'Dalle coulée',           start: '2026-08-28', end: '2026-08-28', milestone: true, tag: 'M3', progress: 100, deps: [{ id: 'g3' }] },
      { id: 'j4', section: 'm2', name: "Hors d'eau",             start: '2026-12-04', end: '2026-12-04', milestone: true, tag: 'M4', deps: [{ id: 'g6' }] },
      { id: 'j5', section: 'm3', name: "Hors d'air",             start: '2026-12-25', end: '2026-12-25', milestone: true, tag: 'M5', deps: [{ id: 'c1' }] },
      { id: 'j6', section: 'm5', name: 'Livraison et emménagement', start: '2027-07-23', end: '2027-07-23', milestone: true, tag: 'M6', deps: [{ id: 's8' }] }
    ]
  };

  /* ---------------------------------------------------------------------
     2. Conduite de l'action — le modèle « propre et moderne » :
        jalons numérotés M1…M13 + flèches de dépendance.
        Dates reconstituées d'après la figure (août 2022 → juillet 2023).
     --------------------------------------------------------------------- */
  EX.conduite = {
    title: "Conduite de l'action",
    zoom: 'semaine',
    theme: 'clair',
    sections: [
      { id: 'g1', name: "Étude & état de l'art", color: 'azur' },
      { id: 'g2', name: 'Convertisseur de test', color: 'vert' },
      { id: 'g3', name: 'Nouveau transformateur DC/DC', color: 'violet' },
      { id: 'g4', name: 'Périodes école & vacances', color: 'turquoise' },
      { id: 'g5', name: 'Livrables', color: 'ambre' }
    ],
    tasks: [
      { id: 'k1',  section: 'g1', name: 'Recherche thème général', start: '2022-08-22', end: '2022-09-02', progress: 100 },
      { id: 'k2',  section: 'g1', name: 'Analyse du besoin', start: '2022-09-05', end: '2022-09-16', progress: 100, deps: [{ id: 'k1' }] },
      { id: 'k3',  section: 'g1', name: 'Cahier des charges', start: '2022-09-19', end: '2022-09-30', progress: 100, deps: [{ id: 'k2' }] },
      { id: 'k4',  section: 'g1', name: "Étude du fonctionnement des technologies de conversion d'énergie", start: '2022-09-19', end: '2022-10-21', progress: 100 },
      { id: 'k5',  section: 'g1', name: "Rédaction d'un rapport d'état de l'art", start: '2022-10-10', end: '2022-11-11', progress: 100, deps: [{ id: 'k4' }] },

      { id: 'k6',  section: 'g2', name: "Mise à jour du rapport d'état de l'art", start: '2022-11-14', end: '2022-12-02', progress: 100 },
      { id: 'k7',  section: 'g2', name: "Commande d'un convertisseur de test", start: '2022-11-14', end: '2022-12-16', progress: 100 },
      { id: 'k8',  section: 'g2', name: 'Modélisation du convertisseur de test', start: '2022-12-05', end: '2023-01-06', progress: 100, deps: [{ id: 'k7' }] },
      { id: 'k9',  section: 'g2', name: "Dimensionnement d'une inductance", start: '2023-01-09', end: '2023-01-20', progress: 100, deps: [{ id: 'k8' }] },
      { id: 'k10', section: 'g2', name: 'Essai sur le convertisseur de test avec charge', start: '2023-01-23', end: '2023-02-03', progress: 100 },
      { id: 'k11', section: 'g2', name: 'Simulation du convertisseur de test', start: '2023-01-09', end: '2023-02-03', progress: 100 },
      { id: 'k12', section: 'g2', name: 'Essai à vide sur le convertisseur de test', start: '2023-02-06', end: '2023-02-17', progress: 100, deps: [{ id: 'k10' }] },
      { id: 'k13', section: 'g2', name: 'Analyse des résultats des essais à vide', start: '2023-02-20', end: '2023-03-03', progress: 100, deps: [{ id: 'k12' }] },

      { id: 'k14', section: 'g3', name: 'Conception du nouveau transformateur DC/DC', start: '2023-03-06', end: '2023-03-24', progress: 100, deps: [{ id: 'k13' }] },
      { id: 'k15', section: 'g3', name: 'Modélisation du nouveau transformateur DC/DC', start: '2023-03-20', end: '2023-04-07', progress: 100, deps: [{ id: 'k14' }] },
      { id: 'k16', section: 'g3', name: 'Simulation du nouveau transformateur DC/DC', start: '2023-04-10', end: '2023-04-28', progress: 90, deps: [{ id: 'k15' }] },
      { id: 'k17', section: 'g3', name: 'Achats des composants et PCB', start: '2023-05-01', end: '2023-05-19', progress: 60, deps: [{ id: 'k16' }] },
      { id: 'k18', section: 'g3', name: 'Fabrication du transformateur', start: '2023-05-22', end: '2023-06-09', progress: 30, deps: [{ id: 'k17' }] },

      { id: 'p1', section: 'g4', name: 'Période école octobre 2022', start: '2022-09-05', end: '2022-10-21', progress: 100 },
      { id: 'p2', section: 'g4', name: 'Période école novembre 2022', start: '2022-11-07', end: '2022-12-09', progress: 100 },
      { id: 'p3', section: 'g4', name: 'Vacances de Noël', start: '2022-12-19', end: '2023-01-02', progress: 100 },
      { id: 'p4', section: 'g4', name: 'Période école janvier 2023', start: '2023-01-09', end: '2023-02-10', progress: 100 },
      { id: 'p5', section: 'g4', name: 'Période école mars 2023', start: '2023-03-06', end: '2023-04-07', progress: 100 },

      { id: 'k22', section: 'g5', name: "Rédaction du brevet d'invention", start: '2023-02-13', end: '2023-03-03', progress: 100, deps: [{ id: 'k13' }] },
      { id: 'k19', section: 'g5', name: "Essais et vérification de la conformité au cahier des charges", start: '2023-06-12', end: '2023-06-23', progress: 0, deps: [{ id: 'k18' }] },
      { id: 'k20', section: 'g5', name: 'Améliorations', start: '2023-06-26', end: '2023-07-07', progress: 0, deps: [{ id: 'k19' }] },
      { id: 'k21', section: 'g5', name: 'Rapport de résultat du projet', start: '2023-07-03', end: '2023-07-14', progress: 0, deps: [{ id: 'k20' }] }
    ]
  };

  /* Jalons de l'exemple 2 : définis à part puis insérés au fil de l'eau.
     L'affichage est ensuite trié par date dans chaque groupe. */
  function jal(id, section, name, date, tag, deps) {
    return { id: id, section: section, name: name, start: date, end: date, milestone: true, tag: tag, deps: deps || [] };
  }
  EX.conduite.tasks.push(
    jal('j1',  'g1', 'Thème général retenu',        '2022-09-02', 'M1', [{ id: 'k1' }]),
    jal('j2',  'g1', 'Besoin validé',               '2022-09-16', 'M2', [{ id: 'k2' }]),
    jal('j3',  'g1', 'Cahier des charges figé',     '2022-09-30', 'M3', [{ id: 'k3' }]),
    jal('j5',  'g2', "État de l'art à jour",        '2022-12-02', 'M5', [{ id: 'k6' }]),
    jal('j6',  'g2', 'Convertisseur reçu',          '2022-12-16', 'M6', [{ id: 'k7' }]),
    jal('j7',  'g2', 'Modèle validé',               '2023-01-06', 'M7', [{ id: 'k8' }]),
    jal('j8',  'g2', 'Essai sous charge concluant', '2023-02-03', 'M8', [{ id: 'k10' }]),
    jal('j10', 'g4', 'Reprise janvier',             '2023-01-09', 'M10', []),
    jal('j11', 'g3', 'Conception figée',            '2023-03-24', 'M11', [{ id: 'k14' }]),
    jal('j12', 'g3', 'Simulation conforme',         '2023-04-28', 'M12', [{ id: 'k16' }]),
    jal('j13', 'g3', 'Composants livrés',           '2023-05-19', 'M13', [{ id: 'k17' }]),
    jal('j9',  'g5', 'Brevet déposé',               '2023-03-03', 'M9',  [{ id: 'k22' }]),
    jal('j4',  'g1', "État de l'art remis",         '2022-11-11', 'M4',  [{ id: 'k5' }])
  );

})();
