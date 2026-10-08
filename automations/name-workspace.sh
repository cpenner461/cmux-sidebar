#!/usr/bin/env bash
# Names a workspace after the project its agent works in, unless it already
# has a name of its own. The project is the git root of the agent's working
# directory (a worktree is its own root), or that directory itself outside a
# repo. Unnamed workspaces otherwise show their focused tab's title, which
# Claude Code keeps setting to a summary of the conversation, so the name
# drifts with focus and from session to session. The directory a workspace
# opens in is no guide either: cmux opens it wherever the current workspace's
# terminal happens to be. Renaming a workspace by hand replaces this name.
#
# Run by the cmux automation rules install.sh adds, with the event in
# $CMUX_AUTOMATION_EVENT_JSON, so the workspace is named as soon as its first
# session starts (before that, Claude Code titles its tab "Claude Code");
# the prompt rule is a fallback, and later runs find it named and stop there:
#   name-workspace.sh                          on agent.hook.SessionStart
#   name-workspace.sh                          on agent.hook.UserPromptSubmit
# or by hand for one workspace:
#   name-workspace.sh <workspace-id> <directory>
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/Applications/cmux.app/Contents/Resources/bin:$PATH"

ws="${1:-}"
dir="${2:-}"
if [ -z "$ws" ]; then
  event="${CMUX_AUTOMATION_EVENT_JSON:-}"
  ws="$(jq -r '.workspace_id // .payload.workspace_id // empty' <<<"$event")"
  dir="$(jq -r '.payload.cwd // .cwd // empty' <<<"$event")"
fi
[ -n "$ws" ] && [ -n "$dir" ] || exit 0

named="$(cmux rpc workspace.list '{}' | jq -r --arg ws "$ws" '.workspaces[] | select(.id == $ws) | .has_custom_title == true')"
[ "$named" = "false" ] || exit 0

root="$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null || printf '%s' "$dir")"
name="$(basename "${root%/}")"
case "$name" in "" | "/" | ".") exit 0 ;; esac
cmux workspace-action --workspace "$ws" --action rename --title "$name" >/dev/null
