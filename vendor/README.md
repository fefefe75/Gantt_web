# Bibliothèques tierces embarquées

## pdf-lib 1.17.1 — `pdf-lib.min.js`

- Rôle : écrire la fiche en **PDF remplissable** (formulaire AcroForm) — des
  champs de texte, des cases à cocher et des choix exclusifs que le tuteur
  remplit dans son lecteur PDF, sans l'outil et sans réseau.
- Source : <https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js>
  (dépôt <https://github.com/Hopding/pdf-lib>).
- Licence : MIT — le texte est recopié tel quel, sans modification.
- Taille : 525 099 octets.
- Intégrité (sha256, recalculé sur cette machine après téléchargement) :

```
0f9a5cad07941f0826586c94e089d89b918c46e5c17cf2d5a3c6f666e3bc694f  pdf-lib.min.js
```

- Embarqué et non chargé depuis un CDN : l'outil doit fonctionner en `file://`
  sans réseau, comme le reste.

### Pourquoi pdf-lib, et pas un autre

| Bibliothèque | Verdict |
|---|---|
| **pdf-lib** | écrit de vrais champs AcroForm (texte, case, radio, liste) en plus du dessin. Retenue. |
| jsPDF 4.2.1 | dessine très bien, mais **ne sait pas créer de champ** : un PDF jsPDF ne se remplit pas. Écartée (elle a servi à la première version, dans l'historique git). |
| html2pdf.js / html2canvas | rasterise la page : le texte devient une image (flou, non sélectionnable, non modifiable) et ajoute une dépendance. Écartée. |

### Ce que la norme impose, et qui a décidé du dessin

- Les 14 polices standard d'un PDF n'ont ni `☐` ni `✓` : les cases à cocher et
  les choix exclusifs sont donc des **champs**, jamais des caractères. Les
  accents français, eux, passent sans problème.
- Un lecteur PDF n'exécute pas de JavaScript ici (et Confluence le retire à
  l'upload) : aucun champ ne dépend d'un script.
- `form.enableMultiline()` remet la taille de police en automatique — sans
  `setFontSize()` après `addToPage()`, le lecteur étire le texte jusqu'à
  remplir le cadre (mesuré : des remarques écrites en 30 pt).
- Dans pdf-lib, `y` est le **coin bas** d'un champ : passer la coordonnée haute
  place la case une ligne au-dessus de son libellé.

### L'autre chemin de PDF, sans dépendance

L'impression du navigateur (`Ctrl+P` → « Enregistrer au format PDF », bouton
**Imprimer (figée)**) donne la même feuille **sans champs**. Aucune
bibliothèque n'est nécessaire : si ce dossier `vendor/` disparaît, tout le
reste de l'outil fonctionne et ce bouton annonce de passer par l'impression.
