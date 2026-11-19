# PROJECT: INDUSTRIA

Jeu de simulation industrielle en monde ouvert, en solo et en troisième personne, sur la planète **NEXUS-01**.
Explorez, extrayez, construisez librement en 3D et automatisez une civilisation industrielle.

- **Moteur** : Unity 6 (6000.x LTS) + Universal Render Pipeline (URP), C#
- **Cibles** : PC (développement) puis Android et iOS
- **Mode** : solo uniquement, hors ligne, sauvegardes locales (aucun serveur, aucun compte)
- **Version actuelle** : 0.1.1 — version présentable de l'ère 1 « Survie » ([journal](Docs/CHANGELOG.md))
- **Sauvegarde de la v0.1.0** : branche `backup/v0.1.0`

> **Pour jouer sur PC en 4 étapes : voir [Docs/LANCER_SUR_PC.md](Docs/LANCER_SUR_PC.md).**

---

## 1. Créer et ouvrir le projet dans Unity 6

### Prérequis
1. Installez **Unity Hub** : https://unity.com/download
2. Dans Unity Hub > *Installs* > *Install Editor*, installez **Unity 6 LTS (6000.x)**.
   Cochez les modules **Android Build Support** (avec OpenJDK + Android SDK/NDK) et, sur Mac, **iOS Build Support**.
3. Installez **Git** (https://git-scm.com).

### Récupérer le projet
```bash
git clone https://github.com/zartrix222/jeu.git ProjectIndustria
cd ProjectIndustria
git checkout claude/project-industria-game-dev-taddo4
```

### Ouvrir le projet
1. Unity Hub > *Projects* > **Add** > *Add project from disk* > sélectionnez le dossier `ProjectIndustria`.
2. Ouvrez-le avec Unity 6. Unity complète `ProjectSettings/` et importe les packages listés dans
   `Packages/manifest.json` (URP, Input System…). Comptez quelques minutes.
   Si Unity propose de mettre à jour la version d'URP vers celle de votre éditeur, acceptez.
3. À la première ouverture, le script `Industria > Configurer le projet` s'exécute **automatiquement** :
   - crée et assigne un asset URP si aucun pipeline n'est configuré ;
   - crée les matériaux de base dans `Assets/_Project/Resources/Materials` (indispensables aux builds) ;
   - règle le nom du produit, l'orientation paysage et les identifiants Android/iOS ;
   - ouvre la scène `Assets/_Project/Scenes/Main.unity` (fournie dans le dépôt).
   Vous pouvez le relancer à tout moment via le menu **Industria > Configurer le projet**.
4. Appuyez sur **Play** : le jeu démarre toujours sur la scène Main (ou menu **Industria > ▶ Jouer**).
5. Committez les fichiers générés (`ProjectSettings/`, `Packages/packages-lock.json`, scène, matériaux et leurs `.meta`).

> Si une fenêtre demande d'activer le nouveau système d'entrée (« Input System »), acceptez :
> le jeu fonctionne avec l'Input System **et** avec l'ancien Input Manager.

---

## 2. Commandes

| Action | Clavier / souris | Tactile (mobile) |
|---|---|---|
| Se déplacer | ZQSD / WASD / flèches | Joystick (moitié gauche de l'écran) |
| Regarder | Souris | Glisser (moitié droite) |
| Courir / Sauter | Maj / Espace | COURIR / SAUT |
| Miner | Maintenir **E** ou clic gauche sur un gisement | ACTION (maintenir) |
| Ouvrir une machine | **E** | UTILISER |
| Scanner | **C** | SCAN |
| Inventaire | **Tab** / I | INVENT. |
| Construire | **1–4** (barre) ou **B** | CONSTR. / barre |
| Placer / Pivoter | Clic gauche / **R** (45°) ou molette (15°) | ACTION / PIVOTER |
| Incliner (fondations) | **T** / **G**, **H** = réinitialiser | — |
| Démolir | **X** puis clic gauche | DÉMOLIR |
| Annuler / quitter un mode | Clic droit | ANNULER |
| Sauvegarder / Charger | **F5** / **F9** | Menu pause |
| Menu pause | Échap | MENU |
| Compteur de performances | **F3** | — |

## 3. Boucle de jeu (v0.1)

1. **Scanner** (C) pour révéler les gisements de fer et de cuivre.
2. **Miner** à la main du minerai de fer et de cuivre.
3. Construire une **Fonderie primitive** (12 minerais de fer + 6 de cuivre), y **déposer** le minerai, récupérer les lingots.
4. Construire une **Foreuse Mk1** sur un gisement (8 lingots de fer + 4 de cuivre).
5. Relier la sortie de la foreuse (orange) à l'entrée de la fonderie (bleue) avec un **Convoyeur** : la production devient automatique.
6. Poser des **Fondations** pour organiser l'usine.

Les objectifs guidés s'affichent en haut à gauche. Les machines continuent de produire même loin du joueur.

---

## 4. Organisation du dépôt

```
Assets/_Project/
  Resources/Data/        Contenu du jeu en JSON (objets, recettes, constructions, ères)
  Scripts/Simulation/    Cœur de simulation en C# pur (sans Unity) : inventaire, machines, convoyeurs, sauvegarde
  Scripts/Runtime/       Couche Unity : joueur, caméra, monde, construction, UI, entrées
  Scripts/Editor/        Outils éditeur (configuration automatique du projet)
Packages/manifest.json   Packages Unity
Docs/                    Architecture, feuille de route, journal de vérification
tools/                   Vérifications hors Unity (compilation + tests unitaires)
```

Voir [Docs/ARCHITECTURE.md](Docs/ARCHITECTURE.md), [Docs/ROADMAP.md](Docs/ROADMAP.md) et [Docs/VERIFICATION.md](Docs/VERIFICATION.md).

## 5. Vérifier le code sans Unity

```bash
# nécessite le SDK .NET 8
./tools/compile-check.sh
```
Compile tous les scripts contre des DLL de référence Unity (Input System et ancien Input Manager, éditeur inclus)
vérifie l'intégrité du projet (`.meta`, GUID, scène) et exécute les tests unitaires de la simulation.
