# Journal de vérification

Ce document indique **honnêtement** ce qui a été vérifié et comment.

## Environnement de développement de la v0.1
Le code a été écrit dans un conteneur Linux **sans éditeur Unity** (les serveurs de téléchargement Unity n'y sont
pas accessibles et l'éditeur exige une licence). Le jeu n'a donc **pas encore été lancé dans Unity**.

## Ce qui a été vérifié
| Vérification | Méthode | Résultat |
|---|---|---|
| Logique de simulation (inventaire, foreuse, fonderie, convoyeur, chaîne complète, sauvegarde JSON aller-retour) | 18 tests NUnit, `tools/SimulationTests` (.NET 8) | ✅ 18/18 |
| Validité du contenu JSON (références croisées, boucle de départ atteignable) | Tests NUnit sur les vrais fichiers JSON | ✅ |
| Compilation de tous les scripts runtime avec l'**Input System** | `tools/UnityCompileCheck` contre UnityEngine 2021.3 + stubs Input System | ✅ 0 erreur, 0 avertissement |
| Compilation avec l'**ancien Input Manager** | idem, `ENABLE_LEGACY_INPUT_MANAGER` | ✅ |
| Compilation des scripts **éditeur** | contre UnityEditor 2021.1 + stubs URP | ✅ |

## Ce qui n'a PAS encore été vérifié
- Exécution dans Unity 6 (rendu, physique, sensations de contrôle, équilibrage, performances).
- API spécifiques à Unity 6 absentes des DLL de référence (ex. `NamedBuildTarget` est protégé par `#if UNITY_2021_2_OR_NEWER`).
- Création automatique de l'asset URP (recommandé : laisser Unity la faire ou utiliser un projet « Universal 3D »).
- Contrôles tactiles et performances sur un vrai téléphone Android / iOS.

## Premier test à faire dans Unity
1. Ouvrir le projet, attendre la configuration automatique, ouvrir `Main.unity`, Play.
2. Vérifier la console : aucun message rouge. Les logs `[Content]`, `[World]`, `[Game]` doivent apparaître.
3. Nouvelle partie → C (scanner) → miner → construire fonderie → foreuse → convoyeur → F5 → Échap > menu → Continuer.
4. Me renvoyer la console et vos impressions : je corrige en priorité.
