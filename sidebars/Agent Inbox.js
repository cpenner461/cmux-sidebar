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
  working: { label: "WORKING", color: "purple", strong: false, tint: "#BF5AF2" },
  idle: { label: "IDLE", color: "teal", strong: false, tint: "#40CBE0" },
  // AGENTLESS is an outline with no fill: empty space, not another state.
  none: { label: "AGENTLESS", color: "#AC8E68", strong: false, tint: "#AC8E68", hideEmpty: true, border: "#AC8E6880", fill: false },
};
const ORDER = ["needs_input", "working", "idle", "none"];

// Pinned workspaces (cmux's own pin, toggled from the row menu) lead their
// section, with a pin glyph and a faint yellow tint: the one system hue the
// sections don't already use.
const PIN = { color: "yellow", tint: "#FFD60A" };
const isPinned = (w) => !!w.pinned;

// automations/workspace-state.sh ends a workspace's description with this
// invisible character while Claude's turn is finished and nothing has been
// submitted since.
const TURN_DONE = "\u2063";
const turnDone = (w) => (w.description ?? "").endsWith(TURN_DONE);
// Before that marker, after an invisible U+2064, it lists the model each of the
// workspace's sessions last answered with and when you last prompted it:
// "<session id prefix>=<model id>@<epoch>" pairs, since sidebar data doesn't
// carry the model, and its latest prompt is often a subagent hand-back.
const MODELS = "\u2064";
// Last, after an invisible U+2062, Claude's plan usage (see usage below).
const USAGE = "\u2062";
const body = (w) => (w.description ?? "").replace(/\u2063+$/, "").split(USAGE)[0];
const summaryOf = (w) => body(w).split(MODELS)[0];
// Status pings land in the summary too (see workspace-state.sh). They only
// hold while the session waits on you, and answering a question or permission
// mid-turn fires no hook that could clear them, so they're hidden otherwise.
const PING = /^(Claude is waiting for your input|Claude needs your permission.*|Agent is asking a question)$/;
const isPing = (text) => PING.test(text.trim());
function sessionPair(w, a) {
  const pairs = body(w).split(MODELS)[1] ?? "";
  const pair = pairs.split(" ").find((p) => p.startsWith(a.id.slice(0, 8) + "="));
  return pair ? pair.slice(pair.indexOf("=") + 1).split("@") : null;
}
function modelOf(w, a) {
  const model = sessionPair(w, a)?.[0];
  return model ? modelLabel(model) : "";
}
const promptedAt = (w, a) => feedNum(Number(sessionPair(w, a)?.[1] ?? NaN));

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
// finished and been read, that is just idle. A session whose own turn has
// ended while background subagents it launched are still running is WORKING,
// not INBOX: the work isn't done, and their hand-backs end in a turn of its own
// that lands in INBOX when they finish. A real question still wins. Other
// statuses pass through; ended sessions are the leftovers of /clear (the same
// Claude process carries on as a new session with its own row), and have no
// section, so they are dropped.
const runningChildren = (a) => (a.children ?? []).filter((c) => c.running);
function boardStatus(w, a) {
  if (a.status !== "idle" && a.status !== "needs_input") return a.status;
  if (a.status === "needs_input" && !turnDone(w)) return "needs_input";
  if (runningChildren(a).length > 0) return "working";
  if ((w.unread ?? 0) > 0) return "needs_input";
  return "idle";
}

const epoch = () => data.clock()?.epoch ?? 0;

// Claude's plan usage, the 5-hour session and 7-day limits /usage shows.
// automations/record-usage.sh takes it from the statusline and
// workspace-state.sh copies it into workspace descriptions as
// "5h=<percent>@<reset epoch> 7d=<percent>@<reset epoch> t=<epoch recorded>".
// It is account-wide, so the copy with the newest t wins. A window whose reset
// has passed reads 0% until Claude reports again. Null before any is recorded.
const usage = computed(() => {
  let best = null;
  for (const w of data.workspaces() ?? []) {
    const raw = (w.description ?? "").replace(/\u2063+$/, "").split(USAGE)[1];
    const m = raw?.match(/^5h=(\d+)@(\d+) 7d=(\d+)@(\d+) t=(\d+)$/);
    if (m && (!best || +m[5] > best.t)) best = { t: +m[5], five: [+m[1], +m[2]], week: [+m[3], +m[4]] };
  }
  return best;
});
const usedPct = ([pct, resetsAt]) => (resetsAt && epoch() >= resetsAt ? 0 : pct);
const usageColor = (pct) => (pct >= 90 ? "red" : pct >= 75 ? "orange" : "secondary");

// "resets in 2h 14m" / "resets in 3d 4h", or "" once passed.
function resetsIn(resetsAt) {
  const s = resetsAt - epoch();
  if (!resetsAt || s <= 0) return "";
  const m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
  return "resets in " + (d > 0 ? d + "d " + (h % 24) + "h" : h > 0 ? h + "h " + (m % 60) + "m" : m + "m");
}

// Sits on the title row: an hourglass (the 5-hour session) and a calendar (the
// week), each with its percentage over a thin meter line of
// the same width, turning orange at 75% and red at 90%. Hover for when each
// window resets. Every shape has a fixed size so the row stays text height.
// Compact mode narrows the meters to three quarters, about as tight as "100%" fits.
const METER = 40;
const meterWidth = () => (compact() ? 30 : METER);
const METER_HEX = { gray: "#8E8E93", orange: "#FF9F0A", red: "#FF453A" };
function usageLine() {
  const part = (symbol, pick) => {
    const pct = () => Math.min(100, usedPct(pick(usage())));
    const level = () => (pct() >= 90 ? "red" : pct() >= 75 ? "orange" : "gray");
    return VStack({ spacing: 1, alignment: "leading" }, [
      HStack({ spacing: 2 }, [
        Image(symbol).font(8).color(() => usageColor(pct())),
        Text(() => pct() + "%").font(9).monospaced().color(() => usageColor(pct())),
      ]).frame(() => ({ width: meterWidth(), alignment: "leading" })),
      ZStack({ alignment: "leading" }, [
        Rectangle().fill("#8E8E9326").frame(() => ({ width: meterWidth(), height: 2 })),
        Rectangle().fill(() => METER_HEX[level()])
          .frame(() => ({ width: Math.round((meterWidth() * pct()) / 100), height: 2 })),
      ]).cornerRadius(1).fixedSize(),
    ]).fixedSize();
  };
  const tip = () => {
    const u = usage();
    const line = (name, w) => name + " " + usedPct(w) + "% used" + (resetsIn(w[1]) ? ", " + resetsIn(w[1]) : "");
    return line("Session (5h):", u.five) + "\n" + line("Week (7d):", u.week);
  };
  return when(() => !!usage(), () => HStack({ spacing: 8 }, [
    part("hourglass", (u) => u.five),
    part("calendar", (u) => u.week),
  ]).help(tip));
}

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
  // Within a section, pinned workspaces come first, then rows follow
  // workspace order (the ⌘1-⌘9 order), so a row's hotkey matches its
  // position. Never resort on activity; rows update in place. Sessions in the
  // same workspace fall back to their key.
  out.sort((x, y) => (isPinned(y.ws) ? 1 : 0) - (isPinned(x.ws) ? 1 : 0)
    || (x.ws.index ?? 0) - (y.ws.index ?? 0) || (x.key < y.key ? -1 : 1));
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
const HAND_BACK = /^\s*<(agent-message|task-notification)\b/;
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

// Compact mode, toggled from the header, trims rows for a narrow sidebar to
// the title line (status, title, model, hotkey, time), the branch, and the
// running time of working rows, and cuts feed details to one line. Sidebars get no width and can't keep state, so it's a
// manual switch that resets when cmux reloads the sidebar.
const [compact, setCompact] = signal(false);

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
  const summary = () => {
    const text = e().a ? summaryOf(ws()) : "";
    return isPing(text) && e().status !== "needs_input" ? "" : text;
  };
  const prompt = () => (e().a ? cleanPrompt(ws().latestPrompt) : "");
  const prs = () => (compact() ? [] : ws().prs ?? (ws().pr ? [ws().pr] : []));
  const ports = () => (compact() ? [] : ws().ports ?? []);
  // A run counts from the prompt you typed, through the turns its subagents'
  // hand-backs start (each a "prompt" of its own, resetting sinceEpoch). The
  // transcript time of your prompt only counts once a hand-back follows it:
  // at your own prompt the automation may still hold the one before. Without
  // either, a session working only through background subagents counts from
  // the oldest one still running.
  const workingSince = () => {
    const a = e().a, p = lastPrompt(ws(), a), you = promptedAt(ws(), a);
    const own = a.status === "working" ? a.sinceEpoch
      : Math.min(...runningChildren(a).map((c) => c.startedEpoch ?? Infinity));
    if (p && !HAND_BACK.test(p.raw)) return Math.min(p.at, own ?? Infinity);
    return p && you !== null && you <= p.at ? Math.min(you, own ?? Infinity) : own;
  };
  const runningFor = () => (e().status === "working" && Number.isFinite(workingSince())
    ? fmtElapsed(epoch() - workingSince()) : "");
  // The clear circle mirrors the status dot so details line up under the title.
  return HStack({ spacing: 8, alignment: "top" }, [
    Circle({ size: 7 }).fill("clear"),
    VStack({ spacing: 3, alignment: "leading" }, [
      when(() => !compact() && !!summary(), () => Text(summary)
        .font(11).color("secondary").lineLimit(2).truncation("tail")),
      when(() => !compact() && !!prompt(), () => Text(() => "› " + prompt())
        .font(10).color("tertiary").lineLimit(1).truncation("tail")),
      // Compact rows put the running time at the end of the branch line, where it
      // outranks the branch, so a long branch truncates before the time does.
      when(() => !!ws().branch || prs().length > 0 || ports().length > 0 || (compact() && !!runningFor()),
        () => HStack({ spacing: 4 }, [
          when(() => !!ws().branch, () => HStack({ spacing: 3 }, [
            Image("arrow.triangle.branch").font(9).color("tertiary"),
            Text(() => ws().branch ?? "")
              .font(10).monospaced().color("tertiary").lineLimit(1).truncation("middle"),
            Text(() => (ws().dirty ? "●" : "")).font(8).color("orange"),
          ]).layoutPriority(1)),
          ForEach({ items: prs, key: (p) => prUrl(p) }, (p) =>
            chip(() => prText(p()), () => prColor(p()), () => openURL(prUrl(p())))),
          ForEach({ items: ports, key: (n) => String(n) }, (n) =>
            chip(() => ":" + n(), "secondary", () => openURL("http://localhost:" + n()))),
          Spacer({ minLength: 0 }),
          when(() => compact() && !!runningFor(), () => runningTime(runningFor, "")
            .fixedSize().layoutPriority(3)),
        ])),
      when(() => !compact() && !!runningFor(), () => runningTime(runningFor, "running ")),
    ]),
  ]);
}

function runningTime(runningFor, prefix) {
  return HStack({ spacing: 3 }, [
    Image("timer").font(9).color(() => STATUS_META.working.color),
    Text(() => prefix + runningFor())
      .font(10).monospaced().color(() => STATUS_META.working.color),
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
          when(() => isPinned(e().ws), () => Image("pin.fill").font(9).color(PIN.color)),
          Text(() => e().ws.title + (tabNumber(e()) ? " [^" + tabNumber(e()) + "]" : ""))
            .font(12).weight(strong ? "semibold" : "regular")
            .lineLimit(1).truncation("tail"),
          when(() => !!(e().a && modelOf(e().ws, e().a)), () => Text(() => modelOf(e().ws, e().a))
            .font(10).color("secondary").lineLimit(1).layoutPriority(1)),
        ])),
        when(() => editingKey() === e().key, () => renameField(e)),
        when(() => !compact() && !!e().a, () => Text(() => {
          const running = runningChildren(e().a).length;
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
    .paddingHorizontal(10).paddingVertical(() => (compact() ? 3 : 6))
    .cornerRadius(8)
    // The selected workspace gets a lighter background. Keep it translucent so
    // it lightens the sidebar behind it and the text keeps its contrast: an
    // opaque light fill under the sidebar's light text makes rows unreadable.
    // Unselected rows stay clear so tinted rows match their section's tint
    // instead of stacking a darker band over it; pinned ones take a faint
    // yellow instead.
    .background(() => (e().ws.selected ? tint + "4d" : isPinned(e().ws) ? PIN.tint + "1f" : null))
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

// Right-click offers the agent's tab (same as Option/Command-click), pins and
// renames the workspace, and toggles its unread state, which is what files its sessions
// under INBOX. cmux tracks unread per workspace, not per session. AGENTLESS rows
// have no agent tab; a row's key fixes which kind it is, so this is read once.
function rowMenu(e) {
  const unread = () => (e().ws.unread ?? 0) > 0;
  return [
    ...(e().a ? [Button("Go to Agent Tab", () => jump(e(), true))] : []),
    Button(() => (isPinned(e().ws) ? "Unpin Workspace" : "Pin Workspace"), () =>
      cmux("workspace.action", { action: isPinned(e().ws) ? "unpin" : "pin", workspace_id: e().ws.id })),
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
    .background(meta.fill === false ? null : meta.tint + "1a");
  // The sidebar runtime only draws solid borders (borderColor/borderWidth).
  return meta.border ? section.borderColor(meta.border).borderWidth(1) : section;
}

// RECENT FEED: what agents did, newest first, under the status sections.
// Sidebars can't read files or keep state, so it is built by comparing each
// data push with the last one. It starts over when cmux reloads the sidebar,
// seeded from what cmux still holds (see feedSeed).
const FEED_META = { label: "RECENT FEED", color: "blue", tint: "#0A84FF" };
const FEED_MAX = 200;
const FEED_ROWS = 10;
const FEED_STEP = 25;
// A finished turn's summary and a new turn's prompt are written by
// automations that can land a moment after the status flips, so those events
// keep refreshing their detail this many seconds.
const FEED_GRACE = 20;

const FEED_KIND = {
  // Turns started and finished take WORKING's and IDLE's colors.
  start: { glyph: "▶", color: "purple" },
  done: { glyph: "✓", color: "teal" },
  ask: { glyph: "◆", color: "orange" },
  session: { glyph: "+", color: "secondary" },
  ended: { glyph: "−", color: "tertiary" },
  sub: { glyph: "↳", color: "#5E5CE6" },
  subDone: { glyph: "↳", color: "tertiary" },
  pr: { glyph: "⇡", color: "green" },
};

// A session's state for the feed. Unlike boardStatus, unread doesn't count:
// the feed logs what agents did, not what you've looked at. The idle
// reminder (needs_input after a finished turn) is just idle.
const feedState = (w, a) => (a.status === "needs_input" && turnDone(w) ? "idle" : a.status);
const feedList = (v) => (Array.isArray(v) ? v : []);
const feedNum = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const feedLive = (w) => feedList(w.agents).filter((a) => a.status !== "ended");
const feedPrs = (w) => (feedList(w.prs).length ? feedList(w.prs) : w.pr ? [w.pr] : []);
const prNumber = (p) => (typeof p === "string" ? p.match(/(\d+)\/?$/)?.[1] ?? "?" : p.number);
const prState = (p) => (typeof p === "string" ? "" : p.status ?? "");

// Local time without Date (the runtime has none): the clock's hour/minute/
// second against its epoch give the UTC offset.
function hhmm(t) {
  const c = data.clock();
  let off = 0;
  if (c && feedNum(c.epoch) !== null) {
    off = (c.hour ?? 0) * 3600 + (c.minute ?? 0) * 60 + (c.second ?? 0) - (Math.floor(c.epoch) % 86400);
    if (off > 14 * 3600) off -= 86400;
    if (off < -12 * 3600) off += 86400;
    off = Math.round(off / 900) * 900;
  }
  const s = (((Math.floor(t) + off) % 86400) + 86400) % 86400;
  const pad = (n) => String(n).padStart(2, "0");
  return pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60);
}

// The summary is fresh once workspace-state.sh has marked the turn finished;
// before that the description still holds the previous turn's summary. A
// question mid-turn replaces the description (the notification rule), so it
// shows once it differs from what was there.
const turnDetail = (w) => (turnDone(w) && !isPing(summaryOf(w)) ? summaryOf(w).trim() : "");
const promptDetail = (w) => cleanPrompt(w.latestPrompt);
const askDetail = (w) => {
  const base = summaryOf(w);
  return (x) => (summaryOf(x) !== base ? summaryOf(x).trim() : "");
};

let feedLog = [];
const [feedEvents, setFeedEvents] = signal(feedLog);
let feedNextId = 1;
let feedSeen = null; // "<ws>:<agent>" -> { status, title, children }, "pr:<url>" -> { status }

function feedEvent(t, w, kind, verb, detail, refresh) {
  return { id: feedNextId++, t, kind, verb, detail: detail ?? "", wsId: w.id, ws: w.title ?? "",
    refresh: refresh ?? null, until: refresh ? t + FEED_GRACE : 0 };
}

// The prompt that started a session's latest turn and when: from the session's
// own tab when cmux has it there, else the workspace's (its latest anywhere).
function lastPrompt(w, a) {
  const tab = feedList(w.tabs).find((t) =>
    (a.panelId && t.id === a.panelId) || (a.surfaceId && t.surfaceId === a.surfaceId));
  if (tab && feedNum(tab.latestAt) !== null) return { at: tab.latestAt, raw: tab.latestPrompt ?? "", text: cleanPrompt(tab.latestPrompt) };
  if (feedNum(w.latestAt) !== null && feedLive(w).length === 1) return { at: w.latestAt, raw: w.latestPrompt ?? "", text: cleanPrompt(w.latestPrompt) };
  return null;
}

// What the feed starts with, from what cmux still holds: each live session's
// latest prompt and where that turn stands (working, waiting since, or
// finished at its last activity), subagents' starts and ends, and sessions
// that have ended (the leftovers of /clear) at their last activity.
function feedSeed(workspaces) {
  const out = [];
  for (const w of workspaces) {
    for (const a of feedList(w.agents)) {
      const last = feedNum(a.lastActivityAt);
      if (a.status === "ended") {
        if (last !== null) out.push(feedEvent(last, w, "ended", "ended a session", cleanPrompt(a.title)));
        continue;
      }
      const s = feedState(w, a);
      const p = lastPrompt(w, a);
      const since = feedNum(a.sinceEpoch);
      if (p) out.push(feedEvent(p.at, w, "start", "started a turn", p.text));
      else if (s === "working" && (since ?? last) !== null) out.push(feedEvent(since ?? last, w, "start", "started a turn", promptDetail(w)));
      if (s === "needs_input" && (since ?? last) !== null) out.push(feedEvent(since ?? last, w, "ask", "is waiting on you", ""));
      else if (s === "idle" && last !== null && (!p || last >= p.at)) out.push(feedEvent(last, w, "done", "finished a turn", turnDetail(w)));
      for (const c of feedList(a.children)) {
        const label = c.label || "subagent";
        if (feedNum(c.startedEpoch) !== null) out.push(feedEvent(c.startedEpoch, w, "sub", "started a subagent", label));
        if (!c.running && feedNum(c.endedEpoch) !== null) out.push(feedEvent(c.endedEpoch, w, "subDone", "subagent finished", label));
      }
    }
  }
  return out.sort((x, y) => x.t - y.t || x.id - y.id);
}

function feedSnapshot(workspaces) {
  const out = new Map();
  for (const w of workspaces) {
    for (const a of feedList(w.agents)) {
      const children = {};
      for (const c of feedList(a.children)) children[c.id] = !!c.running;
      out.set(w.id + ":" + a.id, { status: feedState(w, a), title: cleanPrompt(a.title), children });
    }
    for (const p of feedPrs(w)) out.set("pr:" + prUrl(p), { status: prState(p) });
  }
  return out;
}

function feedDiff(workspaces, now) {
  const out = [];
  const present = new Set();
  for (const w of workspaces) {
    for (const a of feedList(w.agents)) {
      present.add(w.id + ":" + a.id);
      const was = feedSeen.get(w.id + ":" + a.id);
      const s = feedState(w, a);
      if (!was) {
        if (s !== "ended") out.push(feedEvent(now, w, "session", "started a session", cleanPrompt(a.title)));
      } else if (was.status !== s) {
        if (s === "working") out.push(feedEvent(now, w, "start", "started a turn", promptDetail(w), promptDetail));
        else if (s === "needs_input") out.push(feedEvent(now, w, "ask", "is waiting on you", "", askDetail(w)));
        else if (s === "ended") out.push(feedEvent(now, w, "ended", "ended a session", was.title));
        else if (was.status === "working") out.push(feedEvent(now, w, "done", "finished a turn", turnDetail(w), turnDetail));
      }
      for (const c of feedList(a.children)) {
        const before = was?.children[c.id];
        const label = c.label || "subagent";
        if (before === undefined && c.running) out.push(feedEvent(now, w, "sub", "started a subagent", label));
        else if (before === true && !c.running) out.push(feedEvent(now, w, "subDone", "subagent finished", label));
      }
    }
    for (const p of feedPrs(w)) {
      const was = feedSeen.get("pr:" + prUrl(p));
      if (!was || (prState(p) && was.status !== prState(p))) {
        out.push(feedEvent(now, w, "pr", "PR #" + prNumber(p) + " " + (prState(p) || "linked"), w.branch ?? ""));
      }
    }
  }
  // Sessions gone from the data without passing through "ended".
  for (const [key, was] of feedSeen) {
    if (key.startsWith("pr:") || present.has(key) || was.status === "ended") continue;
    const w = workspaces.find((x) => key.startsWith(x.id + ":"));
    if (w) out.push(feedEvent(now, w, "ended", "ended a session", was.title));
  }
  return out;
}

// Runs on every data push and writes only `feedLog`/`feedEvents`, which it
// doesn't read reactively, so writing doesn't re-run it.
computed(() => {
  const workspaces = data.workspaces();
  const now = Math.floor(epoch());
  if (!Array.isArray(workspaces) || now === 0) return 0;
  const byId = new Map(workspaces.map((w) => [w.id, w]));
  let next = feedSeen === null ? feedSeed(workspaces) : feedLog.concat(feedDiff(workspaces, now));
  let refreshed = false;
  next = next.map((e) => {
    if (!e.refresh || now > e.until || !byId.has(e.wsId)) return e;
    const detail = e.refresh(byId.get(e.wsId));
    if (!detail || detail === e.detail) return e;
    refreshed = true;
    return { ...e, detail };
  });
  if (next.length > FEED_MAX) next = next.slice(next.length - FEED_MAX);
  const changed = refreshed || next.length !== feedLog.length || next[next.length - 1] !== feedLog[feedLog.length - 1];
  feedSeen = feedSnapshot(workspaces);
  if (changed) {
    feedLog = next;
    setFeedEvents(feedLog);
  }
  return now;
});

// Compact mode starts the feed at FEED_ROWS_COMPACT. The limit is kept as how
// far past the default "show more" has gone, so toggling views keeps that.
const FEED_ROWS_COMPACT = 5;
const feedRows = () => (compact() ? FEED_ROWS_COMPACT : FEED_ROWS);
const [feedExtra, setFeedExtra] = signal(0);
const feedLimit = () => feedRows() + feedExtra();
const setFeedLimit = (n) => setFeedExtra(Math.max(0, n - feedRows()));
const feedShown = computed(() => feedEvents().slice(-feedLimit()).reverse());
const feedOlder = () => Math.max(0, feedEvents().length - feedLimit());
const [feedOpen, setFeedOpen] = signal(true);

// The feed starts short; "show more" steps back FEED_STEP events at a time
// through what's held, and "show less" returns to feedRows().
function moreLine(older, limit, setLimit) {
  return HStack({ spacing: 10 }, [
    when(() => older() > 0, () => Text(() => "show " + Math.min(FEED_STEP, older()) + " more (" + older() + " older)")
      .font(10).color("secondary").lineLimit(1).truncation("tail")
      .paddingHorizontal(5).paddingVertical(1).cornerRadius(5)
      .hoverBackground("#7f7f7f3d").onTap(() => setLimit(limit() + FEED_STEP))),
    when(() => limit() > feedRows(), () => Text("show less")
      .font(10).color("tertiary").lineLimit(1).fixedSize().paddingHorizontal(5).paddingVertical(1).cornerRadius(5)
      .hoverBackground("#7f7f7f3d").onTap(() => setLimit(feedRows()))),
  // No Spacer: the links sit in when() groups, which don't pass on their
  // layoutPriority, so a Spacer would take half the row. Pin left instead.
  ]).paddingHorizontal(5).frame({ maxWidth: "infinity", alignment: "leading" });
}

function feedRow(e) {
  const kind = () => FEED_KIND[e().kind] ?? FEED_KIND.session;
  return HStack({ spacing: 6, alignment: "top" }, [
    // Compact mode drops the timestamp column.
    when(() => !compact(), () => Text(() => hhmm(e().t)).font(10).monospaced().color("tertiary").lineLimit(1).fixedSize()),
    Text(() => kind().glyph).font(10).monospaced().color(() => kind().color)
      .frame({ width: 10, alignment: "center" }),
    VStack({ spacing: 1, alignment: "leading" }, [
      HStack({ spacing: 4 }, [
        Text(() => e().ws).font(11).weight("semibold").lineLimit(1).truncation("tail"),
        Text(() => e().verb).font(11).color("secondary").lineLimit(1).truncation("tail").layoutPriority(1),
      ]),
      when(() => !!e().detail, () => Text(() => e().detail)
        .font(10).color("tertiary").lineLimit(() => (compact() ? 1 : 2)).truncation("tail")),
    ]).layoutPriority(1),
    Spacer({ minLength: 0 }),
  ])
    .paddingHorizontal(10).paddingVertical(3)
    .cornerRadius(8)
    .hoverBackground(FEED_META.tint + "2e")
    .frame({ maxWidth: "infinity" })
    .onTap(() => cmux("workspace.select", { workspace_id: e().wsId }));
}

// Styled like the status sections; tap the header to fold it.
function feedSection() {
  return VStack({ spacing: 3 }, [
    HStack({ spacing: 6 }, [
      Text(() => (feedOpen() ? "" : "▸ ") + FEED_META.label).font(10).weight("semibold").color(FEED_META.color)
        .lineLimit(1).truncation("tail"),
      Spacer(),
      Text(() => (feedEvents().length ? "since " + hhmm(feedEvents()[0].t) : ""))
        .font(10).monospaced().color("tertiary").lineLimit(1).fixedSize(),
    ]).paddingHorizontal(10).frame({ maxWidth: "infinity" }).onTap(() => setFeedOpen(!feedOpen())),
    when(feedOpen, () => VStack({ spacing: 0 }, [
      ForEach({ items: feedShown, key: (e) => String(e.id) }, feedRow),
      Text(() => (feedShown().length === 0 ? "—" : "")).font(10).color("tertiary").paddingHorizontal(10),
      moreLine(feedOlder, feedLimit, setFeedLimit),
    ])),
  ])
    .paddingVertical(6)
    .cornerRadius(10)
    .background(FEED_META.tint + "1a");
}

sidebar(() =>
  VStack({ spacing: () => (compact() ? 6 : 10) }, [
    HStack({ spacing: 6 }, [
      Text("Agent Inbox").font(14).weight("semibold").lineLimit(1),
      Spacer({ minLength: 0 }),
      usageLine(),
      Image(() => (compact() ? "arrow.up.left.and.arrow.down.right" : "arrow.down.right.and.arrow.up.left"))
        .font(10).color(() => (compact() ? "blue" : "secondary"))
        .help(() => (compact() ? "Show details" : "Compact view"))
        .onTap(() => setCompact(!compact())),
    ]).paddingHorizontal(10),
    ...ORDER.map(statusSection),
    feedSection(),
    Spacer(),
  ]).paddingHorizontal(6),
  { surface: "glass" }
)
