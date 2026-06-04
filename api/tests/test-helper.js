// Shared test helper: wraps a Vercel-style (req, res) handler into an http.Server
// that Supertest can drive.

const http = require('http');
const { URL } = require('url');

/**
 * Create an HTTP server for the given handler function.
 * The handler receives a Node.js IncomingMessage and ServerResponse
 * with a body-parsing shim for JSON bodies.
 */
function createServer(handler) {
  return http.createServer((req, res) => {
    // Collect body chunks
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      // Parse JSON if provided
      if (body && req.headers['content-type']?.includes('application/json')) {
        try { req.body = JSON.parse(body); } catch (_) { /* leave raw */ }
      }

      // Default request.url to / if not set
      if (!req.url) req.url = '/';

      // Run the handler
      handler(req, res);
    });
  });
}

module.exports = { createServer };
