# Gantt — planificateur local

Un outil de diagramme de Gantt en HTML/CSS/JS pur, fait pour un usage personnel :
pas de compte, pas de serveur, pas de collaborateur. On l'ouvre, on planifie, on
exporte une image pour le rapport.

```
GANTT/
├── index.html            la page
├── css/style.css         tout le style (thème clair + sombre, impression)
└── js/
    ├── model.js          données, dates, historique (annuler/rétablir), sauvegarde locale
    ├── exemples.js       deux jeux d'exemple (maison 18 mois, conduite d'action M1→M13)
    ├── view.js           rendu : en-tête, lignes, barres, jalons — deux calques SVG
    ├── interact.js       souris, clavier, presse-papiers, panneau de détails
    ├── export.js         enregistrer / ouvrir / exporter SVG, PNG / imprimer
    └── app.js            démarrage, barre d'outils, menu
```

## Ouvrir / enregistrer

Double-clic sur `index.html`. Tout fonctionne en local, sans réseau.

Pour rouvrir un planning : le bouton **Ouvrir** de la barre d'outils, `Ctrl+O`,
ou en **glissant** le fichier `.json` n'importe où dans la fenêtre.

`Ctrl+S` réécrit **le fichier ouvert** : plus de question à chaque fois. Pour
choisir un autre fichier : `Ctrl+Maj+S`, ou le menu `⋯` → *Enregistrer sous…*.
Si aucun fichier n'est encore associé (planning commencé à zéro, ou fichier
ouvert par glisser-déposer), le premier `Ctrl+S` demande où enregistrer, puis y
revient tout seul les fois suivantes.

Chaque modification est en plus conservée dans le navigateur et retrouvée au
rechargement — Ctrl+S n'est pas obligatoire pour ne rien perdre. Si le navigateur
n'offre pas le sélecteur de fichier (Firefox, Safari), le `.json` est téléchargé
à la place.

Servir le dossier reste possible et ne change rien :

```bash
cd ~/Documents/tempo/GANTT
python3 -m http.server 8765
# puis ouvrir http://localhost:8765/
```

## Geste de base

| Action | Comment |
|---|---|
| Déplacer une tâche | glisser la barre (aimantation au jour) |
| Changer la durée | glisser le bord gauche ou droit de la barre (les marques blanches qui apparaissent au survol) — ou les champs Début/Fin du panneau pour une barre d'un jour |
| Créer un lien de dépendance | survoler la barre, puis glisser le **rond bleu** vers une autre barre : la flèche se colle à la barre visée |
| Supprimer un lien | panneau de détails → croix sur le prédécesseur |
| Sélectionner | clic sur la barre ou sur la ligne ; Maj+clic = plage ; Ctrl+clic = ajouter/retirer |
| Renommer | **double-clic sur le nom**, où qu'il soit : dans le tableau, sur la barre, ou sur le libellé écrit à côté (et sur un jalon). `Entrée` valide, `Échap` annule. `F2` depuis le tableau |
| Panneau détaillé | un simple clic sur la barre ou sur la ligne ; `Entrée` place le curseur dans le champ Nom |
| Grouper | bouton « + Groupe » ; le groupe porte une couleur, ses membres l'héritent |
| Replier un groupe | la petite flèche ▾ devant son nom |
| Largeur des colonnes | glisser le séparateur vertical entre le tableau et le graphique |
| Choisir une date | champs Début/Fin du panneau : saisie libre (`2025-10-01`, `01/10/2025`, `1.10.2025`, `Entrée` valide) ou le bouton calendrier à droite du champ |
| Menu d'actions | **clic droit** sur une tâche, sur un groupe, ou dans le vide du graphique — renommer, dupliquer, copier, insérer une tâche au-dessus/en dessous, convertir en jalon, couleur du groupe, ajouter une tâche dans le groupe, supprimer |
| Supprimer un groupe | clic droit sur son en-tête → *Supprimer le groupe* : ses tâches passent au groupe voisin (demande confirmation s'il n'y a pas d'autre groupe) |
| Réordonner une ligne | glisser une ligne du tableau vers le haut ou le bas — une ligne bleue montre où elle va se poser. La tâche change de place, **et de groupe si on la lâche dans un autre**, mais ses dates ne bougent jamais |
| Réordonner les groupes | même geste sur l'en-tête d'un groupe : il prend la place du groupe visé, l'autre descend |

Le rond bleu de liaison est volontairement placé à une quinzaine de pixels du
bord de la barre : le bord sert à redimensionner, le rond à relier. Il
n'apparaît qu'au survol, jamais sur une barre simplement sélectionnée.

### Tracé des flèches

Quand la tâche suivante démarre après la fin de la précédente, la flèche fait un
simple coude en Z vers sa gauche. Quand elle démarre **avant** (les deux se
chevauchent), la flèche ne recule pas au milieu d'une ligne — elle passe par le
**goutte entre les deux lignes**, c'est-à-dire la ligne même qui sépare les deux
tâches : une barre fait ~20 px centrée dans une ligne de 34 px, donc cette bande
est la seule toujours libre de barres sur toute la largeur. La flèche descend de
la sortie, longe le séparateur vers l'arrière, puis ressort à 90° juste avant la
tâche et se branche sur son début.

Deux flèches qui reculent par le même goutte se superposent : c'est rare et sans
conséquence, mais ça explique une ligne qui semble porter deux liens.

## Clavier

| Raccourci | Effet |
|---|---|
| `Ctrl+S` | enregistrer (fichier `.json`) |
| `Ctrl+Maj+S` | enregistrer sous… |
| `Ctrl+O` | ouvrir un `.json` |
| `Ctrl+C` / `Ctrl+V` | copier / coller les tâches sélectionnées (liens internes compris) |
| `Ctrl+X` | couper |
| `Ctrl+D` | dupliquer à +7 jours |
| `Ctrl+A` | tout sélectionner |
| `Ctrl+Z` / `Ctrl+Y` | annuler / rétablir |
| `Ctrl+P` | imprimer (mise en page paysage, ajustée à la page) |
| `Ctrl` + molette | zoomer sur l'échelle de temps |
| `Alt` + glisser | dupliquer une tâche et la déplacer |
| `←` `→` | décaler d'un jour (`Ctrl` = une semaine) |
| `Maj+←` `Maj+→` | étirer la fin |
| `↑` `↓` | ligne précédente / suivante |
| `Suppr` | supprimer la sélection |
| `F2` | renommer la tâche sélectionnée sur place (Entrée valide, Échap annule) |
| `Alt+N` | nouvelle tâche |
| `Échap` | désélectionner |

Le `Ctrl+V` accepte aussi du texte venu d'ailleurs : une ligne par tâche,
`nom` puis éventuellement `début` et `fin` séparés par une tabulation ou un
point-virgule. Formats de date acceptés : `2025-10-01`, `01/10/2025`, `1.10.2025`.

## Exporter pour un rapport

Menu `⋯` :

- **JSON** — la sauvegarde complète, réouvrable ici.
- **SVG** — vectoriel, propre à n'importe quelle échelle. Directement utilisable
  en LaTeX : `\includegraphics{fichier.pdf}` après un `rsvg-convert -f pdf`.
- **PNG** — image ×2, pour un mail ou une diapositive.
- **Imprimer / PDF** — `Ctrl+P`, l'échelle se réajuste automatiquement à la page.

### Ce que font les exports sur un planning de plusieurs années

- **Cadrage serré.** À l'écran l'axe s'aligne sur les bornes de l'échelle (les mois
  au zoom mois), ce qui laisse jusqu'à un mois de vide de chaque côté. L'image
  exportée se recadre sur les dates réelles du projet : le contenu occupe toute
  la place et reste lisible.
- **Largeur plafonnée à 8 000 px.** Un projet de trois ans au zoom « jour » fait
  39 500 px de large : illisible une fois ouvert, et un canvas ne peut pas dépasser
  65 535 px (au-delà, l'image PNG sortait blanche). L'export réduit donc la densité
  au lieu de la taille du dessin.
- **Graduations selon la densité réelle.** L'axe ne se fie pas au nom de l'échelle
  mais au nombre de pixels par jour : au-delà de 16 px/jour il gradue les jours,
  6 px/jour les semaines, 1,6 px/jour les mois, et en dessous les trimestres. Un
  planning comprimé pour l'impression affiche ainsi des trimestres nets, au lieu
  d'un trait par jour et de noms de jours empilés.

## Fichier `.json`

Un objet simple, modifiable à la main :

```json
{
  "title": "Construction d'une maison — 18 mois",
  "zoom": "mois",
  "sections": [ { "id": "m1", "name": "Gros œuvre", "color": "ambre" } ],
  "tasks": [
    { "id": "g2", "name": "Fondations et semelles", "section": "m1",
      "start": "2026-07-27", "end": "2026-08-14", "progress": 100,
      "milestone": false, "color": null, "notes": "",
      "deps": [ { "id": "g1", "type": "FS" } ] }
  ]
}
```

- `start` / `end` sont inclusifs (`start = end` = une journée).
- `milestone: true` + `tag: "M4"` = un jalon (pastille carrée, durée nulle).
- `color` : `null` = la couleur du groupe. Sinon `azur`, `vert`, `violet`,
  `ambre`, `turquoise`, `rose`, `ardoise`, `rouge`.
- `deps` : liste des prédécesseurs (fin → début).

## Exemples fournis

Menu `⋯` → *Exemples* :

- **Construction d'une maison (18 mois)** — chargé au premier lancement. 5 lots
  (études & autorisations, gros œuvre, clos & couvert, lots techniques, second
  œuvre & finitions), 27 tâches, 6 jalons M1…M6, 31 liens. Un an et demi de
  chantier : c'est aussi le cas d'essai des longues périodes (axe, exports).
- **Conduite de l'action** — reproduction du modèle « propre » : jalons
  numérotés M1…M13, groupes colorés, flèches de dépendance.
  *Les dates de cet exemple sont reconstituées d'après la figure d'origine,
  elles ne sont pas vérifiées.*

## Ce que l'outil ne fait pas

- Pas de collaborateurs, pas de comptes, pas de serveur : les données ne
  quittent pas la machine.
- Le déplacement d'une tâche ne décale pas automatiquement ses suivantes
  (pas de recalcul de chaîne). Les flèches signalent le lien, à vous de
  déplacer.
- Un seul niveau de regroupement (groupes → tâches).
