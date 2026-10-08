#!/usr/bin/env bash
# Symlink every sidebar in ./sidebars into cmux's sidebar folder, so edits in
# this repo are what cmux runs. Safe to re-run.
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target_dir="${CMUX_SIDEBARS_DIR:-$HOME/.config/cmux/sidebars}"

mkdir -p "$target_dir"

for src in "$repo_dir"/sidebars/*.{js,swift,json}; do
  [ -e "$src" ] || continue
  name="$(basename "$src")"
  dest="$target_dir/$name"

  # Back up a real file we'd otherwise clobber; replace stale symlinks freely.
  if [ -e "$dest" ] && [ ! -L "$dest" ] && ! cmp -s "$dest" "$src"; then
    backup="$dest.$(date +%Y%m%d-%H%M%S).bak"
    mv "$dest" "$backup"
    echo "backed up $dest -> $backup"
  fi

  ln -sfn "$src" "$dest"
  echo "linked $dest -> $src"
  cmux sidebar validate "${name%.*}"
done

# Register the automations that keep each workspace description in sync with
# Claude's latest summary and its "turn finished" marker (see
# automations/workspace-state.sh), and that name each unnamed workspace after
# the project its agent works in (see automations/name-workspace.sh). Replaces
# our own rules (ids prefixed cmux-panel-) and leaves any other rules alone.
automations="${CMUX_AUTOMATIONS_FILE:-$HOME/.cmuxterm/automations.json}"
state_script="$repo_dir/automations/workspace-state.sh"
name_script="$repo_dir/automations/name-workspace.sh"
mkdir -p "$(dirname "$automations")"
if [ -e "$automations" ]; then
  cp "$automations" "$automations.$(date +%Y%m%d-%H%M%S).bak"
else
  echo '{"version": 1, "rules": []}' > "$automations"
fi
tmp="$(mktemp)"
jq --arg state "$state_script" --arg name "$name_script" '
  def rule($id; $event; $command): {
    id: ("cmux-panel-" + $id),
    when: { event: $event },
    rate_limit: { interval_seconds: 1, maximum: 20 },
    then: [{ action: "run", command: $command, timeout_seconds: 30 }]
  };
  .rules = ([.rules[]? | select(.id | startswith("cmux-panel-") | not)] + [
    rule("turn-finished"; "agent.hook.Stop"; $state + " stop"),
    rule("prompt-submitted"; "agent.hook.UserPromptSubmit"; $state + " prompt"),
    rule("notification-summary"; "notification.created"; $state + " notification"),
    rule("name-workspace-session"; "agent.hook.SessionStart"; $name),
    rule("name-workspace-prompt"; "agent.hook.UserPromptSubmit"; $name)
  ])' "$automations" > "$tmp"
mv "$tmp" "$automations"
cmux automation reload >/dev/null
echo "registered cmux-panel automations in $automations"

# Backfill now instead of waiting for each workspace's next event: copy in the
# latest summary, and mark workspaces whose last "Completed" notification is
# newer than their last submitted prompt (timestamps compared to the second).
notifications="$(cmux rpc notification.list '{}')"
cmux rpc extension.sidebar.snapshot '{}' | jq -r '.workspaces[] | "\(.id) \(.latest_submitted_at // "" | .[0:19])"' |
  while read -r ws submitted; do
    "$state_script" notification "$ws" </dev/null
    completed="$(jq -r --arg ws "$ws" '[.notifications[] | select(.workspace_id == $ws and (.subtitle // "" | startswith("Completed"))) | .created_at[0:19]] | max // ""' <<<"$notifications")"
    if [ -n "$completed" ] && [[ ! "$completed" < "$submitted" ]]; then
      "$state_script" stop "$ws" </dev/null
    fi
  done

# Name any workspace that still has no name of its own after the project of
# an agent session already running in it.
cmux sessions list --json | jq -r '.sessions[] | select(.cwd != null) | "\(.workspace_id)\t\(.cwd)"' |
  while IFS=$'\t' read -r ws dir; do "$name_script" "$ws" "$dir" </dev/null; done
