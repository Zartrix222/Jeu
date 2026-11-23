# Anneaux Infinis

Une balle rebondit dans des anneaux concentriques qui tournent. Chaque fois qu'elle sort par une ouverture, l'anneau éclate et le compteur descend.

Ouvrir `index.html` dans un navigateur (mobile ou PC). Touchez l'écran pour ouvrir le menu (nombre d'anneaux, vitesse, ouverture, couleurs, son).

## Vidéo

`video/render.py` génère une vidéo verticale 1080x1920 (format TikTok) avec le son.

```
pip install pycairo numpy   # + ffmpeg
python3 video/render.py                                   # style "cône", mélodie sur les rebonds
python3 video/render.py --musique son.mp3 --volume-musique 0.8 --volume-effets 0.3
python3 video/render.py --style spirale --anneaux 1703
```
Options : `--duree`, `--anneaux`, `--vitesse`, `--ouverture`, `--rotation`, `--debut-musique`, `--graine`, `--fps`.
