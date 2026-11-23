#!/usr/bin/env python3
"""
Génère une vidéo verticale (1080x1920) façon "satisfying balls" :
une balle rebondit dans des anneaux qui tournent ; quand elle sort par une
ouverture, l'anneau éclate et le compteur descend.

Deux styles :
  cone     ouvertures presque alignées → un cône noir dentelé, les anneaux
           éclatent en rafale (dégradé orange / rose / violet, balle dorée)
  spirale  chaque anneau tourne un peu plus vite → bras de spirale (vert)

Son :
  --musique mon_son.mp3   musique de fond (n'importe quel format lu par ffmpeg)
  sans --musique          chaque rebond joue la note suivante de La Lettre à Élise
  --volume-musique / --volume-effets   de 0 (muet) à 1 (et plus)

Exemples :
  python3 render.py
  python3 render.py --style cone --musique son.mp3 --volume-musique 0.8 --volume-effets 0.3
  python3 render.py --style spirale --anneaux 1703 --duree 30
Dépendances : pycairo, numpy, ffmpeg
"""
import argparse, colorsys, math, os, random, subprocess, tempfile, wave
import numpy as np
import cairo

TAU = math.tau

# ---------------- Mélodie (Für Elise, Beethoven — domaine public) ----------------
def note(name):
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7,
             'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    midi = 12 * (int(name[-1]) + 1) + names[name[:-1]]
    return 440.0 * 2 ** ((midi - 69) / 12)

A_PART = "E5 D#5 E5 D#5 E5 B4 D5 C5 A4 C4 E4 A4 B4 E4 G#4 B4 C5 E4 " \
         "E5 D#5 E5 D#5 E5 B4 D5 C5 A4 C4 E4 A4 B4 E4 C5 B4 A4"
B_PART = "B4 C5 D5 E5 G4 F5 E5 D5 F4 E5 D5 C5 E4 D5 C5 B4 E4 E5 E5 E6 D#5 E5 D#5 E5"
MELODY_NAMES = (A_PART + " " + B_PART + " " + A_PART).split()
MELODY = [note(x) for x in MELODY_NAMES]
BASS = {'A4': note('A2'), 'B4': note('E2'), 'C5': note('A2'), 'G#4': note('E2')}

# ---------------- Styles ----------------
STYLES = {
    'cone': dict(anneaux=1500, r0=0.125, ecart=0.0056, trait=0.0036, balle=0.022,
                 vitesse=0.62, ouverture=0.95, collapse=45,
                 palette=[(1.00, 0.68, 0.20), (1.00, 0.42, 0.85), (0.72, 0.35, 1.00),
                          (1.00, 0.42, 0.85)],
                 periode=140, balle_col=(1.0, 0.80, 0.25), halo=(1.0, 0.70, 0.15)),
    'spirale': dict(anneaux=1703, r0=0.16, ecart=0.0115, trait=0.0042, balle=0.011,
                    vitesse=0.9, ouverture=1.25, collapse=0,
                    palette=[(0.40, 0.85, 0.45), (0.50, 0.95, 0.55), (0.35, 0.78, 0.42)],
                    periode=80, balle_col=(0.94, 0.92, 1.0), halo=(0.70, 0.59, 1.0)),
}


def decode(path, sr, start=0.0, dur=None, channels=2):
    cmd = ['ffmpeg', '-loglevel', 'error', '-ss', str(start), '-i', path]
    if dur: cmd += ['-t', str(dur)]
    cmd += ['-ac', str(channels), '-ar', str(sr), '-f', 's16le', '-']
    raw = subprocess.run(cmd, capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float64) / 32768
    return x.reshape(-1, channels)


def loudness_db(mono, sr, hop=0.1):
    h = int(sr * hop)
    n = len(mono) // h
    r = np.sqrt((mono[:n * h].reshape(n, h) ** 2).mean(1) + 1e-10)
    return 20 * np.log10(r)


def smooth(x, k):
    k = max(1, int(k))
    return np.convolve(x, np.ones(k) / k, mode='same')


def best_passage(mono, sr, length):
    """Cherche le passage le plus intense / le plus contrasté (pas de 1 s)."""
    db = smooth(loudness_db(mono, sr), 5)
    L = int(length * 10)
    if len(db) <= L: return 0.0
    rise = np.maximum(0, db - np.concatenate([np.full(30, db[0]), db[:-30]]))
    best, bt = -1e9, 0
    for s0 in range(0, len(db) - L, 10):
        seg = db[s0:s0 + L]
        score = seg.mean() + 0.8 * (np.percentile(seg, 90) - np.percentile(seg, 15)) \
            + 0.15 * rise[s0:s0 + L].max()
        if score > best: best, bt = score, s0
    # démarrer juste avant une montée, c'est plus accrocheur
    return bt / 10


def find_drops(mono, sr):
    """Repère les "drops" : la musique monte d'un coup par rapport aux 3 s précédentes."""
    db = smooth(loudness_db(mono, sr), 3)
    base = np.array([db[max(0, i - 30):max(1, i - 2)].mean() for i in range(len(db))])
    rise = db - base
    p50, p55 = np.percentile(db, 50), np.percentile(db, 55)
    wins, i = [], 15
    while i < len(db):
        if rise[i] > 4 and db[i] > p55 and rise[i] >= rise[max(0, i - 2):i + 3].max():
            j = i + 20
            while j < min(len(db), i + 55) and db[j] > p50: j += 1
            wins.append([i / 10, j / 10]); i = j + 25
        else:
            i += 1
    if len(wins) < 2:  # repli : les passages les plus forts
        thr = np.percentile(db, 72)
        loud = smooth((db > thr).astype(float), 10) > 0.5
        wins, i = [], 0
        while i < len(loud):
            if loud[i]:
                j = i
                while j < len(loud) and loud[j]: j += 1
                if j - i >= 15: wins.append([i / 10, min(j, i + 60) / 10])
                i = j + 20
            else:
                i += 1
    return wins


def lowpass(x, sr, cutoff):
    n = len(x)
    F = np.fft.rfft(x, axis=0)
    f = np.fft.rfftfreq(n, 1 / sr)
    F *= (1 / np.sqrt(1 + (f / cutoff) ** 4))[:, None]
    return np.fft.irfft(F, n, axis=0)


def reverb(x, sr, seconds=1.8, seed=3):
    rng = np.random.default_rng(seed)
    n_ir = int(seconds * sr)
    t = np.arange(n_ir) / sr
    out = np.zeros_like(x)
    nfft = 1 << int(np.ceil(np.log2(len(x) + n_ir)))
    for c in range(x.shape[1]):  # réponse différente par canal → effet stéréo large
        ir = rng.standard_normal(n_ir) * np.exp(-t * 3.2)
        ir = lowpass(ir[:, None], sr, 5000)[:, 0]
        ir /= np.sqrt((ir ** 2).sum())
        y = np.fft.irfft(np.fft.rfft(x[:, c], nfft) * np.fft.rfft(ir, nfft), nfft)
        out[:, c] = y[:len(x)]
    return out


def lerp3(a, b, t):
    return tuple(a[k] + (b[k] - a[k]) * t for k in range(3))


def palette_color(pal, period, i):
    x = (i / period) % len(pal)
    k = int(x)
    return lerp3(pal[k], pal[(k + 1) % len(pal)], x - k)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--style', choices=list(STYLES), default='cone')
    ap.add_argument('--duree', type=float, default=60, help='secondes')
    ap.add_argument('--anneaux', type=int, help='nombre d\'anneaux (compteur de départ)')
    ap.add_argument('--vitesse', type=float, default=1.0, help='multiplicateur de vitesse de la balle')
    ap.add_argument('--ouverture', type=float, help='largeur des ouvertures en radians')
    ap.add_argument('--rotation', type=float, default=1.0, help='multiplicateur de vitesse de rotation')
    ap.add_argument('--musique', help='fichier audio de fond (mp3, m4a, wav...)')
    ap.add_argument('--debut-musique', type=float, help='démarrer la musique à X s (sinon : meilleur passage auto)')
    ap.add_argument('--sans-sync', action='store_true',
                    help='ne pas faire sortir la balle sur les drops de la musique')
    ap.add_argument('--effet', type=float, default=1.0,
                    help='intensité de l\'effet (étouffé dans le cercle / réverb dehors)')
    ap.add_argument('--volume-musique', type=float, default=0.8)
    ap.add_argument('--volume-effets', type=float, default=0.5, help='sons des rebonds / éclats')
    ap.add_argument('--fps', type=int, default=60)
    ap.add_argument('--graine', type=int, default=7, help='change le trajet de la balle')
    ap.add_argument('--sortie', default='video.mp4')
    args = ap.parse_args()

    sty = STYLES[args.style]
    sr = 44100
    music, windows = None, []
    if args.musique:
        full = decode(args.musique, sr)
        song_len = len(full) / sr
        if args.debut_musique is None:
            args.debut_musique = best_passage(full.mean(1), sr, args.duree)
        start = int(args.debut_musique * sr)
        music = full[start:start + int(args.duree * sr)]
        if len(music) < int(args.duree * sr):
            args.duree = len(music) / sr
        print(f'Morceau : {song_len:.0f} s — passage retenu : {args.debut_musique:.1f} s → '
              f'{args.debut_musique + args.duree:.1f} s')
        if args.style == 'cone' and not args.sans_sync:
            windows = find_drops(music.mean(1), sr)
            print('Sorties de la balle (s) : ' + ', '.join(f'{a:.1f}–{b:.1f}' for a, b in windows))
    SYNC = bool(windows)
    rnd = random.Random(args.graine)
    W, H = 1080, 1920
    S = W
    R0, SP = S * sty['r0'], S * sty['ecart']
    BR, LW = S * sty['balle'], max(1.5, S * sty['trait'])
    N = args.anneaux or sty['anneaux']
    BASE_GAP = args.ouverture or sty['ouverture']
    SPEED = S * sty['vitesse'] * args.vitesse
    CONE = args.style == 'cone'

    def run(N, render):
        rnd_r = random.Random(args.graine)
        # ----- géométrie des anneaux -----
        phase, omega, gap, color = [], [], [], []
        off = 0.0
        for i in range(N):
            if CONE:
                # ouvertures presque alignées, bords dentelés, cône légèrement courbé
                off = off * 0.9 + rnd_r.gauss(0, 0.03)
                phase.append(off + math.sin(i * 0.006) * 0.3)
                omega.append(0.0)
                gap.append(max(0.35, BASE_GAP * (1 + rnd_r.gauss(0, 0.07))))
            else:
                phase.append(i * 0.11)
                omega.append(0.9 + i * 0.0035 + math.sin(i * 0.05) * 0.15)
                gap.append(BASE_GAP)
            color.append(palette_color(sty['palette'], sty['periode'], i))

        def global_rot(t):  # rotation commune (style cône)
            return args.rotation * (0.42 * t + 0.9 * math.sin(t * 0.13))

        st = dict(first=0, offset=0.0, t=0.0, flash=0.0, pulse=0.0, rot=0.0, gate=not SYNC)
        rnd = random.Random(args.graine * 7919 + 1)
        a0 = rnd.random() * TAU
        ball = [0.0, 0.0, math.cos(a0) * SPEED, math.sin(a0) * SPEED]
        particles, dust = [], []
        bounces, pops = [], []

        def ring_r(i): return R0 + (i - st['offset']) * SP
        def ring_a(i):
            return phase[i] + (st['rot'] if CONE else omega[i] * st['t'] * args.rotation)

        def in_gap(i, a, r):
            if not st['gate'] and i == st['first']:
                return False  # cercle fermé : la balle reste dedans
            margin = math.asin(min(1.0, BR / max(r, BR))) * (0.6 if CONE else 1.0)
            diff = (a - ring_a(i) + math.pi) % TAU - math.pi
            return abs(diff) < gap[i] / 2 - margin

        def pop(i, r):
            rot = ring_a(i)
            cnt = 10 if CONE else min(70, 20 + int(r / 6))
            for _ in range(cnt):
                a = rot + gap[i] / 2 + rnd.random() * (TAU - gap[i])
                sp = S * (0.1 + rnd.random() * 0.35)
                particles.append([math.cos(a) * r, math.sin(a) * r,
                                  math.cos(a) * sp + (rnd.random() - .5) * S * .15,
                                  math.sin(a) * sp + (rnd.random() - .5) * S * .15,
                                  1.0, 1.0 + rnd.random() * 1.4, i])
            if CONE:  # poussière scintillante qui tombe dans le disque central
                for _ in range(4):
                    a = rnd.random() * TAU
                    rr = R0 * (0.75 + rnd.random() * 0.22)
                    dust.append([a, rr, 2.5 + rnd.random() * 3, i, rnd.random() * TAU])
            st['first'] += 1
            st['pulse'] = 1.0
            st['flash'] = min(1.0, st['flash'] + 0.06)
            pops.append(st['t'])

        def hit_angle():
            # où la balle va toucher le bord du disque
            px, py, vx, vy = ball
            d = math.hypot(px, py)
            Rw = max(BR, ring_r(st['first']) - BR)
            if d >= Rw * 0.98: return math.atan2(py, px)
            a = vx * vx + vy * vy; b = 2 * (px * vx + py * vy); c = px * px + py * py - Rw * Rw
            s_ = (-b + math.sqrt(max(0.0, b * b - 4 * a * c))) / (2 * a)
            return math.atan2(py + vy * s_, px + vx * s_)

        def in_window(t):
            return any(a <= t < b for a, b in windows)

        def step(dt):
            st['t'] += dt
            if SYNC:
                win = in_window(st['t'])
                if win:
                    st['gate'] = True
                elif st['gate'] and st['first'] < N and \
                        math.hypot(ball[0], ball[1]) < ring_r(st['first']) - BR * 1.5:
                    st['gate'] = False
                if win and st['first'] < N:
                    # le cône pivote pour s'ouvrir là où la balle arrive
                    diff = (hit_angle() - ring_a(st['first']) + math.pi) % TAU - math.pi
                    st['rot'] += max(-9 * dt, min(9 * dt, diff * 12 * dt))
                else:
                    st['rot'] += 0.42 * args.rotation * dt
            elif CONE:
                st['rot'] = global_rot(st['t'])
            lag = st['first'] - st['offset']
            if sty['collapse']:
                st['offset'] += min(lag, (sty['collapse'] + 20 * lag) * dt)
            else:
                st['offset'] += lag * (1 - math.exp(-dt * 14))
            if CONE:  # hors du disque, la balle est attirée vers le centre
                d0 = math.hypot(ball[0], ball[1])
                if d0 > R0:
                    # après un drop, la balle est vite ramenée dans le cercle
                    pull = 3.0 if (not SYNC or in_window(st['t'])) else 14.0
                    g = S * pull * dt / d0
                    ball[2] -= ball[0] * g; ball[3] -= ball[1] * g
            ball[0] += ball[2] * dt
            ball[1] += ball[3] * dt

            # plusieurs anneaux peuvent céder dans le même pas (rafale dans le cône)
            for _ in range(8):
                i = st['first']
                if i >= N: break
                r = ring_r(i)
                d = math.hypot(ball[0], ball[1]) or 1e-9
                a = math.atan2(ball[1], ball[0])
                if in_gap(i, a, r):
                    if d > r:
                        pop(i, r); continue
                elif d > r - BR:
                    nx, ny = ball[0] / d, ball[1] / d
                    ball[0], ball[1] = nx * (r - BR), ny * (r - BR)
                    vn = ball[2] * nx + ball[3] * ny
                    if vn > 0:
                        ball[2] -= 2 * vn * nx; ball[3] -= 2 * vn * ny
                        ang = math.atan2(ball[3], ball[2]) + (rnd.random() - .5) * 0.2
                        ball[2], ball[3] = math.cos(ang) * SPEED, math.sin(ang) * SPEED
                        bounces.append(st['t'])
                break
            if st['first'] >= N:  # plus d'anneaux : la balle rebondit dans le disque
                d = math.hypot(ball[0], ball[1]) or 1e-9
                if d > R0 - BR:
                    nx, ny = ball[0] / d, ball[1] / d
                    ball[0], ball[1] = nx * (R0 - BR), ny * (R0 - BR)
                    vn = ball[2] * nx + ball[3] * ny
                    if vn > 0: ball[2] -= 2 * vn * nx; ball[3] -= 2 * vn * ny

            k = 0.985 ** (dt * 60)
            for p in particles:
                p[0] += p[2] * dt; p[1] += p[3] * dt
                p[2] *= k; p[3] *= k
                p[4] -= p[5] * dt
            for d_ in dust:
                d_[0] += dt * 0.25
                d_[2] -= dt
            st['pulse'] = max(0.0, st['pulse'] - dt * 5)
            st['flash'] = max(0.0, st['flash'] - dt * 1.6)

        # ---------------- Rendu vidéo ----------------
        tmp = tempfile.mkdtemp()
        silent = os.path.join(tmp, 'v.mp4')
        fps = args.fps
        nframes = int(args.duree * fps)
        sub = 8
        surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
        cr = cairo.Context(surf)
        trail, gate_log = [], []
        max_r = math.hypot(W, H) / 2 + 4
        bcol, hcol = sty['balle_col'], sty['halo']

        ff = None if not render else subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra',
                               '-s', f'{W}x{H}', '-r', str(fps), '-i', '-',
                               '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
                               silent], stdin=subprocess.PIPE)

        for f in range(nframes):
            for _ in range(sub):
                step(1 / fps / sub)
            particles[:] = [p for p in particles if p[4] > 0]
            dust[:] = [d for d in dust if d[2] > 0][-900:]
            if len(particles) > 1500: del particles[:len(particles) - 1500]
            trail.append((ball[0], ball[1]))
            if len(trail) > 18: trail.pop(0)
            gate_log.append(1.0 if (st['gate'] and SYNC) else 0.0)
            if not render:
                continue

            cr.identity_matrix()
            cr.set_source_rgb(0.012, 0.01, 0.02)
            cr.paint()
            cr.translate(W / 2, H / 2)

            fl = st['flash']
            cr.set_line_width(LW)
            cr.set_line_cap(cairo.LINE_CAP_BUTT)
            for i in range(st['first'], N):
                r = ring_r(i)
                if r > max_r: break
                if r <= 1: continue
                rot = ring_a(i)
                c = color[i]
                # flash : les anneaux s'éclaircissent quand ça éclate en rafale
                b = fl * max(0.0, 1 - (r - R0) / (S * 0.6))
                cr.set_source_rgb(*lerp3(c, (1, 1, 0.9), min(0.85, b)))
                cr.new_path()
                cr.arc(0, 0, r, rot + gap[i] / 2, rot - gap[i] / 2 + TAU)
                cr.stroke()

            for p in particles:
                cr.set_source_rgba(*color[p[6]], max(0, min(1, p[4])))
                cr.rectangle(p[0] - LW, p[1] - LW, LW * 2, LW * 2)
                cr.fill()

            if CONE:
                # disque central noir, bord blanc lumineux, poussière d'étoiles
                cr.set_source_rgb(0.012, 0.01, 0.02)
                cr.arc(0, 0, R0 - LW, 0, TAU); cr.fill()
                for d_ in dust:
                    al = min(1.0, d_[2] / 1.5) * (0.5 + 0.5 * math.sin(d_[4] + st['t'] * 6))
                    cr.set_source_rgba(*color[d_[3]], al * 0.9)
                    x, y = math.cos(d_[0]) * d_[1], math.sin(d_[0]) * d_[1]
                    cr.arc(x, y, 1.6, 0, TAU); cr.fill()
                if st['first'] < N:
                    rr = max(R0, ring_r(st['first']))
                    for w_, al in ((LW * 7, 0.08), (LW * 4, 0.18), (LW * 2, 0.5)):
                        cr.set_source_rgba(1, 0.95, 1, al * (0.6 + fl))
                        cr.set_line_width(w_)
                        rot = ring_a(st['first'])
                        cr.new_path()
                        if st['gate']:
                            cr.arc(0, 0, rr, rot + gap[st['first']] / 2, rot - gap[st['first']] / 2 + TAU)
                        else:
                            cr.arc(0, 0, rr, 0, TAU)
                        cr.stroke()
            else:
                g = cairo.RadialGradient(0, 0, 0, 0, 0, R0)
                g.add_color_stop_rgba(0, 0.63, 0.55, 1, 0.10)
                g.add_color_stop_rgba(1, 0.63, 0.55, 1, 0)
                cr.set_source(g); cr.arc(0, 0, R0, 0, TAU); cr.fill()

            # compteur
            remaining = N - st['first']
            txt = str(remaining)
            cr.select_font_face('DejaVu Sans', cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
            cr.set_font_size(S * (0.085 if CONE else 0.105) * (1 + st['pulse'] * 0.08))
            ext = cr.text_extents(txt)
            x, y = -ext.x_bearing - ext.width / 2, -ext.y_bearing - ext.height / 2
            cr.set_source_rgba(0, 0, 0, 0.5); cr.move_to(x + 3, y + 4); cr.show_text(txt)
            cr.set_source_rgb(1, 1, 1); cr.move_to(x, y); cr.show_text(txt)

            # traînée
            cr.set_line_cap(cairo.LINE_CAP_ROUND)
            for k in range(1, len(trail)):
                a = k / len(trail)
                cr.set_source_rgba(*hcol, a * 0.5)
                cr.set_line_width(BR * 1.5 * a)
                cr.move_to(*trail[k - 1]); cr.line_to(*trail[k]); cr.stroke()

            # balle + halo
            bx, by = ball[0], ball[1]
            g = cairo.RadialGradient(bx, by, BR * 0.6, bx, by, BR * 3.2)
            g.add_color_stop_rgba(0, *hcol, 0.55)
            g.add_color_stop_rgba(1, *hcol, 0)
            cr.set_source(g); cr.arc(bx, by, BR * 3.2, 0, TAU); cr.fill()
            g = cairo.RadialGradient(bx - BR * .3, by - BR * .3, 0, bx, by, BR)
            g.add_color_stop_rgb(0, 1, 1, 0.9)
            g.add_color_stop_rgb(1, *bcol)
            cr.set_source(g); cr.arc(bx, by, BR, 0, TAU); cr.fill()

            surf.flush()
            ff.stdin.write(bytes(surf.get_data()))
            if f % (fps * 5) == 0:
                print(f'{f / fps:5.1f}s  anneaux restants {N - st["first"]}', flush=True)

        if render:
            ff.stdin.close(); ff.wait()
        return bounces, pops, gate_log, silent, tmp

    if SYNC and not args.anneaux:
        # 1re passe rapide : combien d'anneaux vont éclater ?
        _, p_, _, _, t_ = run(6000, False)
        os.rmdir(t_)
        N = len(p_) + 300  # garder l'écran rempli d'anneaux jusqu'à la fin
        print(f'Compteur de départ : {N}')
    bounces, pops, gate_log, silent, tmp = run(N, True)
    fps = args.fps

    # ---------------- Audio ----------------
    total = int(args.duree * sr)
    fx = np.zeros(total)

    def add(t0, freq, dur, vol, harm=((1, 1), (2, .45), (3, .2), (4, .1)), decay=3.0):
        i0 = int(t0 * sr)
        ln = min(int(dur * sr), total - i0)
        if ln <= 0: return
        tt = np.arange(ln) / sr
        env = np.exp(-tt * decay) * np.minimum(1, tt / 0.004)
        sig = sum(a * np.sin(TAU * freq * h * tt) * np.exp(-tt * decay * (h - 1) * 0.6) for h, a in harm)
        fx[i0:i0 + ln] += vol * env * sig

    if args.musique:
        # avec une musique : petit "toc" sur les rebonds, "tic" cristallin sur les éclats
        for t in bounces:
            add(t, 330, 0.12, 0.25, harm=((1, 1), (2.4, .3)), decay=30)
        last, streak = -1, 0
        for t in pops:
            if t - last < 0.03: continue
            streak = streak + 1 if t - last < 0.15 else 0
            last = t
            add(t, 1400 * 2 ** (min(streak, 24) / 24), 0.08, 0.10, harm=((1, 1), (2.76, .3)), decay=45)
    else:
        last, k = -1, 0
        for t in bounces:
            if t - last < 0.07: continue
            last = t
            idx = k % len(MELODY); k += 1
            add(t, MELODY[idx], 1.6, 0.30)
            if MELODY_NAMES[idx] in BASS:
                add(t, BASS[MELODY_NAMES[idx]], 1.8, 0.18, decay=2.0)
        last = -1
        for t in pops:
            if t - last < 0.03: continue
            last = t
            add(t, 2093.0, 0.2, 0.04, harm=((1, 1), (2.76, .4)), decay=18)
        # réverbération légère
        wet = np.zeros_like(fx)
        for dl in (0.0297, 0.0371, 0.0411, 0.0437):
            d = int(dl * sr); buf = fx.copy()
            for _ in range(6): buf[d:] += buf[:-d] * 0.3
            wet += buf
        fx = fx + wet * 0.08
    if np.abs(fx).max() > 0:
        fx = fx / np.abs(fx).max() * 0.8
    mix = fx * args.volume_effets * (1 if args.musique else 2)
    mix = np.stack([mix, mix], 1)

    if music is not None:
        mus = np.pad(music, ((0, max(0, total - len(music))), (0, 0)))[:total]
        fi, fo = int(0.8 * sr), int(2.0 * sr)
        mus[:fi] *= np.linspace(0, 1, fi)[:, None]
        mus[-fo:] *= np.linspace(1, 0, fo)[:, None]
        if SYNC:
            # g = 1 quand la balle est sortie (drop), 0 quand elle est dans le cercle
            g = np.repeat(np.array(gate_log), int(np.ceil(sr / fps)))[:total]
            g = np.pad(g, (0, max(0, total - len(g))), mode='edge')
            att, rel = 1 - math.exp(-1 / (0.08 * sr)), 1 - math.exp(-1 / (0.6 * sr))
            env = np.empty_like(g); v = 0.0
            for k in range(0, total, 64):  # enveloppe lissée (attaque rapide, relâche lente)
                tgt = g[k]
                c = att if tgt > v else rel
                v += (tgt - v) * (1 - (1 - c) ** 64)
                env[k:k + 64] = v
            e = min(2.0, max(0.0, args.effet))
            inside = lowpass(mus, sr, 1600 / (1 + e)) * (1 - 0.45 * min(1, e))   # étouffé, moins fort
            outside = mus * (1 + 0.15 * e) + reverb(mus, sr) * 0.35 * e           # plein + réverb
            mus = inside * (1 - env[:, None]) + outside * env[:, None]
        mix = mix + mus * args.volume_musique
    peak = np.abs(mix).max()
    if peak > 0.98:
        mix *= 0.98 / peak
    wav = os.path.join(tmp, 'a.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((mix * 32767).astype(np.int16).tobytes())

    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', silent, '-i', wav,
                    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', args.sortie], check=True)
    os.remove(silent); os.remove(wav); os.rmdir(tmp)
    print(f'OK -> {args.sortie}  ({len(bounces)} rebonds, {len(pops)} anneaux éclatés)')


if __name__ == '__main__':
    main()
