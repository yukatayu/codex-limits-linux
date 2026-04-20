const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const scriptPath = path.join(__dirname, 'codex-limits');
const byobuScriptPath = path.join(__dirname, 'byobu-codex-limits');
const installScriptPath = path.join(__dirname, 'install-byobu-codex-status');

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

function runNodeScript(script, extraEnv = {}) {
  return spawnSync(process.execPath, [script], {
    env: {
      ...process.env,
      ...extraEnv,
    },
    encoding: 'utf8',
  });
}

function runExecutable(script, extraEnv = {}) {
  return spawnSync(script, [], {
    env: {
      ...process.env,
      ...extraEnv,
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

test('prints compact byobu status text from the latest session', () => {
  const sessionsDir = makeTempSessionsDir();
  writeSessionFile(
    sessionsDir,
    '2026/04/20/rollout-newest.jsonl',
    [
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

  const result = runNodeScript(byobuScriptPath, {
    CODEX_SESSIONS_DIR: sessionsDir,
    BYOBU_NOW_UNIX: '1776828712',
    TZ: 'Asia/Tokyo',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '74%(1d16h)');
  assert.equal(result.stderr, '');
});

test('formats a themed byobu badge and escapes percent for tmux status output', () => {
  const sessionsDir = makeTempSessionsDir();
  writeSessionFile(
    sessionsDir,
    '2026/04/20/rollout-newest.jsonl',
    [
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

  const result = runNodeScript(byobuScriptPath, {
    CODEX_STATUS_BYOBU: '1',
    CODEX_SESSIONS_DIR: sessionsDir,
    BYOBU_NOW_UNIX: '1776828712',
    BYOBU_ACCENT: '#75507B',
    BYOBU_DARK: '#333333',
    BYOBU_LIGHT: '#EEEEEE',
    TZ: 'Asia/Tokyo',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.trim(),
    '#[default]#[fg=#EEEEEE,bg=#2F855A]74%%(1d16h)#[default]#[fg=#EEEEEE,bg=#333333]',
  );
  assert.equal(result.stderr, '');
});

test('uses a muted amber badge when weekly remaining is between 20 and 49 percent', () => {
  const sessionsDir = makeTempSessionsDir();
  writeSessionFile(
    sessionsDir,
    '2026/04/20/rollout-newest.jsonl',
    [
      JSON.stringify({
        timestamp: '2026-04-19T15:48:56.448Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          rate_limits: {
            limit_id: 'codex',
            primary: { used_percent: 4, window_minutes: 300, resets_at: 1776629148 },
            secondary: { used_percent: 65, window_minutes: 10080, resets_at: 1776972712 },
          },
        },
      }),
    ],
    Date.UTC(2026, 3, 19, 15, 49, 0),
  );

  const result = runNodeScript(byobuScriptPath, {
    CODEX_STATUS_BYOBU: '1',
    CODEX_SESSIONS_DIR: sessionsDir,
    BYOBU_NOW_UNIX: '1776828712',
    BYOBU_DARK: '#333333',
    BYOBU_LIGHT: '#EEEEEE',
    TZ: 'Asia/Tokyo',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.trim(),
    '#[default]#[fg=#EEEEEE,bg=#C9922E]35%%(1d16h)#[default]#[fg=#EEEEEE,bg=#333333]',
  );
  assert.equal(result.stderr, '');
});

test('uses a muted red badge when weekly remaining is below 20 percent', () => {
  const sessionsDir = makeTempSessionsDir();
  writeSessionFile(
    sessionsDir,
    '2026/04/20/rollout-newest.jsonl',
    [
      JSON.stringify({
        timestamp: '2026-04-19T15:48:56.448Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          rate_limits: {
            limit_id: 'codex',
            primary: { used_percent: 4, window_minutes: 300, resets_at: 1776629148 },
            secondary: { used_percent: 90, window_minutes: 10080, resets_at: 1776972712 },
          },
        },
      }),
    ],
    Date.UTC(2026, 3, 19, 15, 49, 0),
  );

  const result = runNodeScript(byobuScriptPath, {
    CODEX_STATUS_BYOBU: '1',
    CODEX_SESSIONS_DIR: sessionsDir,
    BYOBU_NOW_UNIX: '1776828712',
    BYOBU_DARK: '#333333',
    BYOBU_LIGHT: '#EEEEEE',
    TZ: 'Asia/Tokyo',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout.trim(),
    '#[default]#[fg=#EEEEEE,bg=#C0565B]10%%(1d16h)#[default]#[fg=#EEEEEE,bg=#333333]',
  );
  assert.equal(result.stderr, '');
});

test('prints n/a for byobu when no session file is available', () => {
  const sessionsDir = makeTempSessionsDir();

  const result = runNodeScript(byobuScriptPath, {
    CODEX_SESSIONS_DIR: sessionsDir,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'n/a');
  assert.equal(result.stderr, '');
});

test('installer enables byobu custom status and links the formatter script', () => {
  const byobuDir = makeTempSessionsDir();
  const sessionsDir = makeTempSessionsDir();
  const statusFile = path.join(byobuDir, 'status');
  fs.writeFileSync(
    statusFile,
    'tmux_right="#network #disk_io #custom uptime date time"\n',
  );

  writeSessionFile(
    sessionsDir,
    '2026/04/20/rollout-newest.jsonl',
    [
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

  const result = runNodeScript(installScriptPath, {
    BYOBU_CONFIG_DIR: byobuDir,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Installed Byobu Codex status integration/);

  const updatedStatus = fs.readFileSync(statusFile, 'utf8');
  assert.match(updatedStatus, /tmux_right="#network #disk_io uptime custom date time"/);

  const linkPath = path.join(byobuDir, 'bin', '300_codex_limits');
  const installedLibDir = path.join(byobuDir, 'bin', 'codex-status');
  const installedScript = fs.readFileSync(linkPath, 'utf8');
  assert.equal(fs.statSync(linkPath).mode & 0o111, 0o111);
  assert.match(installedScript, /SCRIPT_DIR=\$\(CDPATH= cd -- "\$\(dirname -- "\$0"\)" && pwd\)/);
  assert.match(installedScript, /exec "\$SCRIPT_DIR\/codex-status\/byobu-codex-limits"/);
  assert.equal(fs.existsSync(path.join(installedLibDir, 'byobu-codex-limits')), true);
  assert.equal(fs.existsSync(path.join(installedLibDir, 'codex-limits')), true);

  const wrapperResult = runExecutable(linkPath, {
    CODEX_SESSIONS_DIR: sessionsDir,
    BYOBU_NOW_UNIX: '1776828712',
    BYOBU_ACCENT: '#75507B',
    BYOBU_DARK: '#333333',
    BYOBU_LIGHT: '#EEEEEE',
    TZ: 'Asia/Tokyo',
  });
  assert.equal(wrapperResult.status, 0, wrapperResult.stderr);
  assert.equal(
    wrapperResult.stdout.trim(),
    '#[default]#[fg=#EEEEEE,bg=#2F855A]74%%(1d16h)#[default]#[fg=#EEEEEE,bg=#333333]',
  );
  assert.equal(wrapperResult.stderr, '');
});

test('installer moves legacy backup files out of the byobu custom glob', () => {
  const byobuDir = makeTempSessionsDir();
  const binDir = path.join(byobuDir, 'bin');
  const legacyBackup = path.join(binDir, '300_codex_limits.bak.2026-04-20T01-00-00.000Z');

  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(byobuDir, 'status'), 'tmux_right="custom date time"\n');
  fs.writeFileSync(legacyBackup, '#!/bin/sh\necho legacy\n', { mode: 0o755 });
  fs.chmodSync(legacyBackup, 0o755);

  const result = runNodeScript(installScriptPath, {
    BYOBU_CONFIG_DIR: byobuDir,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(legacyBackup), false);
  assert.equal(
    fs.existsSync(path.join(binDir, 'backup.300_codex_limits.2026-04-20T01-00-00.000Z')),
    true,
  );
});
