"""TIDEBREAKER score: a small synthesized orchestra on the film's timeline.

D minor, ~140 bpm feel. A calm sea and a harp, a muffled dive with a whale call and a riser into the breach,
a string ostinato and taiko while the tug flies, a heroic brass line from the leap through the catch, hits on
the landing and the whale's crash, then D major: a tug horn, the spout, a chime under the title.

    python ~/.claude/skills/teardown/run_sfx.py film/score.py

Every time comes from timeline.json (written from timeline.js by gen_timeline.mjs).
"""

import math
import os
import random

from sfx.synth import SR, bandnoise, chime, impact, riser, whoosh
from sfx.score_kit import bang, hz

TIMELINE = "timeline.json"
OUT = os.path.join(os.environ.get("TEARDOWN_OUT", "teardown-out"), "tidebreaker-score.wav")
TARGET_LUFS = -15.0
SEED = 7
rnd = random.Random(7)


# ---------------------------------------------------------------- voices
def _a(fc):
    return 1 - math.exp(-2 * math.pi * fc / SR)


def env(n, att, rel, sus=1.0):
    a, r = max(1, int(att * SR)), max(1, int(rel * SR))
    out = []
    for k in range(n):
        g = min(1.0, k / a) * sus
        if k > n - r:
            g *= max(0.0, (n - k) / r)
        out.append(g)
    return out


def strings(names, dur, att=0.4, rel=0.6, fc=1800.0, detune=0.004, vib=5.2):
    """Ensemble pad: three detuned saws per note, low-passed; returns (l, r)."""
    n = int(dur * SR)
    e = env(n, att, rel)
    outs = []
    for side in (-1, 1):
        y = [0.0] * n
        for nm in names:
            f0 = hz(nm)
            for d in (-detune, 0.0, detune):
                f = f0 * (1 + d * side * 0.7 + d * 0.3)
                ph = rnd.random()
                vp = rnd.random() * 6.28
                for k in range(n):
                    ph += f * (1 + 0.0025 * math.sin(vp + 2 * math.pi * vib * k / SR)) / SR
                    ph -= int(ph)
                    y[k] += 2 * ph - 1
        a = _a(fc)
        lp = lp2 = 0.0
        g = 0.12 / max(1, len(names))
        for k in range(n):
            lp += a * (y[k] - lp)
            lp2 += a * (lp - lp2)
            y[k] = lp2 * e[k] * g
        outs.append(y)
    return outs[0], outs[1]


def brass(name, dur, vel=1.0):
    """Brass note: saws with a filter that opens on the attack and a small pitch scoop."""
    n = int(dur * SR)
    f0 = hz(name)
    y = [0.0] * n
    phs = [rnd.random() for _ in range(3)]
    lp = lp2 = 0.0
    rel = min(0.12, dur * 0.4)
    for k in range(n):
        t = k / SR
        scoop = 1 - 0.03 * math.exp(-t / 0.04)
        s = 0.0
        for i, d in enumerate((-0.003, 0.0, 0.003)):
            phs[i] += f0 * scoop * (1 + d) / SR
            phs[i] -= int(phs[i])
            s += 2 * phs[i] - 1
        fc = 500 + 2600 * vel * (1 - math.exp(-t / 0.05)) * (0.75 + 0.25 * math.exp(-t / 0.3))
        a = _a(fc)
        lp += a * (s - lp)
        lp2 += a * (lp - lp2)
        g = min(1, t / 0.025) * (0.85 + 0.15 * math.exp(-t / 0.2))
        if t > dur - rel:
            g *= max(0, (dur - t) / rel)
        y[k] = math.tanh(lp2 * 0.9) * g * 0.5 * vel
    return y


def taiko(f=62, vel=1.0, decay=0.38):
    n = int(0.9 * SR)
    noise = bandnoise(n, lambda k: 900, q=0.7)
    out = []
    ph = 0.0
    for k in range(n):
        t = k / SR
        ph += 2 * math.pi * f * (1 + 0.6 * math.exp(-t / 0.025)) / SR
        out.append(vel * math.tanh(1.4 * (math.sin(ph) * math.exp(-t / decay) + noise[k] * 1.2 * math.exp(-t / 0.018))))
    return out


def cymbal(dur=2.4, level=1.0):
    n = int(dur * SR)
    x = bandnoise(n, lambda k: 7200, q=0.4)
    return [level * x[k] * 1.4 * math.exp(-k / (0.55 * SR)) * min(1, k / (0.004 * SR)) for k in range(n)]


def splash(dur=2.2, level=1.0, fc=1400, seed=0):
    """Water: a broad noise burst that settles into hiss, with a low body."""
    n = int(dur * SR)
    x = bandnoise(n, lambda k: fc * (0.6 + 0.8 * math.exp(-k / (0.25 * SR))), q=0.45)
    out = []
    ph = 0.0
    for k in range(n):
        t = k / SR
        ph += 2 * math.pi * (55 + 40 * math.exp(-t / 0.08)) / SR
        g = min(1, t / 0.01) * (0.35 + 0.65 * math.exp(-t / 0.35)) * math.exp(-t / (dur * 0.45))
        out.append(level * (x[k] * 1.6 * g + 0.5 * math.sin(ph) * math.exp(-t / 0.25)))
    return out


def ocean(dur, level=1.0):
    n = int(dur * SR)
    x = bandnoise(n, lambda k: 380 + 240 * math.sin(2 * math.pi * k / SR / 3.7), q=0.35)
    return [level * x[k] * (0.55 + 0.45 * math.sin(2 * math.pi * k / SR / 3.7 - 1.0)) * min(1, k / SR, (n - k) / SR) for k in range(n)]


def whale_call(dur=1.3, f0=210, f1=120, level=1.0):
    n = int(dur * SR)
    out = []
    ph = 0.0
    lp = 0.0
    a = _a(900)
    for k in range(n):
        x = k / n
        f = f0 * (f1 / f0) ** x * (1 + 0.04 * math.sin(2 * math.pi * 5.5 * k / SR) * x)
        ph += 2 * math.pi * f / SR
        s = math.sin(ph) + 0.45 * math.sin(2 * ph + 0.3) + 0.2 * math.sin(3 * ph)
        lp += a * (s - lp)
        out.append(level * lp * math.sin(math.pi * x) ** 0.7)
    return out


def horn(dur=0.9, level=1.0):
    """Tug horn: two low reedy tones a third apart."""
    n = int(dur * SR)
    out = []
    phs = [0.0, 0.0]
    lp = lp2 = 0.0
    a = _a(1100)
    for k in range(n):
        t = k / SR
        s = 0.0
        for i, f in enumerate((hz("A2"), hz("C#3"))):
            phs[i] += f * (1 + 0.002 * math.sin(30 * t)) / SR
            phs[i] -= int(phs[i])
            s += (1 if phs[i] < 0.42 else -1) * 0.5
        lp += a * (s - lp)
        lp2 += a * (lp - lp2)
        g = min(1, t / 0.06) * min(1, (dur - t) / 0.15)
        out.append(level * lp2 * g)
    return out


def harp(name, dur=1.6, vel=1.0):
    n = int(dur * SR)
    f = hz(name)
    out = []
    ph = 0.0
    for k in range(n):
        t = k / SR
        ph += 2 * math.pi * f / SR
        out.append(vel * (math.sin(ph) + 0.3 * math.sin(2 * ph) * math.exp(-t / 0.15)) * math.exp(-t / 0.5) * min(1, t / 0.003))
    return out


def lowpass(x, fc):
    a = _a(fc)
    y = 0.0
    out = []
    for s in x:
        y += a * (s - y)
        out.append(y)
    return out


# ---------------------------------------------------------------- the cue sheet
def score(mix, tl):
    b = tl["beats"]
    dur = tl["duration"]
    UNDER, BREACH, HEAD, ALERT, CROUCH, LEAP = b["under"], b["breach"], b["headland"], b["alert"], b["crouch"], b["leap"]
    AIR, CATCH, LAND, WCRASH, CALM = b["air"], b["catch"], b["land"], b["wcrash"], b["calm"]
    HORN, SPOUT, TITLE = b["horn"], b["spout"], b["title"]

    # sea bed, out of the water only
    mix.put(0, ocean(UNDER + 0.2), 0.10)
    mix.put(HEAD, ocean(LEAP - HEAD + 0.4), 0.05)
    mix.put(CALM - 0.2, ocean(dur - CALM + 0.2), 0.10)

    # 1. calm sea: Dm pad + harp arpeggio, tug putter
    l, r = strings(["D3", "A3", "F4"], UNDER + 0.3, att=0.8, rel=0.4, fc=1400)
    mix.put_stereo(0, l, r, 0.9)
    arp = ["D4", "F4", "A4", "D5", "A4", "F4", "E4", "A4"]
    for i in range(9):
        mix.put(0.2 + i * 0.25, harp(arp[i % len(arp)], vel=0.8), 0.07, pan=-0.3 + 0.6 * (i % 2))
    l, r = strings(["D2", "A2"], 1.2, att=0.9, rel=0.2, fc=500)
    mix.put_stereo(UNDER - 1.0, l, r, 1.4)  # the shadow arrives

    # 2. underwater: muffled Bb, whale call, riser into the breach
    l, r = strings(["Bb1", "Bb2", "D3", "F3"], BREACH - UNDER + 0.1, att=0.15, rel=0.05, fc=520)
    mix.put_stereo(UNDER, l, r, 1.5)
    mix.put(UNDER + 0.15, whale_call(1.25, 230, 130), 0.16, pan=0.2)
    mix.put(UNDER, lowpass(riser(BREACH - UNDER, 200, 3800), 4000), 0.13)

    # 3. breach: hit, splash, ostinato + taiko
    mix.put(BREACH, impact(1.4), 0.32)
    mix.put(BREACH, splash(2.6, fc=1500), 0.22)
    mix.put(BREACH, cymbal(2.6), 0.07)
    for nm in ("D3", "A3", "D4"):
        mix.put(BREACH, brass(nm, 0.7), 0.17)
    step = 60 / 140 / 2
    k = 0
    t = BREACH + step * 2
    while t < HEAD - 0.05:
        nm = ("D3", "D3", "A3", "D3", "F3", "D3", "E3", "A2")[k % 8]
        l, r = strings([nm, "D2" if k % 4 == 0 else nm], step * 0.95, att=0.01, rel=0.05, fc=2600)
        mix.put_stereo(t, l, r, 0.9)
        if k % 2 == 0:
            mix.put(t, taiko(58, 0.8 if k % 4 == 0 else 0.5), 0.2)
        t += step
        k += 1
    l, r = strings(["Bb2", "D3", "F3"], HEAD - BREACH - 0.9, att=0.4, rel=0.2, fc=1600)
    mix.put_stereo(BREACH + 0.9, l, r, 0.7)

    # 4. headland: tremolo suspense on A, visor shing, riser into the leap
    l, r = strings(["A2", "E3", "A3"], LEAP - HEAD, att=0.05, rel=0.05, fc=1500)
    trem = [0.55 + 0.45 * math.sin(2 * math.pi * 14 * i / SR) for i in range(len(l))]
    cres = [0.5 + 0.8 * i / len(l) for i in range(len(l))]
    mix.put_stereo(HEAD, [a * b_ * c for a, b_, c in zip(l, trem, cres)], [a * b_ * c for a, b_, c in zip(r, trem, cres)], 1.0)
    mix.put(ALERT, chime([hz("A6"), hz("E7")], 1.4, 0.4), 0.08)
    mix.put(ALERT, whoosh(0.35, 3000, 9000, 0.2), 0.05)
    mix.put(CROUCH, riser(LEAP - CROUCH, 300, 6000), 0.12)

    # 5. the leap: boom, whoosh, heroic brass over Dm Bb C F, driving taiko
    mix.put(LEAP, bang(1.0, seed=3), 0.3)
    mix.put(LEAP, whoosh(1.1, 260, 3200, 0.3), 0.18)
    motif = [(0.0, "D4", 0.34), (0.36, "A4", 0.42), (0.80, "D5", 0.62), (1.42, "C5", 0.22), (1.64, "Bb4", 0.18)]
    for dt, nm, d in motif:
        mix.put(LEAP + dt, brass(nm, d), 0.2, pan=-0.1)
        mix.put(LEAP + dt, brass(nm.replace("4", "3").replace("5", "4"), d), 0.12, pan=0.1)
    prog = [(LEAP, ["D3", "F3", "A3"]), (LEAP + 0.80, ["Bb2", "D3", "F3"]), (LEAP + 1.42, ["C3", "E3", "G3"]), (CATCH, ["F3", "A3", "C4"])]
    for i, (t0, ch) in enumerate(prog):
        t1 = prog[i + 1][0] if i + 1 < len(prog) else LAND
        l, r = strings(ch + [ch[0].replace("3", "2")], t1 - t0 + 0.05, att=0.05, rel=0.05, fc=2400)
        mix.put_stereo(t0, l, r, 1.1)
    t = LEAP + step * 2
    k = 0
    while t < LAND - 0.05:
        mix.put(t, taiko(66 if k % 4 else 52, 0.9 if k % 4 == 0 else 0.45), 0.22)
        t += step
        k += 1
    mix.put(AIR, whoosh(0.9, 900, 300, 0.4), 0.1)
    # the catch
    mix.put(CATCH, chime([hz("F5"), hz("A5"), hz("C6")], 1.6, 0.6), 0.12)
    mix.put(CATCH, taiko(48, 1.0, 0.5), 0.25)
    mix.put(CATCH, brass("A4", 0.5), 0.2)
    mix.put(CATCH + 0.5, brass("C5", 0.38), 0.2)
    mix.put(LAND - 0.45, whoosh(0.45, 400, 2400, 0.85), 0.14)

    # 6. landing + whale crash
    mix.put(LAND, impact(1.6), 0.36)
    mix.put(LAND, splash(2.4, fc=1300, seed=1), 0.26)
    mix.put(LAND, cymbal(2.0), 0.06)
    for nm in ("D3", "A3", "D4", "F4"):
        mix.put(LAND, brass(nm, 0.9), 0.15)
    l, r = strings(["D2", "D3", "A3", "F4"], WCRASH - LAND + 0.1, att=0.02, rel=0.3, fc=2000)
    mix.put_stereo(LAND, l, r, 1.0)
    mix.put(WCRASH, bang(0.9, seed=5), 0.22)
    mix.put(WCRASH, splash(2.8, fc=1100, seed=2), 0.28)
    l, r = strings(["Bb1", "Bb2", "F3", "D4"], CALM - WCRASH + 0.4, att=0.05, rel=0.5, fc=1800)
    mix.put_stereo(WCRASH, l, r, 1.0)
    for nm in ("Bb3", "F4"):
        mix.put(WCRASH, brass(nm, 0.8), 0.12)

    # 7. calm: D major, horn, spout, title chime, long resolve
    l, r = strings(["D3", "A3", "F#4", "D5"], SPOUT - CALM + 0.4, att=0.5, rel=0.4, fc=1900)
    mix.put_stereo(CALM, l, r, 1.0)
    l, r = strings(["G2", "D3", "B3", "G4", "A4"], TITLE - SPOUT + 0.4, att=0.4, rel=0.4, fc=2000)
    mix.put_stereo(SPOUT, l, r, 1.0)
    l, r = strings(["D2", "D3", "A3", "F#4", "E5"], dur - TITLE, att=0.4, rel=1.3, fc=2200)
    mix.put_stereo(TITLE, l, r, 1.1)
    for i, nm in enumerate(["D5", "F#5", "A5", "D6", "A5", "F#5", "E5", "A5", "D5", "F#5", "A5", "B5", "A5", "F#5"]):
        mix.put(CALM + 0.25 + i * 0.28, harp(nm, vel=0.7), 0.06, pan=-0.35 + 0.7 * (i % 2))
    mix.put(HORN, horn(0.75), 0.12, pan=0.15)
    mix.put(HORN + 0.95, horn(0.5), 0.09, pan=0.15)
    mix.put(SPOUT, whoosh(1.4, 400, 4800, 0.25), 0.13)
    mix.put(SPOUT + 0.1, bandnoise(int(1.8 * SR), lambda k: 5000, q=0.5), 0.0)
    mix.put(SPOUT + 0.2, [x * math.exp(-k / (0.6 * SR)) for k, x in enumerate(bandnoise(int(1.8 * SR), lambda k: 5200, q=0.5))], 0.06)
    mix.put(SPOUT + 0.3, whale_call(1.0, 260, 330, 0.8), 0.06, pan=-0.3)
    mix.put(TITLE, chime([hz("D6"), hz("F#6"), hz("A6"), hz("D7")], 2.2, 0.9), 0.12)
    for nm in ("D4", "A4", "D5"):
        mix.put(TITLE, brass(nm, 1.6, 0.7), 0.1)
