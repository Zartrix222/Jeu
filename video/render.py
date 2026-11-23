#!/usr/bin/env python3
"""
Génère une vidéo verticale (1080x1920) façon "satisfying" :
une balle rebondit dans des anneaux qui tournent ; chaque rebond joue
la note suivante d'une mélodie, chaque sortie fait éclater un anneau.

Usage :  python3 render.py [--duree 60] [--anneaux 1703] [--sortie video.mp4]
Dépendances : pycairo, numpy, ffmpeg
"""
import argparse, math, random, subprocess, wave
import numpy as np
import cairo

TAU = math.tau

# ---------------- Mélodie (Für Elise, Beethoven — domaine public) ----------------
def n(name):
    names = {'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11}
    note, octv = name[:-1], int(name[-1])
    midi = 12 * (octv + 1) + names[note]
    return 440.0 * 2 ** ((midi - 69) / 12)

A_PART = "E5 D#5 E5 D#5 E5 B4 D5 C5 A4 C4 E4 A4 B4 E4 G#4 B4 C5 E4 " \
         "E5 D#5 E5 D#5 E5 B4 D5 C5 A4 C4 E4 A4 B4 E4 C5 B4 A4"
B_PART = "B4 C5 D5 E5 G4 F5 E5 D5 F4 E5 D5 C5 E4 D5 C5 B4 E4 E5 E5 E6 D#5 E5 D#5 E5"
MELODY = [n(x) for x in (A_PART + " " + B_PART + " " + A_PART).split()]
# basse jouée sur certaines notes (main gauche simplifiée)
BASS = {'A4': n('A2'), 'B4': n('E2'), 'C5': n('A2'), 'G#4': n('E2')}
MELODY_NAMES = (A_PART + " " + B_PART + " " + A_PART).split()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--duree', type=float, default=60)
    ap.add_argument('--anneaux', type=int, default=1703)
    ap.add_argument('--fps', type=int, default=60)
    ap.add_argument('--vitesse', type=float, default=1.0)
    ap.add_argument('--ouverture', type=float, default=1.25, help='taille de l\'ouverture en radians')
    ap.add_argument('--graine', type=int, default=7)
    ap.add_argument('--sortie', default='video.mp4')
    args = ap.parse_args()

    rnd = random.Random(args.graine)
    W, H = 1080, 1920
    S = min(W, H)
    R0, SP, BR = S * 0.16, S * 0.0115, S * 0.011
    LW = S * 0.0042
    GAP = args.ouverture
    SPEED = S * 0.9 * args.vitesse
    N = args.anneaux

    phase = [i * 0.11 for i in range(N)]
    omega = [0.9 + i * 0.0035 + math.sin(i * 0.05) * 0.15 for i in range(N)]
    color = []
    for i in range(N):
        h = (125 + math.sin(i * 0.08) * 8) / 360
        l = (58 + math.sin(i * 0.37) * 6) / 100
        color.append(hsl(h, 0.65, l))

    st = dict(first=0, offset=0.0, t=0.0)
    a0 = rnd.random() * TAU
    ball = [0.0, 0.0, math.cos(a0) * SPEED, math.sin(a0) * SPEED]
    particles = []
    bounces, pops = [], []
    pulse = [0.0]

    def ring_r(i): return R0 + (i - st['offset']) * SP
    def ring_a(i): return phase[i] + omega[i] * st['t']

    def step(dt):
        st['t'] += dt
        st['offset'] += (st['first'] - st['offset']) * (1 - math.exp(-dt * 14))
        ball[0] += ball[2] * dt
        ball[1] += ball[3] * dt
        i = st['first']
        if i < N:
            r = ring_r(i)
            d = math.hypot(ball[0], ball[1])
            a = math.atan2(ball[1], ball[0])
            margin = math.asin(min(1, BR / max(r, BR)))
            diff = (a - ring_a(i) + math.pi) % TAU - math.pi
            if abs(diff) < GAP / 2 - margin:
                if d > r:
                    pop(i, r)
            elif d > r - BR:
                nx, ny = ball[0] / d, ball[1] / d
                ball[0], ball[1] = nx * (r - BR), ny * (r - BR)
                vn = ball[2] * nx + ball[3] * ny
                if vn > 0:
                    ball[2] -= 2 * vn * nx; ball[3] -= 2 * vn * ny
                    ang = math.atan2(ball[3], ball[2]) + (rnd.random() - .5) * 0.18
                    ball[2], ball[3] = math.cos(ang) * SPEED, math.sin(ang) * SPEED
                    bounces.append(st['t'])
        for p in particles:
            p[0] += p[2] * dt; p[1] += p[3] * dt
            p[2] *= 0.985 ** (dt * 60); p[3] *= 0.985 ** (dt * 60)
            p[4] -= p[5] * dt
        particles[:] = [p for p in particles if p[4] > 0]
        pulse[0] = max(0.0, pulse[0] - dt * 5)

    def pop(i, r):
        rot = ring_a(i)
        for _ in range(min(70, 20 + int(r / 6))):
            a = rot + GAP / 2 + rnd.random() * (TAU - GAP)
            sp = S * (0.15 + rnd.random() * 0.5)
            particles.append([math.cos(a) * r, math.sin(a) * r,
                              math.cos(a) * sp + (rnd.random() - .5) * S * .2,
                              math.sin(a) * sp + (rnd.random() - .5) * S * .2,
                              1.0, 0.9 + rnd.random() * 1.2, i])
        st['first'] += 1
        pulse[0] = 1.0
        pops.append(st['t'])

    # ---------------- Rendu vidéo ----------------
    fps = args.fps
    nframes = int(args.duree * fps)
    sub = 8
    surf = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    cr = cairo.Context(surf)
    trail = []
    max_r = math.hypot(W, H) / 2 + 4

    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra',
                           '-s', f'{W}x{H}', '-r', str(fps), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
                           '_video_muette.mp4'], stdin=subprocess.PIPE)

    for f in range(nframes):
        for _ in range(sub):
            step(1 / fps / sub)
        trail.append((ball[0], ball[1]))
        if len(trail) > 22: trail.pop(0)

        cr.identity_matrix()
        cr.set_source_rgb(7/255, 6/255, 11/255)
        cr.paint()
        cr.translate(W / 2, H / 2)

        cr.set_line_width(LW)
        cr.set_line_cap(cairo.LINE_CAP_ROUND)
        for i in range(st['first'], N):
            r = ring_r(i)
            if r > max_r: break
            if r <= 1: continue
            rot = ring_a(i)
            cr.set_source_rgb(*color[i])
            cr.new_path()
            cr.arc(0, 0, r, rot + GAP / 2, rot - GAP / 2 + TAU)
            cr.stroke()

        for p in particles:
            cr.set_source_rgba(*color[p[6]], max(0, p[4]))
            cr.rectangle(p[0] - LW, p[1] - LW, LW * 2, LW * 2)
            cr.fill()

        g = cairo.RadialGradient(0, 0, 0, 0, 0, R0)
        g.add_color_stop_rgba(0, 160/255, 140/255, 1, 0.10)
        g.add_color_stop_rgba(1, 160/255, 140/255, 1, 0)
        cr.set_source(g); cr.arc(0, 0, R0, 0, TAU); cr.fill()

        # compteur
        remaining = N - st['first']
        txt = str(remaining) if remaining > 0 else 'BRAVO'
        cr.select_font_face('DejaVu Sans', cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_BOLD)
        cr.set_font_size(S * 0.105 * (1 + pulse[0] * 0.12))
        ext = cr.text_extents(txt)
        x = -ext.x_bearing - ext.width / 2
        y = -ext.y_bearing - ext.height / 2
        cr.set_source_rgba(0, 0, 0, 0.45); cr.move_to(x + 4, y + 5); cr.show_text(txt)
        cr.set_source_rgb(1, 1, 1); cr.move_to(x, y); cr.show_text(txt)

        # traînée
        for k in range(1, len(trail)):
            a = k / len(trail)
            cr.set_source_rgba(190/255, 160/255, 1, a * 0.55)
            cr.set_line_width(BR * 1.6 * a)
            cr.move_to(*trail[k - 1]); cr.line_to(*trail[k]); cr.stroke()

        # balle + halo
        for rr, al in ((BR * 3.2, 0.10), (BR * 2.2, 0.18), (BR * 1.5, 0.3)):
            cr.set_source_rgba(180/255, 150/255, 1, al)
            cr.arc(ball[0], ball[1], rr, 0, TAU); cr.fill()
        cr.set_source_rgb(0.94, 0.92, 1)
        cr.arc(ball[0], ball[1], BR, 0, TAU); cr.fill()

        surf.flush()
        ff.stdin.write(bytes(surf.get_data()))
        if f % (fps * 5) == 0:
            print(f'image {f}/{nframes}  anneaux restants {N - st["first"]}', flush=True)

    ff.stdin.close(); ff.wait()

    # ---------------- Audio ----------------
    sr = 44100
    total = int((args.duree + 2) * sr)
    audio = np.zeros(total, dtype=np.float64)

    def add(t0, freq, dur, vol, harm=((1, 1), (2, .45), (3, .2), (4, .1)), decay=3.0):
        i0 = int(t0 * sr)
        ln = min(int(dur * sr), total - i0)
        if ln <= 0: return
        tt = np.arange(ln) / sr
        env = np.exp(-tt * decay) * np.minimum(1, tt / 0.004)
        sig = sum(a * np.sin(TAU * freq * h * tt) * np.exp(-tt * decay * (h - 1) * 0.6) for h, a in harm)
        audio[i0:i0 + ln] += vol * env * sig

    last = -1
    k = 0
    for t in bounces:
        if t - last < 0.07: continue
        last = t
        idx = k % len(MELODY); k += 1
        add(t, MELODY[idx], 1.6, 0.30)
        nm = MELODY_NAMES[idx]
        if nm in BASS:
            add(t, BASS[nm], 1.8, 0.18, decay=2.0)
    for t in pops:
        add(t, 2093.0, 0.35, 0.05, harm=((1, 1), (2.76, .4)), decay=10)

    # petite réverbération (filtres en peigne)
    wet = np.zeros_like(audio)
    for dl, fb in ((0.0297, .6), (0.0371, .58), (0.0411, .56), (0.0437, .54)):
        d = int(dl * sr)
        buf = audio.copy()
        for _ in range(6):
            buf[d:] += buf[:-d] * fb * 0.5
        wet += buf
    audio = audio + wet * 0.08
    audio /= max(1e-9, np.abs(audio).max()) / 0.85
    pcm = (audio * 32767).astype(np.int16)
    with wave.open('_audio.wav', 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(pcm.tobytes())

    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', '_video_muette.mp4', '-i', '_audio.wav',
                    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', args.sortie], check=True)
    import os
    os.remove('_video_muette.mp4'); os.remove('_audio.wav')
    print(f'OK -> {args.sortie}  ({len(bounces)} rebonds, {len(pops)} anneaux éclatés)')


def hsl(h, s, l):
    import colorsys
    return colorsys.hls_to_rgb(h, l, s)


if __name__ == '__main__':
    main()
