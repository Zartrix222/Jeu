# Architecture technique

## Principes
- **Simulation séparée du rendu.** Toute la logique d'usine (machines, convoyeurs, inventaires, recettes)
  vit dans l'assembly `Industria.Simulation`, en C# pur (`noEngineReferences: true`). Elle est testée hors Unity
  (`tools/SimulationTests`) et avance à pas fixe (20 ticks/s), indépendamment de la caméra et de la distance au joueur :
  **les machines tournent partout, tout le temps.**
- **Données, pas code.** Objets, recettes, constructions et ères sont décrits en JSON (`Resources/Data`).
  Ajouter une machine = ajouter une entrée JSON (+ un archétype visuel si besoin).
- **Petits scripts, une responsabilité chacun.** Aucun « script géant » : le plus gros fichier est le contrôleur de construction.
- **Racine de composition unique.** `GameRoot` crée les systèmes et les relie ; les systèmes ne se cherchent pas
  entre eux via `Find`.
- **Mobile d'abord.** Pas d'allocation par objet transporté (rendu instancié), terrain 513², 4 couches,
  culling LOD de la végétation, simulation découplée du framerate.

## Assemblies
| Assembly | Dépend de | Rôle |
|---|---|---|
| `Industria.Simulation` | — | Logique pure : `Inventory`, `ItemRegistry`, `RecipeRegistry`, `Machine`, `ExtractorMachine`, `ProcessorMachine`, `ConveyorBelt`, `FactorySimulation`, DTO de sauvegarde |
| `Industria.Runtime` | Simulation, Input System | MonoBehaviours et vues Unity |
| `Industria.Editor` | Runtime, URP | Configuration automatique du projet |

## Systèmes runtime (`Scripts/Runtime`)
| Dossier | Contenu |
|---|---|
| `Core/` | `GameRoot` (flux de jeu : menu, nouvelle partie, chargement, pause), `ObjectiveTracker`, `NotificationService`, couches physiques |
| `Content/` | `ContentLoader` : JSON → `ContentDatabase` (+ validation des références croisées) |
| `Input/` | `GameInput` (point d'entrée unique), backends Input System / ancien Input Manager, `TouchControls` (joystick + boutons) |
| `Player/` | `PlayerController` (CharacterController), `ThirdPersonCamera` (orbite + collisions), `PlayerInteractor` (minage, interaction), `PlayerAvatar` |
| `World/` | `WorldShape` (relief + biomes), `TerrainBuilder`, `ResourceNodeSpawner`, `VegetationSpawner`, `EnvironmentSetup` |
| `Factory/` | `FactoryWorld` (pont simulation ↔ scène, sauvegarde), vues `BuildingView` / `ConveyorView` / `PortView`, visuels, rendu instancié des objets |
| `Building/` | `BuildModeController` (placement, rotations, accroche fondations / gisements / ports, démolition), `BuildGhost` |
| `Scanner/` | Scanner de gisements |
| `Save/` | `SaveSystem` : JSON local, écriture atomique + copie de secours |
| `UI/` | HUD IMGUI (prototype) : barre d'outils, inventaire, panneau machine, menus, contrôles tactiles |

## Flux d'un objet
`ExtractorMachine` produit → pousse dans le `ConveyorBelt` branché sur son port de sortie →
le tapis fait avancer les objets (espacement minimal, blocage en bout) → l'objet est inséré dans
`ProcessorMachine` (recette choisie automatiquement au premier objet) → lingots en sortie → convoyeur suivant ou joueur.

## Sauvegarde
`Application.persistentDataPath/Saves/partie_1.json` (+ `.bak`). Contient : graine du monde, joueur, inventaire,
bâtiments (position, rotation, gisement, état machine), convoyeurs (extrémités, connexions, objets transportés),
objectifs. Le monde est régénéré de façon déterministe à partir de la graine. Sauvegarde auto toutes les 3 min,
à la mise en arrière-plan (mobile) et à la fermeture.

## Conventions
- Pivot des bâtiments : centre bas, +Z = avant. Ports déclarés en espace local dans `buildables.json`.
- Le joueur et les fantômes de construction sont sur la couche `Ignore Raycast` (seules les couches intégrées
  à Unity sont utilisées, aucun réglage du TagManager n'est nécessaire).
- Nouveaux fichiers dans `Assets/` : lancer `python3 tools/generate-meta.py` pour créer des `.meta` à GUID stables.
