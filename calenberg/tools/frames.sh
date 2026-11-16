#!/bin/sh
# PNG-кадры из ../uhren/film.py -> public/seq (800x1000), public/seq/hd (1200x1500), src/data/seq.json
# usage: tools/frames.sh <папка с PNG>      (обёртка: всю работу делает tools/seq.mjs на sharp, ffmpeg не нужен)
exec node "$(dirname "$0")/seq.mjs" "${1:-../uhren/frames}"
