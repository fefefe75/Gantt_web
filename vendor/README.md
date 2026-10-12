# Bibliothèques tierces embarquées

## jsPDF 4.2.1 — `jspdf.umd.min.js`

- Rôle : écrire un vrai fichier `.pdf` (texte vectoriel, sélectionnable) depuis
  la page, pour le bouton **Télécharger le PDF** des fiches.
- Source : <https://unpkg.com/jspdf@4.2.1/dist/jspdf.umd.min.js>
  (dépôt <https://github.com/parallax/jsPDF> — `parallax/jsPDF`, anciennement
  `MrRio/jsPDF`).
- Licence : MIT — le texte de licence est en tête du fichier, qui est recopié
  tel quel, sans modification.
- Embarqué et non chargé depuis un CDN : l'outil doit fonctionner en `file://`
  sans réseau, comme le reste.
- Taille : 420 165 octets.
- Intégrité (sha256 du fichier livré, recalculé sur cette machine après
  téléchargement) :

```
e6551fcdc32f09d6853b2c5126d18d01d9447e0da618a41a11ebeee0f6c20d54  jspdf.umd.min.js
```

### Ce que jsPDF ne sait pas faire, et qui a décidé du dessin

- Les 14 polices standard d'un PDF sont limitées à l'encodage WinAnsi : les
  accents français (é, è, à, ç, ô) passent, mais pas `☐`, `✓` ni `²`.
  Les cases à cocher sont donc **dessinées** (`rect`, `line`) et non écrites.
- `text()` ne coupe pas les lignes : le retour à la ligne passe par
  `splitTextToSize` et la pagination est calculée à la main.
- `html()` (rendu DOM → PDF) a été écarté : il dépend de `html2canvas`, il
  rasterise le texte (flou à l'impression, texte non sélectionnable) et
  ajouterait une seconde dépendance.

### L'autre chemin de PDF, sans dépendance

L'impression du navigateur (`Ctrl+P` → « Enregistrer au format PDF ») reste
disponible et donne le même document par le moteur du navigateur. Elle ne
dépend d'aucune bibliothèque : si ce dossier `vendor/` disparaît, tout le reste
de l'outil continue de fonctionner.
