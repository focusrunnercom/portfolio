/**
 * Vercel Serverless Function: /api/client-config
 * SINGLE-FILE — zero imports. CJS for Vercel Node 18.x Hobby compat.
 * CRUD for per-client config stored in Vercel KV (REST API, zero deps).
 */

var KV_URL = process.env.KV_REST_API_URL || '';
var KV_TOKEN = process.env.KV_REST_API_TOKEN || '';
var KV_ON = !!(KV_URL && KV_TOKEN);
var mem = {};

function kvGet(key) {
  if (!KV_ON) return Promise.resolve(mem[key] || null);
  return fetch(KV_URL, { method:'POST', headers:{'Authorization':'Bearer '+KV_TOKEN,'Content-Type':'application/json'}, body:JSON.stringify(['GET',key]) })
    .then(function(r){return r.json();})
    .then(function(d){var raw=d.result;if(raw===null||raw===undefined)return null;if(typeof raw==='string'){try{return JSON.parse(raw);}catch(e){return raw;}}return raw;})
    .catch(function(e){console.error('[cc] GET err:',e.message);return mem[key]||null;});
}

function kvSet(key, val) {
  var s = typeof val === 'string' ? val : JSON.stringify(val);
  mem[key] = val;
  if (!KV_ON) return Promise.resolve(true);
  return fetch(KV_URL, { method:'POST', headers:{'Authorization':'Bearer '+KV_TOKEN,'Content-Type':'application/json'}, body:JSON.stringify(['SET',key,s]) })
    .then(function(r){return r.ok;})
    .catch(function(e){console.error('[cc] SET err:',e.message);return false;});
}

function kvDel(key) {
  delete mem[key];
  if (!KV_ON) return Promise.resolve(true);
  return fetch(KV_URL, { method:'POST', headers:{'Authorization':'Bearer '+KV_TOKEN,'Content-Type':'application/json'}, body:JSON.stringify(['DEL',key]) })
    .then(function(r){return r.ok;})
    .catch(function(e){console.error('[cc] DEL err:',e.message);return false;});
}

function getDefaults() { try { return JSON.parse(process.env.CLIENT_CONFIGS||'{}'); } catch(e) { return {}; } }
function checkAuth(req) { var k=process.env.ADMIN_API_KEY; return !k || (req.headers['x-admin-key']||'')===k; }

function cors() { return { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Methods':'GET,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers':'Content-Type,X-Admin-Key', 'Content-Type':'application/json' }; }

module.exports = function(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors()); return res.end(); }
  var u = new URL(req.url, 'http://x');
  var ci = u.searchParams.get('clientId') || '';

  if (req.method === 'GET') {
    if (ci) { kvGet('client:'+ci).then(function(cfg){cfg=cfg||getDefaults()[ci]||null;res.writeHead(200,cors());res.end(JSON.stringify({clientId:ci,config:cfg}));}); return; }
    res.writeHead(200, cors()); return res.end(JSON.stringify({clients:getDefaults()}));
  }

  if (req.method === 'POST') {
    if (!checkAuth(req)) { res.writeHead(401, cors()); return res.end(JSON.stringify({error:'Unauthorized'})); }
    var body = '';
    req.on('data', function(c){body+=c;});
    req.on('end', function() {
      var d; try { d=JSON.parse(body); } catch(e) { res.writeHead(400,cors()); return res.end(JSON.stringify({error:'Invalid JSON'})); }
      if (!d.clientId) { res.writeHead(400,cors()); return res.end(JSON.stringify({error:'clientId required'})); }
      kvSet('client:'+d.clientId, d.config||{}).then(function(){res.writeHead(200,cors());res.end(JSON.stringify({success:true,clientId:d.clientId}));});
    });
    return;
  }

  if (req.method === 'DELETE') {
    if (!checkAuth(req)) { res.writeHead(401, cors()); return res.end(JSON.stringify({error:'Unauthorized'})); }
    if (!ci) { res.writeHead(400, cors()); return res.end(JSON.stringify({error:'clientId param required'})); }
    kvDel('client:'+ci).then(function(){res.writeHead(200,cors());res.end(JSON.stringify({success:true,clientId:ci}));});
    return;
  }

  res.writeHead(405, cors()); res.end(JSON.stringify({error:'Method not allowed'}));
};
