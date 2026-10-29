#!/usr/bin/env bash
# Keeps four things in each workspace's description, which custom sidebars can
# read (they are not given notification text or hook history):
#
#   1. Claude's latest notification text (the "what I did" summary the stock
#      sidebar shows).
#   2. A trailing invisible marker (U+2063) meaning "Claude finished its turn
#      and nothing has been submitted since". cmux reports Claude's idle
#      reminder (~60s after a turn ends) as needs-input, exactly like a real
#      permission prompt or question; the marker lets Agent Inbox tell them
#      apart.
#   3. Between the two, after an invisible separator (U+2064), the model each
#      of the workspace's Claude or Codex sessions used and, for Claude, when
#      you last prompted it, as "<first 8 chars of session id>=<model id>@<epoch>"
#      pairs. Hooks and sidebar data don't carry the model, and every subagent
#      hand-back starts a turn that looks like a new prompt, so both come from
#      each session's transcript, refreshed on every run. Agent Inbox times a
#      run from that prompt, across the hand-back turns it sets off. A Claude
#      session with background shells still running adds "~<epoch>,<epoch>",
#      when each started: sidebar data counts background subagents but not
#      shells, so a turn that ends with one running would otherwise look idle.
#   4. After the models, after another invisible separator (U+2062), Claude's
#      plan usage as record-usage.sh last cached it:
#      "5h=<percent>@<reset epoch> 7d=<percent>@<reset epoch> t=<epoch>".
#      Usage is account-wide, so every workspace carries the latest copy it
#      saw, and Agent Inbox shows the one with the newest t.
#
# When a turn finishes in the selected workspace it also marks the workspace
# unread. cmux doesn't count notifications for the workspace you're on, so
# without this the turn skips Agent Inbox's INBOX and goes straight to IDLE.
# Claude's notification for the turn clears a mark made before it, and it can
# land before or after Stop, so both Stop and a notification once the turn
# is done set it.
#
# Status pings are notifications too: Claude Code's idle reminder ("Claude is
# waiting for your input"), its permission prompt ("Claude needs your
# permission to use Bash") and cmux's "Agent is asking a question". They only
# hold while the session waits, and answering a question or permission fires
# no hook here, so a ping never outlives the next prompt or Stop, and the idle
# reminder, which says nothing a finished turn doesn't, never replaces the
# summary of the turn it follows.
#
# Run by the cmux automation rules install.sh adds, with the event in
# $CMUX_AUTOMATION_EVENT_JSON:
#   workspace-state.sh stop          on agent.hook.Stop              add marker
#   workspace-state.sh prompt        on agent.hook.UserPromptSubmit  drop marker
#   workspace-state.sh notification  on notification.created         new summary, keep marker
# and by record-usage.sh when usage changes:
#   workspace-state.sh usage <workspace-id>                            new usage
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

SEP="$(printf '\xe2\x81\xa4')"
USAGE_SEP="$(printf '\xe2\x81\xa2')"

# The latest model in each of the workspace's Claude sessions, from the last
# assistant message in its transcript, and the time of the last prompt you
# typed, from the last user entry of origin "human" (hand-backs are "peer",
# background task notices "task-notification"). "<synthetic>" entries don't
# start with "claude-", and quotes inside tool input or prompts are escaped,
# so neither pattern matches inside them.
# Codex records the selected model in turn_context.payload.model. Read the
# latest context rather than session defaults so model switches are reflected.
#
# Background shells a Claude session started (run_in_background, or a command
# sent to the background) and that haven't finished, as a comma-separated list
# of their start epochs. Each start leaves a tool result with a
# backgroundTaskId, and each end a task-notification naming that id
# (completed, failed, or killed by you) or, when Claude stops it, a TaskStop
# result with that task_id. Hooks don't fire when one finishes, but its
# notification starts a turn whose Stop refreshes this.
background_shells() {
  grep -F -e '"backgroundTaskId":"' -e '"origin":{"kind":"task-notification"' -e '"message":"Successfully stopped task' "$1" 2>/dev/null |
    jq -Rrs '[split("\n")[] | fromjson?] as $entries
      | [$entries[] | (select(.origin.kind? == "task-notification")
          | .message.content | tostring | (capture("<task-id>(?<id>[^<]+)</task-id>").id)?),
          (.toolUseResult.task_id? // empty)] as $done
      | [$entries[] | (.toolUseResult.backgroundTaskId?) as $id
          | select($id != null and ($done | index([$id]) | not))
          | .timestamp | sub("\\.[0-9]+Z$"; "Z") | fromdate | tostring] | join(",")' 2>/dev/null || true
}

session_models() {
  cmux sessions list --json |
    jq -r --arg ws "$ws" '.sessions[]
      | select((.agent == "claude" or .agent == "codex") and (.workspace_id | ascii_downcase) == ($ws | ascii_downcase) and .transcript_path != null)
      | "\(.agent)\t\(.session_id)\t\(.transcript_path)"' |
    while IFS=$'\t' read -r agent sid transcript; do
      if [ "$agent" = codex ]; then
        model="$(jq -Rn -r '
          reduce (inputs | fromjson? | select(.type == "turn_context")
            | .payload.model | select(type == "string" and length > 0)) as $model
            (""; $model)' "$transcript" 2>/dev/null || true)"
        if [ -n "$model" ]; then printf '%s=%s ' "${sid:0:8}" "$model"; fi
        continue
      fi
      model="$( (tail -r "$transcript" 2>/dev/null || true) | grep -m1 '"message":{"model":"claude-' | jq -r '.message.model // empty' || true)"
      asked="$( (tail -r "$transcript" 2>/dev/null || true) | grep -m1 '"origin":{"kind":"human"' |
        jq -r 'select(.type == "user") | .timestamp | sub("\\.[0-9]+Z$"; "Z") | fromdate' 2>/dev/null || true)"
      shells="$(background_shells "$transcript")"
      if [ -n "$model$asked$shells" ]; then printf '%s=%s%s%s ' "${sid:0:8}" "$model" "${asked:+@$asked}" "${shells:+~$shells}"; fi
    done | sed 's/ $//'
}

snapshot="$(cmux rpc extension.sidebar.snapshot '{}')"
current="$(jq -r --arg ws "$ws" '.workspaces[] | select(.id == $ws) | .description // empty' <<<"$snapshot")"
body="${current%"$MARK"}"
marked=""
[ "$body" != "$current" ] && marked="$MARK"
summary="${body%%"$USAGE_SEP"*}"
summary="${summary%%"$SEP"*}"
models="$(session_models)"
is_ping() {
  case "$1" in
    "Claude is waiting for your input" | "Claude needs your permission"* | "Agent is asking a question") return 0 ;;
  esac
  return 1
}
usage="$(cat "${XDG_CACHE_HOME:-$HOME/.cache}/cmux-panel/usage" 2>/dev/null || true)"

case "$mode" in
  stop) marked="$MARK"; is_ping "$summary" && summary="" ;;
  prompt) marked=""; is_ping "$summary" && summary="" ;;
  notification)
    text="$(jq -r --arg ws "$ws" '.workspaces[] | select(.id == $ws) | .latest_notification_text // empty' <<<"$snapshot")"
    if [ -n "$text" ] && { [ "$text" != "Claude is waiting for your input" ] || [ -z "$summary" ]; }; then
      summary="$text"
    fi
    ;;
  usage) ;;
  *) echo "usage: $0 stop|prompt|notification|usage [workspace-id]" >&2; exit 2 ;;
esac

if [ -n "$marked" ] && [ "$mode" != usage ] &&
  [ "$(jq -r --arg ws "$ws" '.workspaces[] | select(.id == $ws) | .selected' <<<"$snapshot")" = true ]; then
  cmux workspace-action --workspace "$ws" --action mark-unread >/dev/null
fi

next="$summary${models:+$SEP$models}${usage:+$USAGE_SEP$usage}$marked"
[ "$next" = "$current" ] && exit 0
if [ -z "$next" ]; then
  cmux workspace-action --workspace "$ws" --action clear-description >/dev/null
else
  cmux workspace-action --workspace "$ws" --action set-description --description "$next" >/dev/null
fi
