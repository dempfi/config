'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const STATE_DIR = path.join(os.homedir(), '.claude', 'state');
const EXPIRY_MS = 24 * 60 * 60 * 1000;
const FALLBACK_WINDOW_MS = 10 * 60 * 1000;
const EMPTY_RESULT = /No (?:symbols?|references|definitions?|implementations?|hover information|results?|incoming calls|outgoing calls) (?:found|available)|found nothing/i;

function projectRoot(data) {
  return process.env.CLAUDE_PROJECT_DIR || (data && typeof data.cwd === 'string' && data.cwd) || process.cwd();
}

function flagPath(data) {
  const hash = crypto.createHash('md5').update(projectRoot(data)).digest('hex').slice(0, 12);
  return path.join(STATE_DIR, `lsp-ready-${hash}`);
}

function readFlag(data) {
  try {
    const flag = JSON.parse(fs.readFileSync(flagPath(data), 'utf8'));
    return Date.now() - (flag.timestamp || 0) > EXPIRY_MS ? null : flag;
  } catch {
    return null;
  }
}

function writeFlag(data, flag) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(flagPath(data), JSON.stringify(flag));
  } catch {}
}

function isEmptyResult(response) {
  const text = typeof response === 'string' ? response : JSON.stringify(response || '');
  return EMPTY_RESULT.test(text);
}

function lspCameBackEmptyRecently(data) {
  const flag = readFlag(data);
  return Boolean(flag && flag.last_empty_at && Date.now() - flag.last_empty_at < FALLBACK_WINDOW_MS);
}

module.exports = { flagPath, readFlag, writeFlag, isEmptyResult, lspCameBackEmptyRecently, FALLBACK_WINDOW_MS };
