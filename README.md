# Usine Orbitale

Jeu d'usine automatisée en 3D pour téléphone (HTML5 + three.js, aucune installation).

Tu atterris sur la planète FX-7 avec un QG-rampe de lancement. Pose des foreuses sur les gisements,
relie-les par des convoyeurs à des fonderies, constructeurs et assembleuses, amène l'électricité avec
des pylônes, explore les épaves, et livre les pièces au QG pour franchir les 8 paliers jusqu'au
**Projet Ascension**.

## Jouer
- Ouvre `index.html` dans le navigateur du téléphone, ou active GitHub Pages sur ce dépôt.
- « Ajouter à l'écran d'accueil » installe le jeu en plein écran ; il reste jouable hors ligne
  après la première visite (`sw.js`, `manifest.webmanifest`, `vendor/three.min.js`).

## Commandes
- **Caméra** : un doigt pour se déplacer (mode Inspecter) ; deux doigts pour zoomer, tourner et se déplacer.
- **Construire** : choisir un bâtiment, régler le sens avec *Tourner*, toucher le sol (fantôme vert = valide).
- **Convoyeurs / tuyaux** : glisser le doigt pour tracer une ligne en L ; les virages se forment seuls.
- **Annuler** : bouton ↶ (ou Ctrl+Z).
- **Outils** : démolir une zone, copier une zone en plan, coller le plan (toucher deux fois pour confirmer).

## Contenu
- Monde 3D : ombres, cycle jour/nuit avec halos lumineux, pluie, lacs, montagnes, flore extraterrestre
- 6 ressources, gisements pauvres / normaux / riches, 10 épaves à fouiller
- 24 bâtiments : foreuses Mk1-3, extracteur de pétrole, fonderie, haut fourneau, constructeur, assembleuse,
  raffinerie, usine lourde, convoyeurs Mk1-3 (plusieurs objets par case, virages courbes), tuyaux,
  répartiteur, fusionneur, croisement, tunnels, conteneur, recycleur, pylônes, centrales
- Réseau électrique avec pylônes, câbles et zones de couverture
- 27 objets, 7 recettes alternatives, boutique de points du recycleur, surcadençage
- Copier/coller des réglages, plans, carte, statistiques, musique et sons générés par le code
- Production pendant l'absence (jusqu'à 15 min), export/import de la sauvegarde

## Progression
| Palier | À livrer |
|---|---|
| 1 Fondations | 60 plaques, 40 tiges |
| 2 Électrification | 120 vis, 80 plaques |
| 3 Câblage | 100 fils, 60 câbles, 60 béton |
| 4 Assemblage | 20 plaques renforcées, 15 rotors, 100 béton |
| 5 Âge de l'acier | 60 poutres, 60 tubes d'acier, 30 plaques renforcées |
| 6 Mécanique avancée | 20 cadres modulaires, 15 moteurs, 30 cristaux |
| 7 Pétrochimie | 120 plastique, 80 caoutchouc, 200 câbles |
| 8 Projet Ascension | 10 ordinateurs, 40 moteurs, 40 cadres → lancement ! |

`vendor/three.min.js` : three.js r128, licence MIT (`vendor/three.LICENSE`).
