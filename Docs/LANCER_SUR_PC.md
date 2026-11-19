# Lancer PROJECT: INDUSTRIA sur votre PC

Durée : ~30 min la première fois (surtout les téléchargements), ~1 min ensuite.

## Étape 1 — Installer Unity (une seule fois)
1. Téléchargez et installez **Unity Hub** : https://unity.com/download
2. Ouvrez Unity Hub, connectez-vous (compte Unity gratuit, licence « Personal »).
3. Onglet **Installs** > **Install Editor** > choisissez la dernière **Unity 6 LTS** (6000.x).
   Les modules par défaut suffisent pour PC (« Windows Build Support (Mono) » est inclus sous Windows).
   Ajoutez **Android Build Support** si vous voulez plus tard tester sur téléphone.

## Étape 2 — Récupérer le jeu
**Sans Git (le plus simple)** : sur https://github.com/Zartrix222/Jeu, choisissez la branche
`claude/project-industria-game-dev-taddo4`, puis **Code > Download ZIP**, et décompressez le ZIP
dans un dossier sans accents ni espaces si possible, par exemple `C:\Jeux\ProjectIndustria`.

**Avec Git** :
```bash
git clone -b claude/project-industria-game-dev-taddo4 https://github.com/Zartrix222/Jeu.git ProjectIndustria
```

## Étape 3 — Ouvrir le projet
1. Unity Hub > **Projects** > **Add** > **Add project from disk** > sélectionnez le dossier décompressé
   (celui qui contient `Assets`, `Packages` et `ProjectSettings`).
2. Si Unity Hub signale qu'aucune version n'est associée, choisissez votre **Unity 6 LTS**.
3. Cliquez sur le projet. La première ouverture prend 5 à 15 minutes (import des packages).
   - Si Unity propose de **mettre à jour** des packages ou d'**activer l'Input System** : acceptez (Unity peut redémarrer).
   - Unity configure ensuite le projet tout seul (message `[Industria] Projet configuré` dans la Console)
     et ouvre la scène **Main**.

## Étape 4 — Jouer
- Cliquez sur **▶ Play** en haut de l'éditeur (ou menu **Industria > ▶ Jouer**).
  Le jeu démarre toujours sur la scène Main, quelle que soit la scène ouverte.
- Cliquez dans la vue **Game** pour capturer la souris. **Échap** libère la souris / ouvre le menu pause.
- Astuce : dans la vue Game, cochez **Maximize On Play** pour jouer en grand.

## Étape 5 (facultatif) — Créer un .exe autonome
Menu **Industria > Construire > Windows (PC)**. Le jeu est généré dans `Builds/Windows/ProjectIndustria.exe`
(dossier ouvert automatiquement). Ce dossier complet peut être copié et lancé sur n'importe quel PC Windows sans Unity.

## En cas de problème
1. Menu **Industria > Diagnostic** : la Console liste ce qui est OK et ce qui pose problème.
2. Menu **Industria > Configurer le projet** : relance toute la configuration.
3. Écran rose / objets roses : le pipeline URP n'est pas actif → **Industria > Configurer le projet**, puis relancez Play.
4. Envoyez-moi le contenu de la **Console** (messages rouges en priorité) : je corrige.

Les sauvegardes sont dans le dossier ouvert par **Industria > Sauvegardes > Ouvrir le dossier**.
