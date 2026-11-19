# Journal des versions

## 0.1.1 — Version présentable (préparation v0.2)
**Projet / ouverture**
- La scène `Main.unity` et `ProjectSettings/EditorBuildSettings.asset` sont désormais **dans le dépôt** (elles n'étaient créées qu'à l'ouverture dans Unity).
- Ouverture automatique de la scène Main ; **Play démarre toujours le jeu**, quelle que soit la scène ouverte.
- Menus : **Industria > ▶ Jouer**, **Diagnostic**, **Construire > Windows (PC)** / **Android (APK)**.
- Package `com.unity.test-framework` retiré (inutilisé, source possible de conflits de version).
- Outil `tools/check-project.py` : vérifie `.meta`, GUID, références de la scène, JSON.

**Graphismes** (aucune fonctionnalité retirée)
- Post-traitement URP : tonemapping ACES, bloom sur les éléments lumineux, étalonnage, vignette, anti-aliasing (SMAA PC / FXAA mobile).
- Cycle jour/nuit (24 min) avec couchers de soleil, nuit bleutée lisible ; l'heure est sauvegardée.
- Lac avec eau réfléchissante et rives sableuses.
- Végétation : pins, feuillus, arbres extraterrestres, buissons, rochers moussus, champignons bioluminescents, coulées de lave.
- Textures de terrain plus détaillées (256 px, 3 octaves).
- Machines plus détaillées (piliers, tuyaux en cuivre, vérins, bandes lumineuses) ; **fumée** de fonderie et **poussière** de foreuse quand elles travaillent.
- Fondations avec dalles quadrillées 1 m et bordure de sécurité.
- Objets sur convoyeurs : minerais en blocs rocheux, lingots en barres.
- Particules d'ambiance selon le biome (pollen, sable, cendres, lucioles la nuit).
- Léger élargissement du champ de vision en course ; ombres ajustées.
- **F3** : compteur de performances (FPS, pire image, nombre de machines).
- Mobile : résolution de rendu et distance d'ombre réduites automatiquement (builds uniquement).

**Compatibilité** : les sauvegardes v0.1 se chargent (test automatique ajouté).

## 0.1.0 — Première version jouable
Sauvegardée sur la branche `backup/v0.1.0` (commit `37b31ab`).
