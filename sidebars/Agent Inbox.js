// Adapted from cmux's Examples/CustomSidebars/agents-board.js
// https://github.com/manaflow-ai/cmux (GPL-3.0-or-later, Copyright (c) Manaflow, Inc.)
//
// Agent Inbox: subagents grouped by STATUS, attention first. The question
// this layout answers is "what needs me right now" - needs-input sessions
// get the loudest section at the top, everything else stays quiet.
//   cmux sidebar open "Agent Inbox"

// Text and dot colors are system color names, which cmux resolves per
// appearance (orange is #FF9F0A in dark mode, #FF9500 in light). Sidebars get
// no light/dark signal, so tints stay hex: they need an alpha suffix.
const STATUS_META = {
  needs_input: { label: "INBOX", color: "orange", strong: true, tint: "#FF9F0A" },
  working: { label: "WORKING", color: "blue", strong: false, tint: "#0A84FF" },
  idle: { label: "IDLE", color: "#8A9A8C", strong: false, tint: "#8E8E93", labelColor: "tertiary" },
  none: { label: "AGENTLESS", color: "#636366", strong: false, tint: "#7F7F7F", labelColor: "tertiary", hideEmpty: true, border: "#5C5C60" },
};
const ORDER = ["needs_input", "working", "idle", "none"];

// automations/workspace-state.sh ends a workspace's description with this
// invisible character while Claude's turn is finished and nothing has been
// submitted since.
const TURN_DONE = "\u2063";
const turnDone = (w) => (w.description ?? "").endsWith(TURN_DONE);
// Before that marker, after an invisible U+2064, it lists the model each of the
// workspace's sessions last answered with: "<session id prefix>=<model id>"
// pairs, since sidebar data doesn't carry the model.
const MODELS = "\u2064";
const summaryOf = (w) => (w.description ?? "").replace(/\u2063+$/, "").split(MODELS)[0];
function modelOf(w, a) {
  const pairs = (w.description ?? "").replace(/\u2063+$/, "").split(MODELS)[1] ?? "";
  const pair = pairs.split(" ").find((p) => p.startsWith(a.id.slice(0, 8) + "="));
  return pair ? modelLabel(pair.slice(pair.indexOf("=") + 1)) : "";
}

// claude-opus-5-5 -> Opus 5.5, claude-sonnet-4-5-20250929 -> Sonnet 4.5.
// Anything else shows as-is.
function modelLabel(id) {
  const m = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/);
  if (!m) return id;
  return m[1][0].toUpperCase() + m[1].slice(1) + " " + m[2] + (m[3] ? "." + m[3] : "");
}

// The section a session belongs in. INBOX works like an unread filter:
// a session that isn't working lands there while its workspace has unread
// notifications (cmux's own count, the stock sidebar's badge, which clears
// when you view the workspace), so a finished turn stays there until you look
// at it. A real permission prompt or question mid-turn also stays there after
// you've looked, until you answer it. cmux reports Claude's idle reminder
// (about a minute after a turn ends) as needs_input too; once the turn has
// finished and been read, that is just idle. Other statuses pass through;
// ended sessions are the leftovers of /clear (the same Claude process carries
// on as a new session with its own row), and have no section, so they are dropped.
function boardStatus(w, a) {
  if (a.status !== "idle" && a.status !== "needs_input") return a.status;
  if ((w.unread ?? 0) > 0) return "needs_input";
  if (a.status === "needs_input" && !turnDone(w)) return "needs_input";
  return "idle";
}

const epoch = () => data.clock()?.epoch ?? 0;

// Working rows swap the status dot for a braille spinner that steps on the
// one-second clock (the native ProgressView ignores size and draws full-size).
const SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏";

function fmt(secs) {
  const s = Math.max(0, Math.floor(secs));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m";
  return Math.floor(m / 60) + "h";
}

// Finer than fmt, for the live "running for" line on working rows: 42s, 3m 07s, 1h 05m.
function fmtElapsed(secs) {
  const s = Math.max(0, Math.floor(secs));
  const pad = (n) => String(n).padStart(2, "0");
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m " + pad(s % 60) + "s";
  return Math.floor(s / 3600) + "h " + pad(Math.floor(s / 60) % 60) + "m";
}

// A workspace with no session that lands in a section (no agents at all, or
// only ended ones) still gets one row, under AGENTLESS, with a null `a`.
const allAgents = computed(() => {
  const out = [];
  for (const w of data.workspaces() ?? []) {
    const before = out.length;
    for (const a of w.agents ?? []) {
      const status = boardStatus(w, a);
      if (STATUS_META[status]) out.push({ key: w.id + ":" + a.id, ws: w, a, status });
    }
    if (out.length === before) out.push({ key: w.id, ws: w, a: null, status: "none" });
  }
  // Within a section, rows follow workspace order (the ⌘1-⌘9 order), so a
  // row's hotkey matches its position. Never resort on activity; rows update
  // in place. Sessions in the same workspace fall back to their key.
  out.sort((x, y) => (x.ws.index ?? 0) - (y.ws.index ?? 0) || (x.key < y.key ? -1 : 1));
  return out;
});

const byStatus = (status) => () => allAgents().filter((e) => e.status === status);

// Select the workspace, which lands on whichever tab you last had open there.
// With `toAgent` (Option/Command-click, or the right-click menu) also focus
// the tab hosting the session. Pass the session's panelId: it is the id the
// CLI/socket calls a surface. The session's `surfaceId` is the tab's internal
// id, which surface.focus rejects ("Surface not found") in cmux 0.64.
// workspace_id lets it reach a tab in another workspace.
function jump(e, toAgent) {
  cmux("workspace.select", { workspace_id: e.ws.id });
  if (toAgent && e.a?.panelId) cmux("surface.focus", { surface_id: e.a.panelId, workspace_id: e.ws.id });
}

// There is no conditional view helper, so render `build()` through a ForEach of
// zero or one items: it disappears entirely (no blank line) when `cond` is false.
function when(cond, build) {
  return ForEach({ items: () => (cond() ? [1] : []), key: () => "on" }, build);
}

// `prs` entries are documented as objects ({ number, url, status, ... }), but
// some builds hand over bare URL strings; accept both.
const prUrl = (p) => (typeof p === "string" ? p : p.url);
const prText = (p) =>
  typeof p === "string" ? "#" + (p.match(/(\d+)\/?$/)?.[1] ?? "PR") : "#" + p.number;
const PR_COLORS = { open: "#34C759", merged: "#AF52DE", closed: "#FF453A" };
const prColor = (p) => (typeof p === "string" ? "secondary" : PR_COLORS[p.status] ?? "secondary");

// Prompts arrive raw: pasted text is wrapped in <pasted_content ...> and
// subagent hand-backs in <agent-message ...>. Drop the tags (and the hand-back
// boilerplate, which is not something you typed) so only readable text remains.
function cleanPrompt(text) {
  if (!text) return "";
  if (/^\s*<agent-message\b/.test(text)) return "(subagent report)";
  return text.replace(/<\/?[A-Za-z][\w:-]*(?:\s[^<>]*)?\/?>/g, " ").replace(/\s+/g, " ").trim();
}

function chip(label, color, onTap) {
  return Text(label)
    .font(10).monospaced().color(color)
    .paddingHorizontal(5).paddingVertical(1)
    .cornerRadius(5)
    .background("#7f7f7f1f")
    .hoverBackground("#7f7f7f3d")
    .layoutPriority(2)
    .onTap(onTap);
}

// Workspace facts the stock sidebar shows: Claude's latest summary, your last
// prompt, branch, PRs, ports. The summary is the workspace description, which
// automations/workspace-state.sh keeps in sync with the latest notification
// (custom sidebars are not given the notification text itself). Working rows
// end with how long the session has been on its current task: sinceEpoch is
// when it entered its current status. AGENTLESS rows keep only the workspace's
// own facts (branch, PRs, ports): the summary and prompt belong to a session
// that has since exited.
function details(e) {
  const ws = () => e().ws;
  const summary = () => (e().a ? summaryOf(ws()) : "");
  const prompt = () => (e().a ? cleanPrompt(ws().latestPrompt) : "");
  const prs = () => ws().prs ?? (ws().pr ? [ws().pr] : []);
  const runningFor = () => (e().status === "working" && e().a?.sinceEpoch
    ? fmtElapsed(epoch() - e().a.sinceEpoch) : "");
  // The clear circle mirrors the status dot so details line up under the title.
  return HStack({ spacing: 8, alignment: "top" }, [
    Circle({ size: 7 }).fill("clear"),
    VStack({ spacing: 3, alignment: "leading" }, [
      when(() => !!summary(), () => Text(summary)
        .font(11).color("secondary").lineLimit(2).truncation("tail")),
      when(() => !!prompt(), () => Text(() => "› " + prompt())
        .font(10).color("tertiary").lineLimit(1).truncation("tail")),
      when(() => !!ws().branch || prs().length > 0 || (ws().ports ?? []).length > 0,
        () => HStack({ spacing: 4 }, [
          when(() => !!ws().branch, () => HStack({ spacing: 3 }, [
            Image("arrow.triangle.branch").font(9).color("tertiary"),
            Text(() => ws().branch ?? "")
              .font(10).monospaced().color("tertiary").lineLimit(1).truncation("middle"),
            Text(() => (ws().dirty ? "●" : "")).font(8).color("orange"),
          ]).layoutPriority(1)),
          ForEach({ items: prs, key: (p) => prUrl(p) }, (p) =>
            chip(() => prText(p()), () => prColor(p()), () => openURL(prUrl(p())))),
          ForEach({ items: () => ws().ports ?? [], key: (n) => String(n) }, (n) =>
            chip(() => ":" + n(), "secondary", () => openURL("http://localhost:" + n()))),
          Spacer({ minLength: 0 }),
        ])),
      when(() => !!runningFor(), () => HStack({ spacing: 3 }, [
        Image("timer").font(9).color(() => STATUS_META.working.color),
        Text(() => "running " + runningFor())
          .font(10).monospaced().color(() => STATUS_META.working.color),
      ])),
    ]),
  ]);
}

// cmux's default workspace shortcuts: ⌘1-⌘8 select workspaces 1-8 in sidebar
// order and ⌘9 always selects the last one, so rows past the eighth only get
// a key when they are last. (Group headers and collapsed group members are
// skipped in that numbering; this assumes no workspace groups.)
function hotkey(w) {
  const count = data.workspaceCount() ?? (data.workspaces() ?? []).length;
  if (w.index < 8) return "⌘" + (w.index + 1);
  return w.index === count - 1 ? "⌘9" : "";
}

// The session's tab, numbered from 1 in the workspace's tab order. Sessions
// carry the hosting tab's panelId (and usually surfaceId); null if neither matches.
function tabNumber(e) {
  if (!e.a) return null;
  const i = (e.ws.tabs ?? []).findIndex((t) =>
    (e.a.panelId && t.id === e.a.panelId) || (e.a.surfaceId && t.surfaceId === e.a.surfaceId));
  return i < 0 ? null : i + 1;
}

function row(e, strong, tint) {
  const meta = () => STATUS_META[e().status];
  return VStack({ spacing: 3, alignment: "leading" }, [
    HStack({ spacing: 8 }, [
      when(() => e().status !== "working", () => Circle({ size: 7 }).fill(() => meta().color)),
      when(() => e().status === "working", () => Text(() => SPINNER[epoch() % SPINNER.length])
        .font(12).weight("bold").color(() => meta().color)),
      // Truncating text only outranks a Spacer on its own; wrapped in a stack
      // it ties with the Spacer and the two split the row, so raise the stack.
      VStack({ spacing: 1, alignment: "leading" }, [
        // The model sits after the title and outranks it, so a long title
        // truncates before the model does.
        when(() => editingKey() !== e().key, () => HStack({ spacing: 6 }, [
          Text(() => e().ws.title + (tabNumber(e()) ? " [^" + tabNumber(e()) + "]" : ""))
            .font(12).weight(strong ? "semibold" : "regular")
            .lineLimit(1).truncation("tail"),
          when(() => !!(e().a && modelOf(e().ws, e().a)), () => Text(() => modelOf(e().ws, e().a))
            .font(10).color("secondary").lineLimit(1).layoutPriority(1)),
        ])),
        when(() => editingKey() === e().key, () => renameField(e)),
        when(() => !!e().a, () => Text(() => {
          const running = (e().a.children ?? []).filter((c) => c.running).length;
          return (cleanPrompt(e().a.title) || e().a.name) + (running ? " · " + running + " sub" : "");
        })
          .font(10).color("tertiary").lineLimit(1).truncation("tail")),
      ]).layoutPriority(1),
      Spacer({ minLength: 0 }),
      VStack({ spacing: 1, alignment: "trailing" }, [
        // The selected workspace's hotkey sits on a red pill. The padding is
        // there on every row so the column lines up whether or not it's lit.
        Text(() => hotkey(e().ws))
          .font(10).monospaced()
          .weight(() => (e().ws.selected ? "bold" : "regular"))
          .color(() => (e().ws.selected ? "#FFFFFF" : "secondary"))
          .paddingHorizontal(5).paddingVertical(1)
          .cornerRadius(5)
          .background(() => (e().ws.selected && hotkey(e().ws) ? "#FF453A" : null)),
        // Working rows show their elapsed time on the bottom line instead.
        Text(() => (!e().a || e().status === "working" ? ""
          : e().a.sinceEpoch ? fmt(epoch() - e().a.sinceEpoch)
          : e().a.lastActivityAt ? fmt(epoch() - e().a.lastActivityAt) : ""))
          .font(10).monospaced().color("tertiary"),
      ]).layoutPriority(2),
    ]),
    details(e),
  ])
    .paddingHorizontal(10).paddingVertical(6)
    .cornerRadius(8)
    // The selected workspace gets a lighter background. Keep it translucent so
    // it lightens the sidebar behind it and the text keeps its contrast: an
    // opaque light fill under the sidebar's light text makes rows unreadable.
    // Unselected rows stay clear so tinted rows match their section's tint
    // instead of stacking a darker band over it.
    .background(() => (e().ws.selected ? tint + "4d" : null))
    .hoverBackground(tint + "2e")
    .frame({ maxWidth: "infinity" })
    .onTap((mods) => jump(e(), mods?.option || mods?.cmd))
    .contextMenu(rowMenu(e));
}

// Inline rename, opened from the row's right-click menu: the title swaps for a
// text field (mounted fresh, so it takes focus); Return renames the workspace,
// an empty name clears the custom name, and Escape cancels. Keyed by row, not
// workspace, so only the row you right-clicked turns into an editor.
const [editingKey, setEditingKey] = signal(null);

function renameField(e) {
  return TextField(() => e().ws.title ?? "", {
    placeholder: "Workspace name",
    onSubmit: (t) => {
      const title = (t ?? "").trim();
      cmux("workspace.action", title
        ? { action: "rename", workspace_id: e().ws.id, title }
        : { action: "clear_name", workspace_id: e().ws.id });
      setEditingKey(null);
    },
    onCancel: () => setEditingKey(null),
  }).font(12);
}

// Right-click offers the agent's tab (same as Option/Command-click), renames the
// workspace, and toggles its unread state, which is what files its sessions
// under INBOX. cmux tracks unread per workspace, not per session. AGENTLESS rows
// have no agent tab; a row's key fixes which kind it is, so this is read once.
function rowMenu(e) {
  const unread = () => (e().ws.unread ?? 0) > 0;
  return [
    ...(e().a ? [Button("Go to Agent Tab", () => jump(e(), true))] : []),
    Button("Rename Workspace", () => setEditingKey(e().key)),
    Button(() => (unread() ? "Mark as Read" : "Mark as Unread"), () =>
      cmux("workspace.action", { action: unread() ? "mark_read" : "mark_unread", workspace_id: e().ws.id })),
  ];
}

// AGENTLESS is hidden entirely while empty; the status sections always show.
function statusSection(status) {
  const meta = STATUS_META[status];
  const items = byStatus(status);
  if (meta.hideEmpty) return when(() => items().length > 0, () => sectionBody(meta, items));
  return sectionBody(meta, items);
}

function sectionBody(meta, items) {
  const section = VStack({ spacing: 3 }, [
    HStack({ spacing: 6 }, [
      Text(meta.label).font(10).weight("semibold")
        .color(meta.labelColor ?? meta.color),
      Spacer(),
      Text(() => (items().length ? String(items().length) : ""))
        .font(10).monospaced().color("tertiary"),
    ]).paddingHorizontal(10),
    ForEach({ items, key: (e) => e.key }, (e) => row(e, meta.strong, meta.tint)),
    Text(() => (items().length === 0 ? "—" : ""))
      .font(10).color("tertiary").paddingHorizontal(10),
  ])
    // Sections keep their tint even when empty, so the area reads as inbox,
    // working, or idle at a glance.
    .paddingVertical(6)
    .cornerRadius(10)
    .background(meta.tint + "1a");
  // The sidebar runtime only draws solid borders (borderColor/borderWidth).
  return meta.border ? section.borderColor(meta.border).borderWidth(1) : section;
}

sidebar(() =>
  VStack({ spacing: 10 }, [
    Text("Agent Inbox").font(14).weight("semibold").paddingHorizontal(10),
    ...ORDER.map(statusSection),
    Spacer(),
  ]).paddingHorizontal(6),
  { surface: "glass" }
)
