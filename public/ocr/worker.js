const workerUrl = new URL(new URL(self.location.href).searchParams.get('script') || '', self.location.href);
if (workerUrl.origin !== self.location.origin || !workerUrl.pathname.endsWith('.js') || workerUrl.pathname === self.location.pathname) {
  throw new Error('Không mở được bộ đọc chữ.');
}

// Keep known diagnostics from sparse frames available at debug level.
const noisy = /^(?:Estimating resolution as \d+|Error in (?:boxClipToRectangle|pixScanForForeground)\b)/;
for (const level of ['error', 'warn', 'log']) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    if (typeof args[0] === 'string' && noisy.test(args[0])) console.debug(...args);
    else original(...args);
  };
}
self.importScripts(workerUrl.href);
