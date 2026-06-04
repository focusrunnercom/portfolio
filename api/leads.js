/**
 * Vercel Serverless Function: /api/leads
 * SINGLE-FILE — zero imports from lib/*.
 * CJS for Vercel Node 18.x Hobby compat.
 */

var fs = require('fs');
var { rateLimit, requireAuth, corsHeaders } = require('./_middleware');

module.exports = function(req, res) {
  if (!rateLimit(req, res)) return;
  if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders()); return res.end(); }
  if (req.method === 'GET') { try { var d = fs.existsSync('/tmp/leads.json') ? JSON.parse(fs.readFileSync('/tmp/leads.json','utf-8')) : {leads:[]}; var l = (d.leads||[]).reverse(); res.writeHead(200,corsHeaders()); return res.end(JSON.stringify({leads:l,count:l.length})); } catch(e) { res.writeHead(200,corsHeaders()); return res.end(JSON.stringify({leads:[],count:0})); } }
  if (req.method === 'POST') { if (!requireAuth(req, res)) return; try { fs.writeFileSync('/tmp/leads.json',JSON.stringify({leads:[]})); res.writeHead(200,corsHeaders()); return res.end(JSON.stringify({success:true})); } catch(e) { res.writeHead(500,corsHeaders()); return res.end(JSON.stringify({error:'Failed'})); } }
  res.writeHead(405,corsHeaders()); res.end(JSON.stringify({error:'Method not allowed'}));
};
