# Agent Inbox

Agent Inbox is a sidebar for [cmux](https://github.com/manaflow-ai/cmux). It shows your Claude Code and Codex sessions in groups. Each group tells you what a session needs from you. Sessions that wait for you are at the top.

## Install

1. Run `./install.sh`.
2. Right-click the sidebar toggle button and select **Agent Inbox**. Or run `cmux sidebar select "Agent Inbox"`.
3. To show Codex sessions, run `cmux hooks codex install`. Do this before you start Codex in a cmux terminal.
4. To show plan usage, add this line to your Claude Code statusline command. Put it after the command reads its input into `$input`:

   ```sh
   printf "%s" "$input" | /path/to/cmux-agent-inbox/automations/record-usage.sh &
   ```

To open Agent Inbox as a pane, run `cmux sidebar open "Agent Inbox"`.

`install.sh` is safe to run again. It does these tasks:

- It links `sidebars/Agent Inbox.js` into `~/.config/cmux/sidebars/`. Thus cmux runs the file in this repository.
- It adds automation rules to `~/.cmuxterm/automations.json`. The IDs of these rules start with `cmux-agent-inbox-`. It keeps a backup of the old file.
- It gives a name to each workspace that has no name and has an agent.

To remove Agent Inbox, delete the link in `~/.config/cmux/sidebars/`. Then remove the `cmux-agent-inbox-` rules from `~/.cmuxterm/automations.json`.

## Sections

| Section | Color | Sessions in the section |
| --- | --- | --- |
| INBOX | Orange | A finished turn that you did not read. A question or a permission prompt that you did not answer. |
| WORKING | Purple | A turn that runs. Or a finished turn with background subagents or shells that still run. |
| IDLE | Teal | A finished turn that you read. |
| AGENTLESS | Brown outline | A workspace with no live session. This section shows only when it has a workspace. |

A finished turn stays in INBOX until you open its workspace. A question stays in INBOX until you answer it.

A WORKING row shows a spinner and the time that the run uses, for example "running 3m 07s". The time starts at your prompt. Subagent results start new turns, but the time does not start again.

In each section, the rows have the same order as the workspaces. Rows do not move when their status changes.

## Rows

Each row shows:

- The workspace title. `[^N]` shows the tab of the session.
- The agent and its model, for example `Claude · Opus 5.5` or `Codex · gpt-6.1-sol`.
- The session title, with the number of subagents and shells that run.
- The hotkey (⌘1 to ⌘9). A red background shows the selected workspace.
- The time in the current status.
- The last summary from the agent, and your last prompt.
- The git branch, a mark for changes that are not committed, pull requests, and ports.

| Action | Result |
| --- | --- |
| Click a row | Selects the workspace. |
| Option-click or Command-click a row | Selects the workspace and the tab of the session. |
| Click a pull request or a port | Opens it. |
| Right-click a row | Shows Go to Agent Tab, Pin/Unpin Workspace, Rename Workspace, and Mark as Read/Unread. |

A pinned workspace is the first row in its section. It shows a yellow pin.

## Plan usage

An hourglass and a calendar show how much of the Claude 5-hour and 7-day limits you used. These are the values that `/usage` shows. The color changes to orange at 75% and to red at 90%. Put the pointer on the meters to see when each limit resets.

The meters show only after the statusline command records usage. Plans with no usage limits (API keys) show no meters.

## Recent feed

The RECENT FEED is below the sections. It shows agent events, with the newest event first:

- Turns that start and finish
- Questions
- Subagents that start and finish
- Sessions that start and end
- Pull requests that are linked, merged, or closed

The feed shows 10 events. Click "show more" to see more. Click an event to select its workspace. Click the label to close the feed.

When cmux reloads the sidebar, the feed starts again. It then shows only the data that cmux keeps.

## Compact view

Click the arrows icon next to the usage meters to show the compact view. The icon is blue when the compact view is on. Use it for a narrow sidebar.

The compact view shows the status, workspace title, model, hotkey, time, and branch. It does not show the session title, summary, prompt, pull requests, or ports. The feed starts with 5 events.

When cmux reloads the sidebar, the full view comes back.

## How it works

Agent Inbox gets less data than the standard cmux sidebar. The automations in `automations/` add the missing data to the description of each workspace. Agent Inbox reads the description. The data uses characters that you cannot see. These scripts replace a description that you write yourself.

`workspace-state.sh` runs on Stop, on prompt submit, and on each notification. It records these items:

- The last summary from Claude.
- A mark when the turn is finished. cmux reports the Claude idle reminder as "needs input". Without the mark, the idle reminder looks the same as a real question.
- The model of each session, and the time of your last prompt. It reads them from the transcript.
- The start time of each background shell that still runs. cmux reports such a session as idle.
- The last plan usage from `record-usage.sh`.

When a turn finishes in the selected workspace, the script marks the workspace as unread. cmux does not count notifications for the selected workspace. Without the mark, the turn goes directly to IDLE.

A background shell stays in WORKING until the next Stop of its session. Usually this is quick, because the shell result starts a new turn. If the Claude process stops while a shell runs, the row stays in WORKING until the next turn finishes.

`name-workspace.sh` runs when a session starts and on prompt submit. It gives a name to each workspace that has no name. The name is the git root of the agent directory, for example `cmux-agent-inbox`. Outside a repository, the name is the directory. Without this name, the workspace shows the title of its tab, and Claude Code changes that title frequently. If you rename the workspace, your name stays.

## Development

`cmux sidebar validate` only makes sure that a file loads. After you change Agent Inbox, run:

```sh
node scripts/check-sidebar.js "sidebars/Agent Inbox.js"
```

This script runs the sidebar in the cmux runtime with sample data. It finds errors, for example a modifier that your cmux version does not support.

To test `workspace-state.sh` without cmux, run:

```sh
node scripts/check-workspace-state.js
```

`sidebars/Agent Inbox.js` comes from `Examples/CustomSidebars/agents-board.js` in cmux. Its license is GPL-3.0-or-later.
