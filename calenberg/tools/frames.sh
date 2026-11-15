#!/bin/sh
# PNG frames from uhren/film.py -> public/seq/*.webp   usage: tools/frames.sh <frames_dir>
for f in "$1"/*.png; do o="public/seq/$(basename "${f%.png}").webp"; [ -f "$o" ] || ffmpeg -loglevel error -y -i "$f" -c:v libwebp -quality 80 -compression_level 6 "$o"; done
ls public/seq | wc -l; du -sh public/seq
