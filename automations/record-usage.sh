#!/usr/bin/env bash
# Records Claude's plan usage (the 5-hour session and 7-day limits /usage
# shows) for Agent Inbox. Sidebar data doesn't carry it, but Claude Code hands
# it to the statusline, so call this from your statusline command with the
# statusline's JSON on stdin:
#
#   printf '%s' "$input" | /path/to/automations/record-usage.sh
#
# It keeps the latest values in a cache file, as
#   "5h=<percent>@<reset epoch> 7d=<percent>@<reset epoch> t=<epoch recorded>"
# and, when they change, has workspace-state.sh copy them into the
# description of the workspace this session runs in. It returns at once and
# does the cmux calls in the background, so the statusline isn't held up.
set -uo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/cmux.app/Contents/Resources/bin:$PATH"

cache="${XDG_CACHE_HOME:-$HOME/.cache}/cmux-agent-inbox/usage"
line="$(jq -r '[.rate_limits // {} | (.five_hour, .seven_day) | select(.used_percentage != null)] as $l
  | if ($l | length) == 2 then "5h=\($l[0].used_percentage | floor)@\($l[0].resets_at // 0) 7d=\($l[1].used_percentage | floor)@\($l[1].resets_at // 0)" else empty end' 2>/dev/null)"
[ -n "$line" ] || exit 0

mkdir -p "$(dirname "$cache")"
cached="$(cat "$cache" 2>/dev/null || true)"
[ "${cached% t=*}" = "$line" ] && exit 0
printf '%s t=%s\n' "$line" "$(date +%s)" >"$cache"

[ -n "${CMUX_WORKSPACE_ID:-}" ] || exit 0
"$(dirname "$0")/workspace-state.sh" usage "$CMUX_WORKSPACE_ID" >/dev/null 2>&1 </dev/null &
disown
