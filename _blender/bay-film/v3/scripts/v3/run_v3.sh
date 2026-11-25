#!/bin/bash
cd /home/claude/bay3d/v3
export SPP=56 CSPP=32
run(){ echo "$(date +%T) START $*" >> pkg/progress.log; python3 render_pkg.py "$@" > pkg/last_$1.log 2>&1; echo "$(date +%T) END $* rc=$?" >> pkg/progress.log; }
echo "=== resume ===" >> pkg/progress.log
run clip lack 36
run clip wheel 36
run clip interior 36
echo ALLDONE2 >> pkg/progress.log
