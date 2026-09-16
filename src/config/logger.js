export function logInfo(message, meta = {}) {
  console.log(JSON.stringify({ level: 'info', message, ...meta }));
}

export function logWarn(message, meta = {}) {
  console.warn(JSON.stringify({ level: 'warn', message, ...meta }));
}

export function logError(message, meta = {}) {
  console.error(JSON.stringify({ level: 'error', message, ...meta }));
}
