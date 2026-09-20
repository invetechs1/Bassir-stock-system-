import { config } from './config.js';

// Minimal structured JSON logger — zero dependencies, production-friendly.
// Emits one JSON object per line so logs are machine-parseable.
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const activeLevel = config.isProd ? LEVELS.info : LEVELS.debug;

function emit(level, msg, meta) {
  if (LEVELS[level] > activeLevel) return;
  if (config.isTest) return; // keep test output clean
  const line = {
    time: new Date().toISOString(),
    level,
    msg,
    ...(meta || {})
  };
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  error: (msg, meta) => emit('error', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  debug: (msg, meta) => emit('debug', msg, meta)
};
