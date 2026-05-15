/**
 * Vercel Serverless Function: /api/ping
 * Minimal health probe — returns 200 OK JSON.
 */
module.exports = (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() }));
};
