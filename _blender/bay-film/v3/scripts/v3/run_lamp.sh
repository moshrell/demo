#!/bin/bash
cd /home/claude/bay3d/v3; export SPP=56 CSPP=32
echo "$(date +%T) START lamp2" >> pkg/progress.log
python3 render_pkg.py clip lack 36 lamp > pkg/last_lamp.log 2>&1
echo "$(date +%T) END lamp2 rc=$?" >> pkg/progress.log
