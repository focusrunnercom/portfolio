export default async function handler(request) {
  return new Response(JSON.stringify({ ok: true, method: request.method }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
