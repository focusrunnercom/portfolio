/**
 * Redirect /api/widget.js to the static file served at /fr-widget.js
 * Vercel Serverless functions don't serve raw JS files.
 * The actual widget is at public/fr-widget.js → /fr-widget.js
 */
export default function handler() {
  return new Response(null, {
    status: 307,
    headers: {
      'Location': '/fr-widget.js',
      'Cache-Control': 'no-cache',
    },
  });
}
