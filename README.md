# Gantt — planificateur local

Un outil de suivi de projet en HTML/CSS/JS pur, fait pour un usage personnel :
pas de compte, pas de serveur, pas de collaborateur. On l'ouvre, on planifie, on
remplit ses fiches de suivi, on sort un PDF pour le rendez-vous.

Trois vues dans la même page :

| Vue | Ce qu'on y fait |
|---|---|
| **Gantt** | planifier : tâches, groupes, jalons, dépendances, avancement |
| **Tâches & affiliées** | ce qu'il reste à faire sur chaque tâche, qu'on coche au fil de l'eau |
| **Fiches & PDF** | la fiche de suivi et le REX à remplir, à sortir en PDF (à champs ou figée) ou en JSON |

```
GANTT/
├── index.html            la page et les trois vues
├── css/style.css         tout le style (thème clair + sombre, impression)
├── vendor/
│   ├── pdf-lib.min.js    pdf-lib 1.17.1 (MIT) — écrit le PDF remplissable
│   └── README.md         provenance, condensat, licence
└── js/
    ├── model.js          données, dates, historique (annuler/rétablir), sauvegarde locale
    ├── exemples.js       deux jeux d'exemple (maison 18 mois, conduite d'action M1→M13)
    ├── view.js           rendu du Gantt : en-tête, lignes, barres, jalons — deux calques SVG
    ├── interact.js       souris, clavier, presse-papiers, panneau de détails
    ├── export.js         enregistrer / ouvrir / exporter SVG, PNG / JSON d'une fiche
    ├── vue-taches.js     la vue des tâches affiliées
    ├── vue-fiches.js     la vue des fiches (feuille A4 à remplir)
    ├── pdf-fiche.js      la fiche en PDF remplissable (champs AcroForm, pdf-lib)
    ├── vues.js           les onglets, la bascule de vue, le format d'impression
    └── app.js            démarrage, barre d'outils, menu
```

## Le dossier, pas le fichier

C'est **un dossier**, pas une page isolée : copier `index.html` seul donne une
page blanche. Pour l'emporter ailleurs, copier le dossier entier (`css/`, `js/`,
`vendor/` compris).

## Ouvrir / enregistrer

Double-clic sur `index.html`. Tout fonctionne en local, sans réseau.

Pour rouvrir un planning : le bouton **Ouvrir** de la barre d'outils, `Ctrl+O`,
ou en **glissant** le fichier `.json` n'importe où dans la fenêtre.

`Ctrl+S` réécrit **le fichier ouvert** : plus de question à chaque fois. Pour
choisir un autre fichier : le bouton **Enregistrer sous** de la barre d'outils,
`Ctrl+Maj+S`, ou le menu `⋯` → *Enregistrer sous…*. Si aucun fichier n'est encore
associé (planning commencé à zéro, ou fichier ouvert par glisser-déposer), le
premier `Ctrl+S` demande où enregistrer, puis y revient tout seul les fois
suivantes.

Le fichier `.json` contient **tout** : le titre, les groupes, les tâches avec
leurs dates et leurs liens, les jalons, les tâches affiliées (nom et case
cochée) et les fiches complètes avec leurs lignes et leurs avis. Le message
affiché après l'enregistrement le dit en clair — `33 tâches dont 6 jalons,
1 affiliée, 1 fiche` — pour qu'on n'ait pas à le deviner. Et il se relit :
rechargé dans un état vide, il redonne exactement ce qu'il portait (vérifié :
mêmes tâches, mêmes affiliées cochées, même fiche, même lien de jalon).

Le planning **et** les fiches sont donc dans le même fichier : un seul document
à sauvegarder, un seul à rouvrir. Chaque modification est en plus conservée dans
le navigateur et retrouvée au rechargement — `Ctrl+S` n'est pas obligatoire pour
ne rien perdre. Si le navigateur n'offre pas le sélecteur de fichier (Firefox,
Safari), le `.json` est téléchargé dans `~/Téléchargements`.

Servir le dossier reste possible et ne change rien :

```bash
cd ~/Documents/tempo/GANTT
python3 -m http.server 8765
# puis ouvrir http://localhost:8765/
```

## Geste de base (vue Gantt)

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

## Vue « Tâches & affiliées »

Une tâche du Gantt a des dates ; le travail qu'il y a **dedans** n'en a pas.
C'est une **tâche affiliée** : une ligne à cocher, rattachée à une tâche du
planning, qui n'apparaît pas dans le Gantt. Un jalon peut en avoir, une tâche
ordinaire aussi — c'est justement là que se cachent les choses qu'on oublie.

| Action | Comment |
|---|---|
| Ouvrir la vue | onglet **Tâches & affiliées**, menu `⋯` → *Tâches & affiliées*, ou `Ctrl+2` |
| Ajouter une affiliée | « + tâche affiliée » sous la tâche ; le curseur se place dans la ligne |
| Cocher | la case devant la ligne — la ligne se barre, le compteur se met à jour |
| Retirer | la croix à droite de la ligne |
| Replier une tâche | la flèche ▾ en bout de ligne |
| Renommer la tâche du planning | taper dans son nom, en haut de la carte (`Entrée` valide) |
| Reporter sur le Gantt | « **↺ avancement** » écrit dans la tâche l'avancement déduit des affiliées cochées (2 lignes cochées sur 5 → 40 %) |
| Imprimer | « Imprimer la liste » : sort la liste complète, cases comprises, sans les boutons |

Le compteur de la vue (`3 / 12 tâches affiliées faites`) et le badge de la tâche
(`2/5`, vert quand tout est fait) donnent l'état en un coup d'œil.

## Vue « Fiches & PDF »

Deux types de fiche :

- la **fiche de suivi** : une par rendez-vous. Ce que j'ai fait (avec la preuve),
  ce que je propose, ce que le tuteur en pense, ce qu'il demande.
- le **REX** : un fait observé, son effet, sa cause, ce qu'on en change.

Deux colonnes ne veulent jamais dire la même chose :

- **« je garde cette idée »** est **ma** case — c'est mon tri à moi ;
- **« d'accord / d'accord avec réserves / pas d'accord »** est la case du
  **tuteur**, avec sa remarque juste à côté.

| Action | Comment |
|---|---|
| Créer | « + Suivi » ou « + REX » en haut de la liste de gauche |
| Remplir | tout se tape sur la feuille ; chaque champ est enregistré au fil de la frappe |
| Passer d'une fiche à l'autre | clic dans la liste de gauche |
| Ajouter une ligne | « + proposition », « + ligne », « + demande » sous chaque tableau |
| Retirer une ligne | la croix à droite de la ligne |
| Dupliquer | « Dupliquer » : reprend l'en-tête du projet et vide les lignes — c'est la fiche du rendez-vous suivant |
| **PDF à remplir** | écrit un `.pdf` **à champs** : le tuteur coche, tape, ajoute et enregistre dans son lecteur PDF |
| **Imprimer (figée)** | la même feuille **sans champs**, à imprimer ou à poser dans Confluence |
| **Exporter / Importer en JSON** | la fiche seule, en clair, modifiable dans un éditeur de texte |

### Le PDF à remplir

Le fichier produit n'est pas une image de la fiche : c'est un **formulaire**.
Ce que j'ai saisi part *dans* les champs, donc le tuteur peut le corriger, cocher
les états (« terminé / en cours / reporté »), changer son avis, écrire dans les
lignes vides — chaque tableau en garde au moins trois — et taper ses remarques et
ses demandes dans le grand cadre du bas. Il lui faut seulement un lecteur PDF
(Acrobat, Firefox, Okular, Aperçu) : ni cet outil, ni réseau.

Mesuré sur la fiche de suivi d'exemple : **48 champs** (31 de texte, 17 cases et
choix exclusifs) sur 2 pages A4 ; le REX en compte 24 sur une page. Vérifié avec
pypdf — un autre moteur que celui qui écrit le fichier : les champs se relisent,
se modifient et se réenregistrent.

**Confluence ne remplit pas un PDF.** Son aperçu affiche le document ; pour le
modifier on passe par « Modifier » (qui ouvre l'Atlassian Companion, télécharge
le fichier dans l'application locale, puis le renvoie comme nouvelle version) ou
par un téléchargement classique. Atlassian documente en plus un défaut
d'affichage sur les champs **déjà remplis** dans l'aperçu
([CONFSERVER-99121](https://jira.atlassian.com/browse/CONFSERVER-99121)) — d'où
le second bouton : « Imprimer (figée) » produit un PDF sans champs, qui s'affiche
proprement dans Confluence, et c'est celui-là qu'on joint à une page quand le
tuteur n'a rien à remplir. Les deux portent le même nom, à l'extension près.

L'aperçu à l'écran et l'impression sont le même document : ce qui s'imprime est
exactement ce qui est affiché.

### Le JSON d'une fiche

« Exporter en JSON » écrit la fiche seule, dans
`suivi_projet_<projet>_fiche-<type>-<n°>_<date>.json`. C'est le même objet que
dans le fichier du planning : rien ne se perd à l'aller-retour. On l'ouvre dans
n'importe quel éditeur de texte, on corrige une valeur, on ajoute une ligne à la
main, et « Importer un JSON » le reprend dans l'outil — une fiche déjà connue est
remplacée, une fiche inconnue s'ajoute. Déposer le fichier dans la fenêtre
fonctionne aussi.

## Les jalons : la fiche et le Gantt au même endroit

Chaque ligne d'une fiche (ce que j'ai fait, ce que je propose, ce que le tuteur
demande) peut viser un **jalon du Gantt**. La liste des jalons n'est jamais
recopiée ailleurs : elle est lue dans le planning, avec le nom et la date du
moment.

| Geste | Effet |
|---|---|
| Choisir un jalon sur une ligne | la ligne est rattachée à `M2`, par exemple |
| Lire la fiche | elle affiche `M2 · Permis accordé — 22/05`, relu dans le Gantt à chaque affichage |
| Renommer ou déplacer le jalon dans le Gantt | **la fiche suit toute seule** : même lien, nouveau libellé |
| « **↦ Gantt** » sur une proposition | crée la tâche dans le Gantt sous le jalon choisi : même groupe, même date de départ, et un lien de dépendance vers le jalon |
| Après le transfert | la fiche affiche `dans le Gantt : <nom de la tâche> — dates (avancement)` |

Si le jalon disparaît du Gantt, la fiche écrit `M2 (jalon absent du Gantt)`
plutôt que d'inventer une date. Si la tâche créée est supprimée du Gantt, elle
écrit `tâche supprimée du Gantt` — le lien ne ment jamais.

Dans la vue **Tâches & affiliées**, chaque tâche rappelle les jalons dont elle
dépend (`après M1, M2`) : le lien se lit aussi côté planning.

## Clavier

| Raccourci | Effet |
|---|---|
| `Ctrl+1` / `Ctrl+2` / `Ctrl+3` | vue Gantt / Tâches / Fiches |
| `Ctrl+S` | enregistrer (fichier `.json`) |
| `Ctrl+Maj+S` | enregistrer sous… |
| `Ctrl+O` | ouvrir un `.json` |
| `Ctrl+C` / `Ctrl+V` | copier / coller les tâches sélectionnées (liens internes compris) |
| `Ctrl+X` | couper |
| `Ctrl+D` | dupliquer à +7 jours |
| `Ctrl+A` | tout sélectionner |
| `Ctrl+Z` / `Ctrl+Y` | annuler / rétablir (le Gantt, les affiliées et les fiches) |
| `Ctrl+P` | imprimer la vue affichée (choisir « Enregistrer au format PDF ») |
| `Ctrl` + molette | zoomer sur l'échelle de temps |
| `Alt` + glisser | dupliquer une tâche et la déplacer |
| `←` `→` | décaler d'un jour (`Ctrl` = une semaine) |
| `Maj+←` `Maj+→` | étirer la fin |
| `↑` `↓` | ligne précédente / suivante |
| `Suppr` | supprimer la sélection (vue Gantt uniquement) |
| `F2` | renommer la tâche sélectionnée sur place (Entrée valide, Échap annule) |
| `Alt+N` | nouvelle tâche |
| `Échap` | désélectionner, ou quitter le champ en cours |

Les raccourcis de tâches ne s'appliquent que dans la vue Gantt : dans une fiche,
`Suppr` efface du texte, il ne supprime pas une tâche restée sélectionnée.

Le `Ctrl+V` accepte aussi du texte venu d'ailleurs : une ligne par tâche,
`nom` puis éventuellement `début` et `fin` séparés par une tabulation ou un
point-virgule. Formats de date acceptés : `2025-10-01`, `01/10/2025`, `1.10.2025`.

## Exporter pour un rapport

Menu `⋯` :

- **JSON** — la sauvegarde complète, réouvrable ici.
- **SVG** — vectoriel, propre à n'importe quelle échelle. Directement utilisable
  en LaTeX : `\includegraphics{fichier.pdf}` après un `rsvg-convert -f pdf`.
- **PNG** — image ×2, pour un mail ou une diapositive.
- **Imprimer la vue affichée** — `Ctrl+P`, l'échelle se réajuste à la page.

Formats d'impression, posés automatiquement selon la vue : **A3 paysage** pour le
Gantt (pour que la frise reste lisible), **A4 portrait** pour la liste des tâches
et pour les fiches.

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
  "app": "gantt-local",
  "version": 2,
  "title": "Construction d'une maison — 18 mois",
  "zoom": "mois",
  "sections": [ { "id": "m1", "name": "Gros œuvre", "color": "ambre" } ],
  "tasks": [
    { "id": "g2", "name": "Fondations et semelles", "section": "m1",
      "start": "2026-07-27", "end": "2026-08-14", "progress": 100,
      "milestone": false, "color": null, "notes": "",
      "subs": [ { "id": "a1", "name": "Décaisser et évacuer", "fait": true } ],
      "deps": [ { "id": "g1", "type": "FS" } ] }
  ],
  "fiches": [
    { "id": "f1", "type": "suivi", "projet": "…", "numero": "1",
      "periode": "du 6 au 12 octobre", "date": "2026-10-12", "auteur": "",
      "fait":     [ { "id": "l1", "texte": "", "jalon": "", "preuve": "", "etat": "", "vu": false } ],
      "idees":    [ { "id": "l2", "texte": "", "pourquoi": "", "jalon": "M2", "tache": "",
                      "retenu": false, "avis": "", "remarque": "" } ],
      "demandes": [ { "id": "l3", "texte": "", "echeance": "", "jalon": "", "tache": "",
                      "fait": false } ],
      "rex":      [],
      "avis": { "accord": "", "remarque": "", "vu": false, "nom": "", "date": "" } }
  ]
}
```

- `start` / `end` sont inclusifs (`start = end` = une journée).
- `milestone: true` + `tag: "M4"` = un jalon (pastille carrée, durée nulle).
- `color` : `null` = la couleur du groupe. Sinon `azur`, `vert`, `violet`,
  `ambre`, `turquoise`, `rose`, `ardoise`, `rouge`.
- `deps` : liste des prédécesseurs (fin → début).
- `subs` : les tâches affiliées (libellé + case cochée). Ni dates, ni Gantt.
- `fiches` : les fiches du projet. `type` vaut `suivi` ou `rex`. Dans une ligne
  « fait », `etat` prend `termine`, `encours` ou `reporte` ; dans une idée, `avis`
  prend `ok`, `reserves` ou `non`.
- `jalon` porte **l'étiquette** du jalon visé (`M2`), jamais son nom : renommer
  le jalon dans le Gantt ne casse donc pas le lien. `tache` porte l'identifiant
  de la tâche créée dans le Gantt quand la proposition y passe (`↦ Gantt`).
- Un fichier sans `subs` ni `fiches` se charge quand même : les deux manquants
  démarrent vides.

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
  quittent pas la machine. Un tuteur qui doit cocher reçoit donc le PDF imprimé
  ou la fiche sous les yeux, pas un lien à ouvrir.
- Le déplacement d'une tâche ne décale pas automatiquement ses suivantes
  (pas de recalcul de chaîne). Les flèches signalent le lien, à vous de
  déplacer.
- Un seul niveau de regroupement (groupes → tâches), et un seul niveau
  d'affiliation (tâche → tâches affiliées).
- Ce qui est coché à la main sur un PDF ne remonte pas dans l'outil : le PDF est
  une sortie, pas une entrée. Le retour passe par le **JSON** (Importer un JSON)
  ou par la ressaisie ici.
- L'aperçu de Confluence ne sait pas remplir un PDF, et Atlassian documente un
  affichage fautif des champs déjà remplis dans cet aperçu : joindre de
  préférence la version **figée** pour la lecture, et envoyer la version
  **à remplir** au tuteur.
- `showSaveFilePicker` n'existe ni dans Firefox ni dans Safari : le « Ctrl+S qui
  réécrit le fichier ouvert » y retombe en téléchargement d'une copie. Tout le
  reste — glisser, raccourcis, exports, PDF, JSON — est identique.

## Bibliothèques embarquées

`vendor/pdf-lib.min.js` — **pdf-lib 1.17.1**, licence MIT, 525 099 octets,
empreinte et provenance détaillées dans `vendor/README.md`. Il sert uniquement
au bouton « PDF à remplir » : les champs d'un PDF (texte, cases, choix exclusifs)
ne s'écrivent pas à la main sans lui. Si le dossier `vendor/` disparaît, l'outil
fonctionne toujours : ce bouton annonce alors qu'il faut passer par « Imprimer ».

Aucune autre dépendance : ni police, ni icône, ni image distante.
