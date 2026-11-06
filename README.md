# TIDEBREAKER

A 15-second cel-shaded anime short, made in the visual style of [vcproo/video-11](https://github.com/vcproo/video-11)
but with a new story. That style is saturated blue skies, lavender-shaded cumulus clouds, a stylised ocean, a chrome
giant, a humpback whale, chunky white splashes, hard cuts and speed lines.

**Story.** A little red tug crosses a calm sea while a dark shape slides beneath it. A humpback breaches and throws the
tug into the sky. A chrome giant standing like a statue on a far headland comes alive, leaps, catches the tug in mid-air
and lands knee-deep as the whale crashes down behind it. In the calm that follows, the giant holds the tug up safe, the
whale surfaces alongside and blows a rainbow spout, and the camera pulls back to the title.

| Shot | Time | |
|---|---|---|
| 1 | 0.0–2.4 s | Tug and headland statue, the whale's shadow closes in |
| 2 | 2.4–3.7 s | Underwater: the whale rises under the hull |
| 3 | 3.7–5.6 s | Breach, the tug is thrown skyward |
| 4 | 5.6–7.1 s | The giant's visor flashes; crouch and leap |
| 5 | 7.1–9.0 s | Mid-air tracking shot and the catch |
| 6 | 9.0–11.2 s | Landing splash, the whale crashes down behind |
| 7 | 11.2–15.0 s | Tug safe on the palm, spout and rainbow, title |

## How it's made

Everything is procedural: there are no models, textures or audio samples.

- `film/toon.js`: a two-tone cel shader with a stylised chrome mode, plus constant-width inverted-hull ink outlines.
- `film/world.js`: the gradient sky and the ocean shader (swell, foam strokes, boat wake, impact rings, the whale's
  shadow, and caustics seen from below). Also the cumulus clouds, the headland, container ships and god rays.
- `film/actors.js`: the tugboat, the whale (a bendable lathe body with fins and flukes) and the posable chrome giant.
- `film/fx.js`: ballistic, velocity-stretched splash, debris and mist particles, the rainbow, and a 2D overlay with focus
  lines, flash and the title card.
- `film/timeline.js`: the beats and the seven camera shots. `film/main.js`: poses, paths and `render(t)`.
- `film/score.py`: a synthesized orchestral score (strings, brass, taiko, splashes, whale call, tug horn) cued from
  the same beats. `gen_timeline.mjs` writes those beats to `film/timeline.json` for the score.

`render(t)` is a pure function of time, so every frame is captured exactly and the sound can't drift from the picture.

## Requirements

It reuses the toolchain already on this machine, so nothing needs installing:

- `~/.local/opt/env.sh`, which provides Node 22, FFmpeg 7 and `$CHS` (chrome-headless-shell).
- The teardown kit at `~/.claude/skills/teardown`, which provides three.js 0.186, esbuild, Playwright, frame capture and
  the `sfx` synth. Set `TEARDOWN_DIR` if it lives somewhere else.
- Python 3 (standard library only).

## Run

```bash
./render.sh        # → out/tidebreaker.mp4 (1920x1080, 24 fps, AAC 256k)
```

A full render takes a few minutes on CPU (SwiftShader). To look at single frames while you edit:

```bash
. ~/.local/opt/env.sh; S=~/.claude/skills/teardown
node $S/sims/build.mjs ./film
CHROMIUM=$CHS node $S/sims/capture.mjs film --size 1280x720 --dpr 1 --stills 1,4.5,8.45,13.5 --cols 2 --out teardown-out/sheet.png
```

You can also open `teardown-out/dist/film.html` in a browser to watch it play live.
