/**
 * Vercel Serverless Function: /api/leads
 * SINGLE-FILE — zero imports from lib/*.
 * CJS for Vercel Node 18.x Hobby compat.
 */

var fs = require('fs');

module.exports = function(req, res) {
  function c() { return { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,POST,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type', 'Content-Type':'application/json' }; }
  if (req.method === 'OPTIONS') { res.writeHead(204, c()); return res.end(); }
  if (req.method === 'GET') { try { var d = fs.existsSync('/tmp/leads.json') ? JSON.parse(fs.readFileSync('/tmp/leads.json','utf-8')) : {leads:[]}; var l = (d.leads||[]).reverse(); res.writeHead(200,c()); return res.end(JSON.stringify({leads:l,count:l.length})); } catch(e) { res.writeHead(200,c()); return res.end(JSON.stringify({leads:[],count:0})); } }
  if (req.method === 'POST') { var k = process.env.ADMIN_API_KEY; var a = (req.headers['authorization']||'').replace(/^Bearer\s+/i,''); if (k && a!==k) { res.writeHead(401,c()); return res.end(JSON.stringify({error:'Unauthorized'})); } try { fs.writeFileSync('/tmp/leads.json',JSON.stringify({leads:[]})); res.writeHead(200,c()); return res.end(JSON.stringify({success:true})); } catch(e) { res.writeHead(500,c()); return res.end(JSON.stringify({error:'Failed'})); } }
  res.writeHead(405,c()); res.end(JSON.stringify({error:'Method not allowed'}));
};
