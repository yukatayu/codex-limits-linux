const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const scriptPath = path.join(__dirname, 'codex-limits');

function makeTempSessionsDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-limits-'));
}

function writeSessionFile(rootDir, relativePath, lines, mtimeMs) {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
  const mtime = new Date(mtimeMs);
  fs.utimesSync(filePath, mtime, mtime);
  return filePath;
}

function runCli(sessionsDir) {
  return spawnSync(process.execPath, [scriptPath], {
    env: {
      ...process.env,
      CODEX_SESSIONS_DIR: sessionsDir,
      TZ: 'Asia/Tokyo',
    },
    encoding: 'utf8',
  });
}

test('prints remaining 5h and weekly limits from the newest session file', () => {
  const sessionsDir = makeTempSessionsDir();

  writeSessionFile(
    sessionsDir,
    '2026/04/19/rollout-older.jsonl',
    [
      JSON.stringify({
        timestamp: '2026-04-19T15:00:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          rate_limits: {
            limit_id: 'codex',
            primary: { used_percent: 90, window_minutes: 300, resets_at: 1776600000 },
            secondary: { used_percent: 80, window_minutes: 10080, resets_at: 1777000000 },
          },
        },
      }),
    ],
    Date.UTC(2026, 3, 19, 15, 0, 0),
  );

  const newestFile = writeSessionFile(
    sessionsDir,
    '2026/04/20/rollout-newest.jsonl',
    [
      JSON.stringify({
        timestamp: '2026-04-19T15:48:16.937Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          rate_limits: {
            limit_id: 'codex',
            primary: { used_percent: 3, window_minutes: 300, resets_at: 1776629148 },
            secondary: { used_percent: 26, window_minutes: 10080, resets_at: 1776972712 },
          },
        },
      }),
      JSON.stringify({
        timestamp: '2026-04-19T15:48:56.448Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          rate_limits: {
            limit_id: 'codex',
            primary: { used_percent: 4, window_minutes: 300, resets_at: 1776629148 },
            secondary: { used_percent: 26, window_minutes: 10080, resets_at: 1776972712 },
          },
        },
      }),
    ],
    Date.UTC(2026, 3, 19, 15, 49, 0),
  );

  const result = runCli(sessionsDir);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');

  const payload = JSON.parse(result.stdout);
  assert.equal(payload.session_file, newestFile);
  assert.equal(payload.captured_at, '2026-04-19T15:48:56.448Z');
  assert.deepEqual(payload.five_hour, {
    remaining_percent: 96,
    resets_at_unix: 1776629148,
    resets_at_local: '2026-04-20T05:05:48+09:00',
  });
  assert.deepEqual(payload.weekly, {
    remaining_percent: 74,
    resets_at_unix: 1776972712,
    resets_at_local: '2026-04-24T04:31:52+09:00',
  });
});

test('fails when no session file is available', () => {
  const sessionsDir = makeTempSessionsDir();

  const result = runCli(sessionsDir);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /No Codex session JSONL files found/);
  assert.equal(result.stdout, '');
});
