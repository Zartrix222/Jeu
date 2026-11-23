# Orbit Studio

Application web privée (PWA) pour créer des animations de **balles qui rebondissent dans des cercles** — anneaux qui se cassent, particules, néon, compteurs, musique — et les **exporter en vidéo verticale 9:16 (1080 × 1920)** directement depuis le téléphone.

Fonctionne dans Chrome (Android) et Safari / Chrome (iPhone), sans rien installer d'autre. Aucune publicité, aucun compte, aucun serveur de données : tout reste dans votre navigateur.

## Fonctionnalités

| | |
|---|---|
| **Moteur physique 2D** | Moteur maison déterministe (pas fixe 1/120 s, aléatoire à graine) spécialisé pour des balles *à l'intérieur* d'anneaux concaves en rotation : parois mobiles, ouvertures, destruction, collisions entre balles, bords d'écran. L'aperçu et l'export donnent exactement la même animation. |
| **Rendu** | Canvas 2D optimisé : jusqu'à 2000 anneaux, palettes en bandes / dégradé / arc-en-ciel, cercle intérieur lumineux, halo néon, poussière scintillante, particules et explosions, traînées (comète, ruban, échos), flash, tremblement, visualiseur audio circulaire en fin d'animation. |
| **Musique** | Import depuis les fichiers du téléphone. Mode **« joue aux rebonds »** (la musique n'avance que quand la balle touche/casse un cercle, comme sur TikTok) ou **continu** (cercles, flash et balle réagissent au rythme : analyse spectrale + détection des temps forts). Bruitages synthétisés (notes en gamme, pop). Mode sans musique. |
| **Modèles** | Balle dans un cercle · Balle destructrice · Plusieurs balles · Cercles infinis · Traînée lumineuse · Cercles musicaux · Arc-en-ciel · Personnalisée. |
| **Export vidéo** | Rendu image par image avec **WebCodecs** → **MP4 H.264** (+ audio AAC ou Opus) à 30 ou 60 i/s, 1080 × 1920 (ou 720 × 1280), durée au choix ou « auto » (jusqu'au dernier anneau). Secours automatique : enregistrement temps réel (MediaRecorder, MP4 ou WebM). Bouton **Partager / Enregistrer dans Photos** et téléchargement. |
| **Projets** | Sauvegarde automatique locale (localStorage + IndexedDB pour les musiques), miniatures, duplication, **sauvegarde / restauration en fichier `.json`** (avec ou sans musiques). |
| **PWA** | Installable sur l'écran d'accueil, fonctionne hors-ligne. |

## Démarrer en local

Prérequis : Node.js 20 ou plus.

```bash
npm install
npm run dev        # http://localhost:5173 (et l'adresse réseau pour tester sur le téléphone)
npm run build      # version de production dans dist/
npm run preview    # sert dist/ localement
```

> L'export vidéo et l'audio exigent HTTPS (ou `localhost`). Pour tester sur le téléphone, le plus simple est de passer par la mise en ligne ci-dessous.

## Mise en ligne gratuite (Cloudflare Pages — recommandé)

1. Créez un compte gratuit sur <https://dash.cloudflare.com>.
2. **Workers & Pages › Create › Pages › Connect to Git**, autorisez GitHub et choisissez ce dépôt.
3. Réglages de build :
   - Framework preset : `None` (ou `Vite`)
   - Build command : `npm run build`
   - Build output directory : `dist`
   - Branche de production : celle que vous voulez publier (par ex. `main`).
4. **Save and Deploy**. Après 1 à 2 minutes, vous obtenez votre lien personnel du type `https://orbit-studio-xxxx.pages.dev`.
5. Chaque `git push` redéploie automatiquement.

### Protéger l'accès (important)

Un lien non partagé **n'est pas** privé (il peut fuiter, être deviné ou indexé). Deux options :

**A. Mot de passe intégré (simple, inclus dans ce projet)**
Dans Cloudflare : projet Pages › **Settings › Variables and Secrets** › *Add* → nom `SITE_PASSWORD`, type **Secret**, valeur = un mot de passe long (au moins 12 caractères). Redéployez (*Deployments › Retry deployment*).
Le fichier `functions/_middleware.js` bloque alors **tout** le site côté serveur tant que le mot de passe n'est pas saisi ; un cookie sécurisé (HttpOnly, Secure, 1 an) évite de le retaper. Les essais sont ralentis pour décourager les attaques. Sans la variable, le site reste public.

**B. Cloudflare Access (le plus sûr, gratuit jusqu'à 50 utilisateurs)**
*Zero Trust › Access › Applications › Add › Self-hosted*, domaine = votre `xxx.pages.dev`, règle « Emails » = votre adresse. Vous recevez un code par e-mail pour vous connecter. Vous pouvez combiner A et B.

### Alternative : Vercel

*Add New › Project*, importez le dépôt (preset Vite détecté automatiquement, sortie `dist`). Attention : la protection par mot de passe de Vercel est payante et le fichier `functions/_middleware.js` est propre à Cloudflare — préférez Cloudflare si vous voulez protéger l'accès gratuitement.

## Installer sur le téléphone

- **Android (Chrome)** : ouvrez le lien › menu ⋮ › *Installer l'application* (ou *Ajouter à l'écran d'accueil*). L'accueil de l'application propose aussi un bouton « Installer ».
- **iPhone (Safari)** : ouvrez le lien › bouton Partager › *Sur l'écran d'accueil*. (Chrome sur iPhone le permet aussi via Partager depuis iOS 16.4.)

## Enregistrer la vidéo dans la galerie

Après l'export :
- **Partager / Enregistrer** : ouvre le menu de partage du système. Sur iPhone, choisissez *Enregistrer la vidéo* → elle arrive dans Photos. Sur Android, choisissez Google Photos / Galerie (ou une appli de destination).
- **Télécharger** : sur Android, le fichier va dans *Téléchargements* (visible dans Google Photos › Bibliothèque › Download).

### Limites des navigateurs mobiles (gérées par l'application)

- L'export rapide utilise WebCodecs (Chrome Android ≥ 94, Safari iOS ≥ 16.4 pour la vidéo). Si l'encodeur audio n'existe pas (anciens iOS), l'application passe automatiquement à l'enregistrement **temps réel** pour conserver la musique.
- Si la 1080p n'est pas acceptée par l'encodeur du téléphone, l'export bascule en 720 × 1280.
- Gardez l'écran allumé et l'application au premier plan pendant l'export (l'application demande un verrou d'écran quand c'est possible). Sur iPhone, une vidéo longue en 1080p consomme beaucoup de mémoire : préférez ≤ 60 s ou la résolution 720 si l'export échoue.
- L'audio du navigateur ne démarre qu'après un toucher (règle des navigateurs) : appuyez sur ▶ pour lancer l'aperçu.
- Les données locales peuvent être effacées par le système (surtout sur iPhone si l'app n'est pas ouverte pendant des semaines) : utilisez **⚙ › Sauvegarder** régulièrement.

## Organisation du code

```
src/
  engine/
    types.ts        modèle de données (réglages, projet)
    templates.ts    réglages par défaut + 8 modèles
    sim.ts          moteur physique déterministe (balles, anneaux, particules, événements)
    render.ts       rendu Canvas 2D (anneaux, néon, traînées, compteur, visualiseur)
    analysis.ts     analyse musicale hors-ligne (FFT, énergie, basses, temps forts)
    audio.ts        bruitages, lecture musique (continue / aux rebonds), rendu audio hors-ligne
    player.ts       aperçu temps réel (horloge synchronisée sur l'audio)
    exporter.ts     export MP4 WebCodecs + secours MediaRecorder
  lib/              stockage local, sauvegardes, miniatures
  ui/               écrans React (accueil, éditeur, panneaux de réglages, export)
functions/_middleware.js   protection par mot de passe (Cloudflare Pages)
public/                    icônes PWA, en-têtes, robots.txt
scripts/icons.cjs          régénère les icônes PNG depuis public/icon.svg
```
