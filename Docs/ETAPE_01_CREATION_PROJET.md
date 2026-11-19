# Étape 1 — Créer le projet Unity depuis zéro

> Statut : **à faire sur ton PC**. On ne passe pas à l'étape 2 tant que la
> section « Vérification » en bas n'est pas validée.

## 1.1 Installer les outils

1. **Unity Hub** : https://unity.com/download → installe et connecte-toi avec un compte Unity (licence Personal gratuite).
2. **Éditeur Unity 6** : dans Unity Hub → *Installs* → *Install Editor* → onglet *Official releases* → choisis la **dernière version Unity 6 marquée « LTS »** (numéro en `6000.x.y`). Prends une LTS : c'est la branche stable maintenue.
3. Au moment de l'installation, coche les **modules** :
   - **Android Build Support**, avec ses sous-modules **OpenJDK** et **Android SDK & NDK Tools** (indispensables, ne pas les décocher).
   - **iOS Build Support**.
   - **Microsoft Visual Studio Community** (si tu n'as pas déjà Visual Studio ou JetBrains Rider).
4. **Git** + **Git LFS** :
   - Windows : https://git-scm.com (Git LFS est inclus dans l'installeur).
   - Puis, une seule fois, dans un terminal : `git lfs install`
   - Si tu préfères une interface graphique : **GitHub Desktop** fonctionne très bien aussi.

> ⚠️ **iOS** : Unity sur Windows peut *préparer* un projet iOS (un projet Xcode),
> mais la compilation finale vers iPhone **exige un Mac avec Xcode** et un compte
> Apple Developer (99 $/an pour publier). On développera et testera d'abord sur
> Android ; iOS viendra plus tard, sans rien changer à l'architecture.

## 1.2 Récupérer le dépôt Git sur ton PC

```bash
# Choisis un chemin court, SANS espaces ni accents (Unity et Gradle n'aiment pas ça)
cd C:\Dev
git clone https://github.com/zartrix222/Jeu.git Industria
cd Industria
git checkout claude/industria-mobile-setup-5hmwyi
```

Le dossier `C:\Dev\Industria` contient pour l'instant : `README.md`, `Docs/`, `.gitignore`, `.gitattributes`.

## 1.3 Créer le projet Unity avec le template URP

Unity Hub refuse de créer un projet dans un dossier non vide. On le crée donc à côté, puis on le déplace dans le dépôt :

1. Unity Hub → *Projects* → **New project**.
2. Éditeur : ta version **Unity 6 LTS**.
3. Template : **Universal 3D** (c'est le template URP ; télécharge-le si Hub le demande).
4. Nom du projet : `IndustriaTemp` — Emplacement : `C:\Dev`.
5. Décoche « Connect to Unity Cloud » / « Use Unity Version Control » (on utilise Git).
6. **Create project**, attends l'ouverture complète de l'éditeur, puis **ferme Unity**.
7. Dans l'explorateur Windows, **déplace** ces 3 dossiers de `C:\Dev\IndustriaTemp` vers `C:\Dev\Industria` :
   - `Assets`
   - `Packages`
   - `ProjectSettings`

   (Ne déplace pas `Library`, `Logs`, `Temp`, `UserSettings` : ils sont régénérés.)
8. Supprime `C:\Dev\IndustriaTemp`.
9. Unity Hub → *Projects* → **Add** → *Add project from disk* → sélectionne `C:\Dev\Industria`. Ouvre-le (la première ouverture réimporte tout, c'est normal que ce soit long).

## 1.4 Réglages initiaux (Edit → Project Settings)

### a) Plateforme
*File → Build Profiles* → sélectionne **Android** → **Switch Platform**.

### b) Player (onglet Android 🤖)
| Réglage | Valeur |
|---|---|
| Company Name | ton nom ou studio (ex. `ZartrixStudio`) |
| Product Name | `PROJECT INDUSTRIA` |
| Other Settings → Rendering → Color Space | **Linear** |
| Other Settings → Auto Graphics API | **décoché**, liste : **Vulkan** puis **OpenGLES3** |
| Other Settings → Identification → Override Default Package Name | coché, ex. `com.zartrixstudio.industria` (minuscules, sans espaces, **définitif une fois publié**) |
| Other Settings → Minimum API Level | **Android 8.0 (API 26)** ou plus |
| Other Settings → Configuration → Scripting Backend | **IL2CPP** |
| Other Settings → Configuration → Target Architectures | **ARM64 uniquement** (décoche ARMv7) |
| Other Settings → Configuration → **Active Input Handling** | **Input System Package (New)** (Unity redémarre) |

### c) Player (onglet iOS 🍏) — même si tu n'as pas de Mac pour l'instant
| Réglage | Valeur |
|---|---|
| Bundle Identifier | même identifiant que sur Android |
| Target minimum iOS Version | **15.0** |
| Architecture | ARM64 |

### d) Qualité
*Project Settings → Quality* : le template URP crée deux niveaux, **Mobile** et **PC**.
Dans la ligne « Default » de la matrice, clique la flèche sous l'icône **Android** et sous **iOS** → choisis **Mobile**.

### e) Packages à vérifier (*Window → Package Manager → In Project*)
Doivent être présents (normalement déjà inclus par le template Unity 6) :
- **Universal RP**
- **Input System**

Ajoute (onglet *Unity Registry*) :
- **Cinemachine** (version 3.x) — caméra troisième personne.

## 1.5 Premier commit

Ferme Unity (pour que tous les fichiers soient écrits), puis :

```bash
cd C:\Dev\Industria
git status          # Library/, Temp/, Logs/ NE doivent PAS apparaître
git add .
git commit -m "Création du projet Unity 6 URP + réglages mobiles"
git push origin claude/industria-mobile-setup-5hmwyi
```

## ✅ Vérification de l'étape 1

Une fois poussé, dis-le-moi. Je vérifierai moi-même dans le dépôt :
- `ProjectSettings/ProjectVersion.txt` → version exacte de Unity
- `Packages/manifest.json` → URP, Input System, Cinemachine et leurs versions
- `ProjectSettings/ProjectSettings.asset` → Input System actif, IL2CPP, ARM64, Vulkan, package name
- que `Library/` n'a **pas** été poussé

En plus, envoie-moi :
1. Une capture de la console Unity (*Window → General → Console*) **sans erreur rouge**.
2. Si possible : le modèle de ton téléphone Android de test.

C'est seulement à partir des versions réelles de tes packages que j'écrirai les scripts
du personnage (les API d'Input System et de Cinemachine 3 changent d'une version à l'autre).
