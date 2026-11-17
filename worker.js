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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Password',
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

    // Admin Password Verification Endpoint
    if (url.pathname === '/api/admin/verify_password' && request.method === 'POST') {
      try {
        const body = await request.json();
        const success = (body.password === "small-Blaar");
        return new Response(JSON.stringify({
          success: success,
          message: success ? "Organizer Admin authenticated." : "Invalid organizer password."
        }), {
          status: success ? 200 : 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (err) {
        return new Response(JSON.stringify({ success: false, error: "Bad Request" }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
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
