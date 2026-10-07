#!/usr/bin/env bash
# Keeps two things in each workspace's description, which custom sidebars can
# read (they are not given notification text or hook history):
#
#   1. Claude's latest notification text (the "what I did" summary the stock
#      sidebar shows).
#   2. A trailing invisible marker (U+2063) meaning "Claude finished its turn
#      and nothing has been submitted since". cmux reports Claude's idle
#      reminder (~60s after a turn ends) as needs-input, exactly like a real
#      permission prompt or question; the marker lets Agent Inbox tell them
#      apart.
#
# Run by the cmux automation rules install.sh adds, with the event in
# $CMUX_AUTOMATION_EVENT_JSON:
#   workspace-state.sh stop          on agent.hook.Stop              add marker
#   workspace-state.sh prompt        on agent.hook.UserPromptSubmit  drop marker
#   workspace-state.sh notification  on notification.created         new summary, keep marker
# or by hand for one workspace:
#   workspace-state.sh notification <workspace-id>
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/cmux.app/Contents/Resources/bin:$PATH"

MARK=$'⁣'
mode="$1"
ws="${2:-}"
if [ -z "$ws" ]; then
  ws="$(printf '%s' "${CMUX_AUTOMATION_EVENT_JSON:-}" | jq -r '.workspace_id // .payload.workspace_id // empty')"
fi
[ -n "$ws" ] || exit 0

# Stop and the notification it triggers land together; serialize the
# read-modify-write of each workspace's description so neither loses the other.
if [ -z "${CMUX_PANEL_LOCKED:-}" ]; then
  export CMUX_PANEL_LOCKED=1
  exec lockf -k -t 20 "${TMPDIR:-/tmp}/cmux-panel-$ws.lock" "$0" "$mode" "$ws"
fi

snapshot="$(cmux rpc extension.sidebar.snapshot '{}')"
current="$(jq -r --arg ws "$ws" '.workspaces[] | select(.id == $ws) | .description // empty' <<<"$snapshot")"
summary="${current%"$MARK"}"
marked=""
[ "$summary" != "$current" ] && marked="$MARK"

case "$mode" in
  stop) marked="$MARK" ;;
  prompt) marked="" ;;
  notification)
    text="$(jq -r --arg ws "$ws" '.workspaces[] | select(.id == $ws) | .latest_notification_text // empty' <<<"$snapshot")"
    [ -n "$text" ] && summary="$text"
    ;;
  *) echo "usage: $0 stop|prompt|notification [workspace-id]" >&2; exit 2 ;;
esac

next="$summary$marked"
[ "$next" = "$current" ] && exit 0
if [ -z "$next" ]; then
  cmux workspace-action --workspace "$ws" --action clear-description >/dev/null
else
  cmux workspace-action --workspace "$ws" --action set-description --description "$next" >/dev/null
fi
