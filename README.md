# cmux-panel

Custom [cmux](https://github.com/manaflow-ai/cmux) sidebars.

## Agent Inbox

Agent Inbox replaces the workspace list with your agent sessions grouped by what they need from you. It answers "what needs me right now": sessions waiting on you get the loudest section at the top, and everything else stays quiet below it.

Sessions fall into four sections. INBOX (orange) holds sessions waiting on you: a finished turn you haven't looked at yet, or a permission prompt or question you haven't answered. It works like an unread filter, so a finished turn stays there until you view its workspace (cmux's own unread count, the badge the stock sidebar shows), while a real question stays until you answer it. WORKING (purple) holds sessions mid-turn, with a spinner in place of the status dot and a live "running 3m 07s" line. IDLE (teal) holds sessions that are done and read. AGENTLESS, a brown outline with no fill, lists workspaces with no live session, and is hidden while empty. Within each section, rows follow workspace order, so they never jump around as activity changes.

Each row shows the workspace title (plus `[^N]` for the tab hosting the session) and the model the session last answered with, the session's title and how many subagents it is running, its ⌘1–⌘9 hotkey (on a red pill for the selected workspace), and how long it has been in its current state. Under that are Claude's latest summary, your last prompt, and the branch, dirty marker, PR chips and port chips; clicking a PR or port chip opens it. Clicking a row selects its workspace; Option- or Command-click also focuses the session's tab. Right-click offers Go to Agent Tab, an inline Rename Workspace, and Mark as Read/Unread, which moves the workspace's sessions in or out of INBOX.

Below the sections, a blue RECENT FEED logs what agents did, newest first: turns started (with your prompt) and finished (with Claude's summary), questions, subagents starting and finishing, sessions starting and ending, and PRs linked, merged or closed. It shows the last 10, with "show more" at the bottom to go further back. Clicking a line selects its workspace, and clicking the label folds it away. Sidebars can't read files or keep state, so the feed is built by comparing each update cmux pushes with the last one. It starts over whenever cmux reloads the sidebar, seeded from what cmux still holds: each session's latest prompt and when its turn finished, subagents' start and end times, and ended sessions. Anything older than that isn't available to it.

## Install

Run `./install.sh` to symlink everything in `sidebars/` into `~/.config/cmux/sidebars/`. Then right-click the sidebar toggle button and pick a sidebar, or run `cmux sidebar select "Agent Inbox"` (left sidebar) or `cmux sidebar open "Agent Inbox"` (as a pane). Because the installed files are symlinks, edits here are what cmux runs; to uninstall, delete the symlinks.

Custom sidebars aren't given the notification text the stock sidebar shows (Claude's "what I did" summary), and cmux reports Claude's idle reminder (about a minute after a turn ends) as "needs input", the same as a real permission prompt or question. So `install.sh` also adds three rules (ids starting `cmux-panel-`) to `~/.cmuxterm/automations.json` that run `automations/workspace-state.sh` on Stop, prompt submit, and new notifications. The script keeps the workspace description set to the latest summary, ending in an invisible marker while Claude's turn is finished, and Agent Inbox uses that marker to tell a real question from an idle reminder. Before the marker it also records each session's model, read from the session's transcript, since sidebar data doesn't include it; the stock sidebar shows that list as `<session id prefix>=<model id>` after the summary. This overwrites any description you set by hand. Remove the `cmux-panel-` rules to turn it off.

Two more rules run `automations/name-workspace.sh` when an agent session starts and when you submit a prompt, naming a workspace that has no name of its own after the project its agent works in: the git root of the agent's directory (`cmux-sidebar` for this repo, even from a subdirectory; a worktree is its own root), or the directory itself outside a repo. Without it, an unnamed workspace shows its focused tab's title, which Claude Code keeps setting to a summary of the conversation, so the name drifts with focus and from session to session. The directory a workspace opens in is no better a guide, since cmux opens new workspaces wherever the current one's terminal is. The project name is a real workspace name, so it shows everywhere cmux shows one, and renaming the workspace yourself replaces it. Workspaces that never run an agent keep cmux's default. `install.sh` also names unnamed workspaces that already have an agent running.

## Development

`cmux sidebar validate` only checks that a file loads, so run `node scripts/check-sidebar.js sidebars/<name>.js` after an edit: it runs the sidebar against the runtime inside your installed cmux with sample data and fails on errors like a modifier your cmux version doesn't support.

`sidebars/Agent Inbox.js` is adapted from cmux's `Examples/CustomSidebars/agents-board.js`, which is licensed GPL-3.0-or-later.
