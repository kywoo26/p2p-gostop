#!/usr/bin/env bash
# spec AI-04·AI-05·AI-07·AI-08·AC-03, plan §1.5·§4 테스트 전략
# 저장소 루트의 개발 컨테이너에서 실행: bash tools/sim/ac03-retry.sh <단계>
set -euo pipefail

phase=${1:?baseline|training|validation|timing}
workers=8
out=tools/sim/results/ac03-retry

run_match() {
  local label=$1 iterations=$2 opponent=$3 rounds=$4 seed=$5
  shift 5
  npm run sim -- --a commercial --b "$opponent" \
    --a-iterations "$iterations" --rounds "$rounds" --seed "$seed" \
    --workers "$workers" --mc 2000 --out "$out/$label" \
    --label "AC-03 $label source 9f778f3" "$@"
}

case "$phase" in
  baseline)
    for opponent in normal easy; do
      run_match "baseline-$opponent" 2000 "$opponent" 2000 1
    done
    ;;
  training)
    for iterations in 2000 4000; do
      for opponent in normal easy; do
        run_match "train-$iterations-$opponent" "$iterations" "$opponent" 400 100
      done
    done
    ;;
  validation)
    for opponent in normal easy; do
      run_match "candidate-$opponent" 4000 "$opponent" 2000 1
    done
    ;;
  timing)
    # 같은 작업의 대량 측정·빌드 종료 후 1워커로 실행. 공유 호스트 부하는 별도 기록한다.
    workers=1
    for iterations in 2000 4000; do
      for opponent in normal easy; do
        run_match "timing-$iterations-$opponent" "$iterations" "$opponent" 60 7 --time-ms 1000
      done
    done
    ;;
  *)
    echo "알 수 없는 단계: $phase" >&2
    exit 1
    ;;
esac
