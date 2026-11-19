# PROJECT: INDUSTRIA — Architecture technique

Document de référence. Il évolue avec le projet ; toute décision structurante y est consignée.

## 1. Cibles et contraintes

| Élément | Choix |
|---|---|
| Moteur | Unity 6 (LTS) |
| Rendu | URP, profil **Mobile** par défaut, profil **PC** pour l'éditeur |
| Langage | C# |
| Plateformes | Android (ARM64, Vulkan / GLES3), iOS (Metal) |
| Cible de performance | **30 FPS stables** sur un téléphone milieu de gamme récent, 60 FPS en option sur haut de gamme |
| Budget initial (à affiner après mesures réelles) | < 150 000 triangles visibles, < 150 draw calls (batches SRP), < 1,5 Go RAM |

Principe directeur : **le téléphone décide**. Une fonctionnalité qui ne tient pas le budget
sur un vrai appareil est simplifiée, pas « optimisée plus tard ».

## 2. Organisation des dossiers

Tout le contenu du jeu vit sous `Assets/_Project/` (le `_` le garde en tête de liste
et le sépare des packages / assets tiers importés).

```
Assets/
└── _Project/
    ├── Scripts/
    │   ├── Core/            # Bootstrap, services, événements, utilitaires (aucune dépendance gameplay)
    │   ├── Input/           # Lecture des entrées (tactile + manette + clavier) -> données simples
    │   ├── Player/          # Déplacement, état et animation du personnage
    │   ├── CameraSystem/    # Caméra troisième personne (Cinemachine 3)
    │   ├── UI/              # HUD, joystick virtuel, menus
    │   ├── Building/        # (plus tard) placement de bâtiments, grille, prévisualisation
    │   ├── Simulation/      # (plus tard) simulation d'usine par ticks, sans MonoBehaviour
    │   └── World/           # (plus tard) streaming du monde, ressources, biomes
    ├── Editor/              # Outils éditeur uniquement (jamais inclus dans le build)
    ├── Input/               # Fichier(s) .inputactions
    ├── Prefabs/
    ├── Scenes/
    │   ├── Boot.unity       # Scène de démarrage (services, réglages qualité)
    │   └── Sandbox.unity    # Terrain de test du personnage
    ├── Art/                 # Modèles, matériaux, textures, animations
    ├── Audio/
    └── Settings/            # Assets URP, profils de volume, ScriptableObjects de config
```

## 3. Assemblies (.asmdef)

Chaque dossier de scripts majeur a sa propre *Assembly Definition* :
compilation plus rapide (seul l'assembly modifié recompile) et dépendances explicites.

```
Industria.Core          ← ne dépend de rien du jeu
Industria.Input         → Core, Unity.InputSystem
Industria.Player        → Core, Input
Industria.CameraSystem  → Core, Input, Unity.Cinemachine
Industria.UI            → Core, Input
Industria.Simulation    → Core              (pur C#, testable sans scène)
Industria.Building      → Core, Simulation
Industria.Editor        → tout (Editor uniquement)
```

Règle : **pas de dépendance circulaire**, et `Simulation` ne connaît ni la caméra, ni l'UI, ni le joueur.

## 4. Principes de code

1. **Séparation entrée / logique** : les scripts gameplay ne lisent jamais `Touchscreen`
   ou `Keyboard` directement. Ils reçoivent des valeurs (`Vector2 move`, `Vector2 look`,
   `bool jump`) via un composant d'entrée. On peut ainsi changer de schéma de contrôle sans
   toucher au déplacement.
2. **Configuration dans des ScriptableObjects** (vitesse, gravité, sensibilité caméra) :
   réglable sans recompiler, partageable entre prefabs.
3. **Zéro allocation par frame** dans les boucles chaudes (`Update`) : pas de `new`,
   pas de LINQ, pas de concaténation de chaînes, pas de `GetComponent` répété.
4. **Peu de `Update()`** : à terme, les milliers de machines et convoyeurs ne seront
   **pas** des MonoBehaviour individuels (voir §6).
5. **Nommage** : namespaces `Industria.<Module>`, champs privés `_camelCase`,
   champs sérialisés `[SerializeField] private`.

## 5. Prototype du personnage (phase actuelle)

| Brique | Choix | Pourquoi |
|---|---|---|
| Collision / déplacement | `CharacterController` | Pas de physique Rigidbody coûteuse, contrôle précis, standard et éprouvé |
| Entrées | Input System + fichier `.inputactions` | Gère tactile, manette et clavier avec les mêmes actions |
| Contrôles tactiles | Joystick virtuel à gauche, zone de glissé à droite pour la caméra, bouton saut | Schéma attendu sur mobile |
| Caméra | Cinemachine 3 (`CinemachineCamera` + Orbital Follow / Third Person Follow + Deoccluder) | Collisions caméra, amortissement, gratuit et maintenu par Unity |
| Animation | Animator avec un blend tree de locomotion (plus tard, quand un modèle existe) | Le prototype commence avec une capsule |

Le déplacement est **relatif à la caméra** : pousser le joystick vers le haut fait
avancer le personnage dans la direction où regarde la caméra.

## 6. Vision long terme (pour ne pas se bloquer plus tard)

Ces systèmes ne seront **pas** codés maintenant, mais la structure ci-dessus leur laisse leur place.

- **Simulation d'usine par ticks** : la production et le transport tournent à fréquence fixe
  (ex. 10 ticks/s) dans des structures de données compactes (tableaux), indépendamment du
  framerate. Le rendu ne fait que *lire* l'état.
- **Rendu en masse** : objets sur convoyeurs dessinés via `Graphics.RenderMeshInstanced`
  (GPU instancing) plutôt que des GameObjects ; machines identiques regroupées pour le
  SRP Batcher / GPU Resident Drawer quand disponible sur la cible.
- **Monde ouvert** : découpage en chunks chargés/déchargés autour du joueur (scènes
  additives ou Addressables), LOD systématiques, occlusion culling, distance de rendu
  ajustable par niveau de qualité.
- **Sauvegarde** : état de la simulation sérialisé à part des scènes (format versionné).
- **Qualité adaptative** : niveaux Bas / Moyen / Haut, résolution de rendu dynamique
  (Render Scale URP), surveillance thermique (package *Adaptive Performance*).

## 7. Feuille de route

| Étape | Contenu | Statut |
|---|---|---|
| 0 | Dépôt Git, `.gitignore`, `.gitattributes`, documentation | ✅ fait |
| 1 | Création du projet Unity 6 URP + réglages Android/iOS | ⏳ en cours (sur ton PC) |
| 2 | Arborescence `_Project`, assemblies, scène Sandbox (sol, capsule) | — |
| 3 | Input System : actions Move / Look / Jump / Sprint (clavier + manette) | — |
| 4 | Contrôleur du personnage (CharacterController, gravité, saut) | — |
| 5 | Caméra troisième personne Cinemachine | — |
| 6 | Contrôles tactiles (joystick, zone caméra, bouton saut) | — |
| 7 | Premier build Android + mesure des perfs sur ton téléphone | — |

Chaque étape se termine par une vérification concrète (dans l'éditeur ou sur téléphone)
avant de passer à la suivante.
