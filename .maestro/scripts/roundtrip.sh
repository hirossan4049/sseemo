#!/bin/bash
# Wraps the managed-roundtrip dev deeplink with a log tail so we can assert
# the in-app "[VERIFY] managed roundtrip OK" line was emitted. Maestro's
# runScript invokes this from 02_managed_roundtrip.yaml after the app is
# already up on the Welcome screen.
set -euo pipefail
LOG=/tmp/sim-maestro.log
PIDFILE=/tmp/sim-maestro.log.pid
# Stop any stale streamer
if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  kill "$(cat "$PIDFILE")" 2>/dev/null || true
fi
: > "$LOG"
# Start a fresh log stream filtered to the app. Background it.
nohup xcrun simctl spawn booted log stream \
  --level=debug \
  --predicate 'processImagePath contains "SecStorage"' \
  > "$LOG" 2>&1 &
echo $! > "$PIDFILE"
# Give the log subsystem a moment to attach before we fire the deeplink.
sleep 2
xcrun simctl openurl booted "secstoragedev://onboard?tag=maestro-rt&verify=1" >/dev/null
# Poll up to 120s for the [VERIFY] line. runManagedRoundtrip does a full
# 200 KB encrypt/upload/download/byte-compare so it's not instant.
DEADLINE=$(( $(date +%s) + 120 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  if grep -q "VERIFY.*managed roundtrip OK" "$LOG" 2>/dev/null; then
    echo "verify-ok"
    kill "$(cat "$PIDFILE")" 2>/dev/null || true
    rm -f "$PIDFILE"
    exit 0
  fi
  sleep 1
done
echo "[roundtrip] [VERIFY] managed roundtrip OK not seen in $LOG" >&2
tail -80 "$LOG" >&2 || true
kill "$(cat "$PIDFILE")" 2>/dev/null || true
rm -f "$PIDFILE"
exit 1
