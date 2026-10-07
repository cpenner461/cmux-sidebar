# cmux-panel

Custom [cmux](https://github.com/manaflow-ai/cmux) sidebars.

## Agent Inbox

Agent Inbox replaces the workspace list with your agent sessions grouped by what they need from you. It answers "what needs me right now": sessions waiting on you get the loudest section at the top, and everything else stays quiet below it.

Sessions fall into four tinted sections. INBOX (orange) holds sessions waiting on you: a finished turn you haven't looked at yet, or a permission prompt or question you haven't answered. It works like an unread filter, so a finished turn stays there until you view its workspace (cmux's own unread count, the badge the stock sidebar shows), while a real question stays until you answer it. WORKING (blue) holds sessions mid-turn, with a spinner in place of the status dot and a live "running 3m 07s" line. IDLE holds sessions that are done and read. AGENTLESS lists workspaces with no live session, and is hidden while empty. Within each section, rows follow workspace order, so they never jump around as activity changes.

Each row shows the workspace title (plus `[^N]` for the tab hosting the session), the session's title and how many subagents it is running, its ⌘1–⌘9 hotkey (on a red pill for the selected workspace), and how long it has been in its current state. Under that are Claude's latest summary, your last prompt, and the branch, dirty marker, PR chips and port chips; clicking a PR or port chip opens it. Clicking a row selects its workspace; Option- or Command-click also focuses the session's tab. Right-click offers Go to Agent Tab, an inline Rename Workspace, and Mark as Read/Unread, which moves the workspace's sessions in or out of INBOX.

## Install

Run `./install.sh` to symlink everything in `sidebars/` into `~/.config/cmux/sidebars/`. Then right-click the sidebar toggle button and pick a sidebar, or run `cmux sidebar select "Agent Inbox"` (left sidebar) or `cmux sidebar open "Agent Inbox"` (as a pane). Because the installed files are symlinks, edits here are what cmux runs; to uninstall, delete the symlinks.

Custom sidebars aren't given the notification text the stock sidebar shows (Claude's "what I did" summary), and cmux reports Claude's idle reminder (about a minute after a turn ends) as "needs input", the same as a real permission prompt or question. So `install.sh` also adds three rules (ids starting `cmux-panel-`) to `~/.cmuxterm/automations.json` that run `automations/workspace-state.sh` on Stop, prompt submit, and new notifications. The script keeps the workspace description set to the latest summary, ending in an invisible marker while Claude's turn is finished, and Agent Inbox uses that marker to tell a real question from an idle reminder. This overwrites any description you set by hand. Remove the `cmux-panel-` rules to turn it off.

## Development

`cmux sidebar validate` only checks that a file loads, so run `node scripts/check-sidebar.js sidebars/<name>.js` after an edit: it runs the sidebar against the runtime inside your installed cmux with sample data and fails on errors like a modifier your cmux version doesn't support.

`sidebars/Agent Inbox.js` is adapted from cmux's `Examples/CustomSidebars/agents-board.js`, which is licensed GPL-3.0-or-later.
