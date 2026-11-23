# Studio Anneaux

`index.html` est une appli web : tu choisis ta musique, elle trouve le meilleur passage et les drops, la balle sort du cercle sur chaque drop (musique pleine + réverb), reste dedans le reste du temps (musique douce et étouffée). Réglages : volumes, intensité de l'effet, couleurs, vitesse, ouverture, rotation, durée. Le bouton « Enregistrer la vidéo » produit un MP4 (ou WebM) avec le son.


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
Avec `--musique`, le script choisit tout seul le meilleur passage (durée `--duree`), repère les drops, et fait sortir la balle du cercle à chaque drop. Dans le cercle, la musique est plus douce et étouffée ; dehors, elle est pleine avec de la réverb. `--effet` règle l'intensité de cet effet (0 à 2), `--sans-sync` le désactive, `--debut-musique 62` force le début du passage.

Options : `--duree`, `--anneaux`, `--vitesse`, `--ouverture`, `--rotation`, `--debut-musique`, `--graine`, `--fps`.
