// Smoke-test a JS sidebar against the runtime bundled in the installed cmux,
// since `cmux sidebar validate` does not execute the file. Feeds it sample
// workspaces, prints the rendered text tree, and taps every tappable node.
//   node scripts/check-sidebar.js "sidebars/Agent Inbox.js"
const fs = require("fs"), vm = require("vm");
const runtimePath = process.env.CMUX_SIDEBAR_RUNTIME ??
  "/Applications/cmux.app/Contents/Resources/CmuxSwiftRenderUI_CmuxSwiftRenderUI.bundle/Contents/Resources/SidebarRuntime.js";
const sidebarPath = process.argv[2];
const nodes = {}; let root = null; const actions = [];
const ctx = {
  __host_applyOps: (json) => { for (const op of JSON.parse(json)) {
    if (op.op === "create") nodes[op.id] = { type: op.type, props: {}, children: [] };
    else if (op.op === "update") nodes[op.id].props[op.key] = op.value;
    else if (op.op === "children") nodes[op.id].children = op.children;
    else if (op.op === "append") nodes[op.id].children.push(op.child);
    else if (op.op === "root") root = op.id;
  } },
  __host_action: (j) => actions.push(JSON.parse(j)),
  __host_log: (s) => console.log("log:", s),
  console, Math, JSON, String, Number, Object, Array, Set, Map, Error,
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(runtimePath, "utf8"), ctx);
vm.runInContext(fs.readFileSync(sidebarPath, "utf8"), ctx, { filename: sidebarPath });
const dump = (id, d = 0) => { const n = nodes[id]; if (!n) return;
  const t = n.props.text !== undefined ? JSON.stringify(n.props.text) : "";
  if (n.type === "text" || n.type === "image") console.log("  ".repeat(d) + n.type + " " + (t || n.props.systemName) + (n.props.color ? " [" + n.props.color + "]" : "") + (n.props.tappable ? " (tap)" : ""));
  n.children.forEach((c) => dump(c, d + (n.type === "group" ? 0 : 1))); };
const set = (k, v) => ctx.__setData(k, JSON.stringify(v));
set("clock", { epoch: 1000 });
const ws = (o) => ({ id: "w1", title: "cycle-status-board", ...o,
  tabs: [{ id: "p0", surfaceId: "s0", title: "zsh" }, { id: "p1", surfaceId: "s1", title: "claude" }],
  agents: [{ id: "a1", kind: "claude", name: "Claude", status: "needs_input", title: "Fix board", lastActivityAt: 900, surfaceId: "s1", panelId: "p1" }] });
console.log("== full data (object PRs)");
set("workspaces", [ws({ description: "I've switched the Status tab to the GitHub App.\u2064a1=claude-opus-5-5 zz999999=claude-sonnet-4-5-20250929\u20625h=7@9000 7d=82@600000 t=990\u2063",
  latestPrompt: '<pasted_content id="d12e"> Write the plan for <b>plan 4</b> </pasted_content>', branch: "cycle-status-board", dirty: true,
  prs: [{ number: 32, url: "https://github.com/x/y/pull/32", status: "open" }], ports: [4001, 56197] })]);
dump(root);
console.log("== usage: newest copy wins; a passed reset reads 0%");
set("workspaces", [ws({ description: "Old.\u20625h=50@9000 7d=95@600000 t=100" }),
  { ...ws({ description: "\u2064a1=claude-opus-5-5\u20625h=93@500 7d=20@600000 t=990\u2063" }), id: "w9" }]);
dump(root);
console.log("== string PRs, no message, no branch");
set("workspaces", [ws({ latestPrompt: '<agent-message from="abc"> [Subagent hand-back] ...', prs: ["https://github.com/x/y/pull/7"], ports: [] })]);
dump(root);
console.log("== nothing extra");
set("workspaces", [ws({})]);
dump(root);
console.log("== INBOX: unread or blocked mid-turn; read finished turns are IDLE; ended sessions hidden");
set("workspaces", [
  { id: "w2", title: "read-reminder", description: "Done with the refactor.\u2063", unread: 0,
    agents: [{ id: "a2", name: "Claude", status: "needs_input", lastActivityAt: 900 },
             { id: "a3", name: "Old session", status: "ended", lastActivityAt: 100 }] },
  { id: "w3", title: "really-blocked", description: "Summary.", unread: 0,
    agents: [{ id: "a4", name: "Claude", status: "needs_input", lastActivityAt: 900 }] },
  { id: "w4", title: "unread-finished", description: "All done.\u2063", unread: 1,
    agents: [{ id: "a5", name: "Claude", status: "idle", lastActivityAt: 900 },
             { id: "a7", name: "Cleared session", status: "ended", lastActivityAt: 100 }] },
  { id: "w5", title: "unread-but-working", unread: 2,
    agents: [{ id: "a6", name: "Claude", status: "working", sinceEpoch: 813, lastActivityAt: 900 }] },
]);
dump(root);
console.log("== AGENTLESS: workspaces with no agents, or only ended ones");
set("workspaces", [
  { id: "w6", index: 0, title: "has-agent", agents: [{ id: "a8", name: "Claude", status: "idle", lastActivityAt: 900 }] },
  { id: "w7", index: 1, title: "empty-shell", branch: "main", description: "Old summary.\u2063", latestPrompt: "old prompt", selected: true, tabs: [{ id: "p2", title: "zsh" }] },
  { id: "w8", index: 2, title: "only-cleared", agents: [{ id: "a9", name: "Old", status: "ended", lastActivityAt: 100 }] },
]);
dump(root);
console.log("== background subagents still running: WORKING even when unread; a real question still INBOX");
set("workspaces", [
  { id: "w13", index: 0, title: "bg-agents", description: "Launched 5.\u2063", unread: 1,
    agents: [{ id: "c1", name: "Claude", status: "idle", sinceEpoch: 700, lastActivityAt: 700,
      children: [{ id: "k1", running: true, startedEpoch: 640 }, { id: "k2", running: false, startedEpoch: 600 }] }] },
  { id: "w14", index: 1, title: "bg-but-asking", description: "Question?", unread: 1,
    agents: [{ id: "c2", name: "Claude", status: "needs_input", lastActivityAt: 900,
      children: [{ id: "k3", running: true, startedEpoch: 640 }] }] },
  { id: "w15", index: 2, title: "bg-done", description: "All back.\u2063", unread: 1,
    agents: [{ id: "c3", name: "Claude", status: "idle", lastActivityAt: 900, children: [{ id: "k4", running: false }] }] },
]);
dump(root);
console.log("== a run counts from your prompt across hand-back turns: running 16m 40s, 3m 20s, 1m 40s");
const tabs = (at, prompt) => [{ id: "p9", surfaceId: "s9", title: "claude", latestAt: at, latestPrompt: prompt }];
set("workspaces", [
  { id: "w19", index: 0, title: "handed-back", description: "\u2064e1=claude-opus-5-5@0", tabs: tabs(950, '<agent-message from="abc"> ...'),
    agents: [{ id: "e1", name: "Claude", status: "working", sinceEpoch: 950, lastActivityAt: 990, panelId: "p9" }] },
  { id: "w20", index: 1, title: "stale-prompt-time", description: "\u2064e2=claude-opus-5-5@300", tabs: tabs(800, "you typed this"),
    agents: [{ id: "e2", name: "Claude", status: "working", sinceEpoch: 800, lastActivityAt: 990, panelId: "p9" }] },
  { id: "w21", index: 2, title: "bg-after-prompt", description: "\u2064e3=claude-opus-5-5@900\u2063", tabs: tabs(900, "launch some agents"),
    agents: [{ id: "e3", name: "Claude", status: "idle", sinceEpoch: 960, lastActivityAt: 960, panelId: "p9",
      children: [{ id: "k6", running: true, startedEpoch: 950 }] }] },
]);
dump(root);
console.log("== status pings show only while the session waits: 'Agent is asking a question' on asked, nothing on answered/subagents");
set("workspaces", [
  { id: "w16", index: 0, title: "asked", description: "Agent is asking a question",
    agents: [{ id: "d1", name: "Claude", status: "needs_input", lastActivityAt: 900 }] },
  { id: "w17", index: 1, title: "answered", description: "Agent is asking a question",
    agents: [{ id: "d2", name: "Claude", status: "working", sinceEpoch: 880, lastActivityAt: 900 }] },
  { id: "w18", index: 2, title: "subagents", description: "Claude is waiting for your input⁣",
    agents: [{ id: "d3", name: "Claude", status: "idle", lastActivityAt: 900,
      children: [{ id: "k5", running: true, startedEpoch: 640 }] }] },
]);
dump(root);
console.log("== pinned workspaces lead their section, with a pin");
set("workspaces", [
  { id: "w10", index: 0, title: "unpinned-idle", agents: [{ id: "b1", name: "Claude", status: "idle", lastActivityAt: 900 }] },
  { id: "w11", index: 1, title: "pinned-idle", pinned: true, agents: [{ id: "b2", name: "Claude", status: "idle", lastActivityAt: 900 }] },
  { id: "w12", index: 2, title: "plain-terminal", pinned: true },
]);
dump(root);
console.log("== compact: title line and branch only; tapping again restores the rest");
set("workspaces", [ws({ description: "Summary.\u2064a1=claude-opus-5-5\u20625h=7@9000 7d=82@600000 t=990\u2063", branch: "main", prs: [{ number: 32, url: "https://github.com/x/y/pull/32", status: "open" }], ports: [4001] })]);
const toggle = () => Object.keys(nodes).find((id) => nodes[id].type === "image" && /^arrow\./.test(nodes[id].props.systemName));
ctx.__dispatch(toggle(), "tap", null);
dump(root);
console.log("== compact: the running time sits on the branch line, without 'running'");
set("workspaces", [{ id: "w22", index: 0, title: "busy", branch: "a-very-long-feature-branch-name",
  agents: [{ id: "f1", name: "Claude", status: "working", sinceEpoch: 813, lastActivityAt: 990 }] }]);
dump(root);
ctx.__dispatch(toggle(), "tap", null);
dump(root);
console.log("== tap every tappable node");
for (const [id, n] of Object.entries(nodes)) if (n.props.tappable) ctx.__dispatch(id, "tap", null);
console.log(JSON.stringify(actions));
