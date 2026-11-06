#!/usr/bin/env bash
# Builds the film page, renders 360 frames at 1920x1080/24 fps, synthesizes the score and muxes out/tidebreaker.mp4.
set -e
. ~/.local/opt/env.sh
cd "$(dirname "$0")"
S="${TEARDOWN_DIR:-$HOME/.claude/skills/teardown}"
node gen_timeline.mjs > /dev/null
node "$S/sims/build.mjs" ./film
CHROMIUM="$CHS" node "$S/sims/capture.mjs" film --size 1280x720 --dpr 1.5 --fps 24 --crf 17 --out teardown-out/tidebreaker-silent.mp4
python3 "$S/run_sfx.py" film/score.py
mkdir -p out
ffmpeg -v error -y -i teardown-out/tidebreaker-silent.mp4 -i teardown-out/tidebreaker-score.wav \
  -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest -movflags +faststart out/tidebreaker.mp4
echo "→ out/tidebreaker.mp4"
