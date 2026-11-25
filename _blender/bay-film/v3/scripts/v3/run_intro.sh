#!/bin/bash
cd /home/claude/bay3d/v3
echo "$(date +%T) START intro" >> pkg/progress.log
python3 anim_v3.py frames pkg/intro/frames 720 1280 32 > pkg/last_intro.log 2>&1
echo "$(date +%T) END intro rc=$?" >> pkg/progress.log
