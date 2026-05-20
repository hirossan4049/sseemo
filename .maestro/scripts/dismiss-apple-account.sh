#!/bin/bash
# Dismiss the iOS simulator's "Apple Account にサインイン" sheet that
# StoreKit raises after `clearKeychain: true`. The sheet lives in
# SpringBoard's process tree (outside our app), so Maestro can't see it.
# We blindly send the system "Cancel" via AppleScript / accessibility.
set -uo pipefail

# Best-effort: only attempt if the simulator window is frontmost.
osascript <<'OSA' 2>/dev/null || true
tell application "System Events"
  if (exists (process "Simulator")) then
    tell process "Simulator"
      set frontmost to true
      try
        click button "キャンセル" of sheet 1 of window 1
      end try
      try
        click button "Cancel" of sheet 1 of window 1
      end try
      try
        keystroke return
      end try
    end tell
  end if
end tell
OSA
exit 0
