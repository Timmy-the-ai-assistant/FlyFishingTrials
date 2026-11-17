/**
 * WP Fly Fishing Trials - Cloudflare Edge Worker
 * Matches the Nymphnode.com edge architecture on Cloudflare.
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS headers for all devices & mobile anglers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check endpoint
    if (url.pathname === '/api/health') {
      return new Response(JSON.stringify({
        status: 'ONLINE',
        system: 'WP Fly Fishing Trials 2026',
        edge: 'Cloudflare Edge Global Network',
        timestamp: new Date().toISOString()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Pass through to static assets (index.html, app.js, styles.css)
    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    }

    // Default response if route is unhandled
    return new Response("WP Fly Fishing Trials Edge Worker Active", {
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' }
    });
  }
};
