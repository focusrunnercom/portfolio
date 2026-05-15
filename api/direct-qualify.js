/**
 * Vercel Serverless Function: /api/direct-qualify
 * Thin wrapper — delegates to _lib/direct-qualify.js
 */
const handler = require('../_lib/direct-qualify.js');
module.exports = handler;
