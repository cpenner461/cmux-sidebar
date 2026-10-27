// Exercise the automation with isolated sessions and a fake cmux socket boundary.
//   node scripts/check-workspace-state.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cmux-model-check-"));
try {
  const transcript = path.join(dir, "codex.jsonl");
  fs.writeFileSync(transcript, [
    JSON.stringify({ type: "turn_context", payload: { model: "gpt-5.4" } }),
    JSON.stringify({ type: "response_item", payload: { model: "not-a-turn-model" } }),
    '{ "type": "turn_context", "payload": { "model": "gpt-6.1-sol" } }',
    '{"type":"turn_context","payload":', // a write in progress
  ].join("\n"));
  const sessions = [
    { agent: "codex", session_id: "codex123-rest", workspace_id: "WORKSPACE", transcript_path: transcript },
    { agent: "codex", session_id: "other123-rest", workspace_id: "other", transcript_path: transcript },
    { agent: "codex", session_id: "missing1-rest", workspace_id: "workspace", transcript_path: path.join(dir, "missing") },
  ];
  const claudeTranscript = path.join(dir, "claude.jsonl");
  fs.writeFileSync(claudeTranscript,
    '{"type":"user","origin":{"kind":"human"},"timestamp":"1970-01-01T00:15:00Z"}\n' +
    '{"type":"assistant","message":{"model":"claude-opus-5-5"}}\n');
  sessions.push({ agent: "claude", session_id: "claude12-rest", workspace_id: "workspace", transcript_path: claudeTranscript });
  const fake = path.join(dir, "cmux.js");
  fs.writeFileSync(fake, `
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'sessions') console.log(JSON.stringify({sessions: ${JSON.stringify(sessions)}}));
else if (args[0] === 'rpc') console.log(JSON.stringify({workspaces: [{id: 'workspace', description: 'Summary.'}]}));
else fs.appendFileSync(process.env.ACTIONS, JSON.stringify(args) + '\\n');
`);
  const run = () => {
    const result = spawnSync("bash", ["-c", 'cmux() { node "$FAKE_CMUX" "$@"; }; export -f cmux; bash automations/workspace-state.sh notification workspace'], {
      cwd: path.resolve(__dirname, ".."), encoding: "utf8",
      env: { ...process.env, CMUX_PANEL_LOCKED: "1", FAKE_CMUX: fake,
        ACTIONS: path.join(dir, "actions"), XDG_CACHE_HOME: dir },
    });
    assert.equal(result.status, 0, result.stderr);
    if (!fs.existsSync(path.join(dir, "actions"))) return "Summary.";
    const actions = fs.readFileSync(path.join(dir, "actions"), "utf8").trim().split("\n").map(JSON.parse);
    return actions.at(-1).at(-1);
  };
  assert.equal(run(), "Summary.\u2064codex123=gpt-6.1-sol claude12=claude-opus-5-5@900", "use the latest turn model for this workspace, tolerating incomplete and missing transcripts and preserving Claude metadata");
  fs.appendFileSync(transcript, '\n{"type":"turn_context","payload":{"model":"gpt-6.1-terra"}}\n');
  assert.equal(run(), "Summary.\u2064codex123=gpt-6.1-terra claude12=claude-opus-5-5@900", "refresh the model after a switch");
  console.log("Workspace model checks passed.");
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
