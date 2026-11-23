# Anneaux Infinis

Une balle rebondit dans des anneaux concentriques qui tournent. Chaque fois qu'elle sort par une ouverture, l'anneau éclate et le compteur descend.

Ouvrir `index.html` dans un navigateur (mobile ou PC). Touchez l'écran pour ouvrir le menu (nombre d'anneaux, vitesse, ouverture, couleurs, son).

## Vidéo

`video/render.py` génère une vidéo verticale 1080x1920 (format TikTok) avec la musique : chaque rebond joue la note suivante de *La Lettre à Élise* (domaine public), chaque anneau qui éclate fait un petit « ting ».

```
pip install pycairo numpy   # + ffmpeg
python3 video/render.py --duree 60 --anneaux 1703 --sortie anneaux.mp4
```
Options : `--vitesse`, `--ouverture`, `--graine` (change le trajet de la balle), `--fps`.
