#!/bin/bash
# E2E: drive the multi-file managed roundtrip via deeplink, tail the
# simulator log, exit 0 when "[VERIFY] multi roundtrip ALL OK cases=N"
# appears, exit 1 on "[VERIFY] multi roundtrip FAILED",
# "[VERIFY] dev-onboard error", or timeout.
#
# Requires a booted iOS simulator with SecStorage installed and Metro up.
set -uo pipefail

BUNDLE_ID="${BUNDLE_ID:-org.reactjs.native.example.SecStorage}"
TIMEOUT="${E2E_MULTI_TIMEOUT:-360}"
TAG="${E2E_TAG:-cli-$(date +%s)}"
LOG="${LOG:-/tmp/sim-e2e-multi.log}"
PIDFILE="${LOG}.pid"

# Ensure a sim is booted.
BOOTED=$(xcrun simctl list devices booted 2>/dev/null | grep -E "Booted" | head -1)
if [ -z "$BOOTED" ]; then
  echo "[e2e-multi] booting iPhone 16..."
  xcrun simctl boot "iPhone 16" >/dev/null 2>&1 || true
  open -a Simulator
  sleep 6
fi

# Kill stale streamer if any.
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  kill "$(cat "$PIDFILE")" 2>/dev/null || true
fi
: > "$LOG"

# Stream filtered log in the background.
nohup xcrun simctl spawn booted log stream \
  --level=debug \
  --predicate 'processImagePath contains "SecStorage"' \
  > "$LOG" 2>&1 &
echo $! > "$PIDFILE"
trap 'kill "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null || true; rm -f "$PIDFILE"' EXIT

sleep 2

# Terminate so the URL handler fires cleanly on next launch.
xcrun simctl terminate booted "$BUNDLE_ID" >/dev/null 2>&1 || true
sleep 1
URL="secstoragedev://onboard?tag=${TAG}&verify=multi"
echo "[e2e-multi] opening $URL"
xcrun simctl openurl booted "$URL" >/dev/null

DEADLINE=$(( $(date +%s) + TIMEOUT ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if grep -q "VERIFY.*multi roundtrip ALL OK" "$LOG" 2>/dev/null; then
    echo "[e2e-multi] PASS"
    grep "VERIFY.*case=\|VERIFY.*multi roundtrip\|VERIFY.*encrypted index\|VERIFY.*final usage" "$LOG"
    exit 0
  fi
  if grep -q "VERIFY.*multi roundtrip FAILED" "$LOG" 2>/dev/null; then
    echo "[e2e-multi] FAIL — multi roundtrip FAILED" >&2
    grep "VERIFY" "$LOG" | tail -20 >&2
    exit 1
  fi
  if grep -q "VERIFY.*dev-onboard error" "$LOG" 2>/dev/null; then
    echo "[e2e-multi] FAIL — dev-onboard error" >&2
    grep "VERIFY" "$LOG" | tail -20 >&2
    exit 1
  fi
  sleep 2
done

echo "[e2e-multi] TIMEOUT after ${TIMEOUT}s" >&2
tail -60 "$LOG" >&2 || true
exit 1
