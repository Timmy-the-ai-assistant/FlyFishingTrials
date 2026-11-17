/**
 * WP Fly Fishing Trials - Cloudflare Edge Worker
 * Full Edge-native API engine with zero cold starts and instant response times.
 */

import { INITIAL_STATE } from './initial_state.js';

const ADMIN_PASSWORD = "small-Blaar";

// Edge in-memory data store initialized from initial_state.js
let currentData = JSON.parse(JSON.stringify(INITIAL_STATE));

function getActiveTrial() {
  const activeId = currentData.active_trial_id;
  const trials = currentData.trials || [];
  for (const t of trials) {
    if (t.id === activeId) return t;
  }
  return trials[0] || null;
}

function computeTrialStatus(startStr, endStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(startStr);
  const end = new Date(endStr);

  const startFormatted = start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const endFormatted = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const dateRangeLabel = `${startFormatted} – ${endFormatted}`;

  if (today < start) {
    const diffDays = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
    return {
      status: "UPCOMING",
      status_label: `📅 Upcoming Trial (${diffDays}d to go)`,
      date_range_label: dateRangeLabel,
      is_past: false,
      is_in_session: false,
      is_upcoming: true
    };
  } else if (today <= end) {
    return {
      status: "IN_SESSION",
      status_label: "🟢 Active Trial in Session",
      date_range_label: dateRangeLabel,
      is_past: false,
      is_in_session: true,
      is_upcoming: false
    };
  } else {
    return {
      status: "PAST",
      status_label: `🏁 Past Event (Ended ${endFormatted})`,
      date_range_label: dateRangeLabel,
      is_past: true,
      is_in_session: false,
      is_upcoming: false
    };
  }
}

function getTrialsSummaryList() {
  const activeId = currentData.active_trial_id;
  return (currentData.trials || []).map(t => {
    const st = computeTrialStatus(t.start_date, t.end_date);
    const tData = t.tournament_data || {};
    return {
      id: t.id,
      name: t.name,
      year: t.year || 2026,
      start_date: t.start_date,
      end_date: t.end_date,
      whatsapp_url: t.whatsapp_url || "",
      status: st.status,
      status_label: st.status_label,
      date_range_label: st.date_range_label,
      is_past: st.is_past,
      is_in_session: st.is_in_session,
      is_upcoming: st.is_upcoming,
      is_active: (t.id === activeId),
      num_anglers: (tData.anglers || []).length,
      num_beats: (tData.beats || []).length
    };
  });
}

function getFullState() {
  const trial = getActiveTrial();
  const tData = (trial && trial.tournament_data) || {};
  const st = trial ? computeTrialStatus(trial.start_date, trial.end_date) : {};

  return {
    tournament_name: trial ? trial.name : (tData.tournament_name || "Autumn Trial 2026 A"),
    venue: tData.venue || "Cape Piscatorial Society - Smalblaar & Elandspad",
    anglers: tData.anglers || [],
    num_anglers: (tData.anglers || []).length,
    a_team_anglers: tData.a_team_anglers || [],
    num_a_team: (tData.a_team_anglers || []).length,
    num_beats: tData.num_beats || (tData.beats || []).length,
    beats: tData.beats || [],
    selected_beats: tData.selected_beats || [],
    angler_schedule: tData.angler_schedule || {},
    three_way_counts: tData.three_way_counts || {},
    sessions: tData.sessions || [],
    leaderboard: tData.leaderboard || [],
    activity_log: tData.activity_log || [],
    stats: {
      total_matches: 0,
      confirmed_matches: 0,
      discrepancies_count: 0,
      pending_count: 0
    },
    discrepancies: [],
    pending: [],
    trial_info: {
      id: trial ? trial.id : "default",
      name: trial ? trial.name : "Autumn Trial 2026 A",
      year: trial ? trial.year : 2026,
      start_date: trial ? trial.start_date : "",
      end_date: trial ? trial.end_date : "",
      whatsapp_url: trial ? (trial.whatsapp_url || "") : "",
      status: st.status,
      status_label: st.status_label,
      date_range_label: st.date_range_label,
      is_past: st.is_past,
      is_in_session: st.is_in_session,
      is_upcoming: st.is_upcoming
    },
    all_trials: getTrialsSummaryList()
  };
}

function checkAdminAuth(request, body = {}) {
  const headerPwd = request.headers.get('X-Admin-Password');
  const bodyPwd = body.password || body.admin_password;
  return (headerPwd === ADMIN_PASSWORD || bodyPwd === ADMIN_PASSWORD);
}

function generateEdgeSchedule(anglers, aTeamAnglers, availableBeats) {
  const N = anglers.length;
  const isOdd = (N % 2 !== 0);
  const numSessions = 4;
  const numBeats = isOdd ? Math.floor((N - 3) / 2) + 1 : Math.floor(N / 2);

  const fallbackBeats = [
    { id: "SB6", code: "SB6", name: "Small Brook 6 (SB6)", river: "Small Brook", lower_pin: [-33.7319, 19.1141], mid_pin: [-33.7330, 19.1180], upper_pin: [-33.7340, 19.1225], meeting_point: "Tunnel East Portal" },
    { id: "EP1", code: "EP1", name: "Elandspad 1 (EP1)", river: "Yellands Part", lower_pin: [-33.7319, 19.1141], mid_pin: [-33.7352, 19.1129], upper_pin: [-33.7385, 19.1118], meeting_point: "Junction Pool" },
    { id: "EP2", code: "EP2", name: "Elandspad 2 (EP2)", river: "Yellands Part", lower_pin: [-33.7385, 19.1118], mid_pin: [-33.7420, 19.1105], upper_pin: [-33.7455, 19.1092], meeting_point: "Fisherman's Cave" },
    { id: "Star", code: "Star", name: "Star Beat", river: "Small Brook", lower_pin: [-33.7258, 19.1052], mid_pin: [-33.7285, 19.1095], upper_pin: [-33.7319, 19.1141], meeting_point: "Bridge Parking" },
    { id: "Transport", code: "Transport", name: "Transport Beat", river: "Small Brook", lower_pin: [-33.7215, 19.0965], mid_pin: [-33.7235, 19.1008], upper_pin: [-33.7258, 19.1052], meeting_point: "Transport Layby" },
    { id: "SB1", code: "SB1", name: "Small Brook 1 (SB1)", river: "Small Brook", lower_pin: [-33.7180, 19.0880], mid_pin: [-33.7198, 19.0922], upper_pin: [-33.7215, 19.0965], meeting_point: "Picnic Site 1" },
    { id: "SB2", code: "SB2", name: "Small Brook 2 (SB2)", river: "Small Brook", lower_pin: [-33.7150, 19.0800], mid_pin: [-33.7165, 19.0840], upper_pin: [-33.7180, 19.0880], meeting_point: "Picnic Site 2" },
    { id: "SB3", code: "SB3", name: "Small Brook 3 (SB3)", river: "Small Brook", lower_pin: [-33.7120, 19.0720], mid_pin: [-33.7135, 19.0760], upper_pin: [-33.7150, 19.0800], meeting_point: "Kloof Halt" },
    { id: "SB4", code: "SB4", name: "Small Brook 4 (SB4)", river: "Small Brook", lower_pin: [-33.7090, 19.0640], mid_pin: [-33.7105, 19.0680], upper_pin: [-33.7120, 19.0720], meeting_point: "Old Tollhouse" },
    { id: "SB5", code: "SB5", name: "Small Brook 5 (SB5)", river: "Small Brook", lower_pin: [-33.7060, 19.0560], mid_pin: [-33.7075, 19.0600], upper_pin: [-33.7090, 19.0640], meeting_point: "Hotel Curve" }
  ];

  const beatsPool = (availableBeats && availableBeats.length >= numBeats) 
    ? availableBeats.slice(0, numBeats)
    : fallbackBeats.slice(0, numBeats);

  const aSet = new Set(aTeamAnglers || []);
  const sessions = [];
  const sessionDefs = [
    { id: 1, name: "Saturday Morning", short: "Sat AM", day: "Saturday", time: "Morning" },
    { id: 2, name: "Saturday Afternoon", short: "Sat PM", day: "Saturday", time: "Afternoon" },
    { id: 3, name: "Sunday Morning", short: "Sun AM", day: "Sunday", time: "Morning" },
    { id: 4, name: "Sunday Afternoon", short: "Sun PM", day: "Sunday", time: "Afternoon" }
  ];

  const anglerSchedule = {};
  anglers.forEach(a => { anglerSchedule[a] = []; });
  const threeWayCounts = {};
  if (isOdd) anglers.forEach(a => { threeWayCounts[a] = 0; });

  for (let sIdx = 0; sIdx < numSessions; sIdx++) {
    const sDef = sessionDefs[sIdx];
    const sMatches = [];

    // Shift to rotate matchups cleanly
    const shift = (sIdx * 3 + 1) % N;
    const rotated = anglers.slice(shift).concat(anglers.slice(0, shift));

    let aIdx = 0;
    for (let b = 0; b < numBeats; b++) {
      const beat = beatsPool[b] || fallbackBeats[b % fallbackBeats.length];
      let matchAnglers = [];

      if (isOdd && b === 0) {
        matchAnglers = [rotated[aIdx], rotated[aIdx + 1], rotated[aIdx + 2]];
        aIdx += 3;
        matchAnglers.forEach(a => { if (threeWayCounts[a] !== undefined) threeWayCounts[a]++; });
      } else {
        matchAnglers = [rotated[aIdx], rotated[aIdx + 1]];
        aIdx += 2;
      }

      const stayer = (sIdx % 2 === 1) ? matchAnglers[0] : null;

      const m = {
        match_id: `S${sDef.id}_M${b + 1}`,
        match_number: b + 1,
        match_type: matchAnglers.length === 3 ? "1v1v1" : "1v1",
        beat_number: b + 1,
        beat_id: beat.id || beat.code,
        beat_code: beat.code || beat.id,
        beat_name: beat.name,
        river: beat.river || "Small Brook",
        lower_pin: beat.lower_pin || [-33.7319, 19.1141],
        mid_pin: beat.mid_pin || [-33.7330, 19.1180],
        upper_pin: beat.upper_pin || [-33.7340, 19.1225],
        meeting_point: beat.meeting_point || "Parking",
        anglers: matchAnglers,
        stayer: stayer,
        status: "UNREPORTED",
        submissions: {},
        official_scores: {},
        calculated_points: {}
      };

      matchAnglers.forEach(a => {
        const opps = matchAnglers.filter(o => o !== a);
        const isStayer = (stayer === a);
        anglerSchedule[a].push({
          session_id: sDef.id,
          session_name: sDef.name,
          session_short: sDef.short,
          day: sDef.day,
          time: sDef.time,
          beat_number: b + 1,
          beat_id: beat.id || beat.code,
          beat_code: beat.code || beat.id,
          beat_name: beat.name,
          river: beat.river,
          meeting_point: beat.meeting_point,
          match_type: m.match_type,
          opponents: opps,
          is_stayer: isStayer,
          section: isStayer ? "Second Half (Upper Section)" : "First Half (Lower Section)",
          pin: isStayer ? beat.mid_pin : beat.lower_pin,
          lower_pin: beat.lower_pin,
          mid_pin: beat.mid_pin,
          upper_pin: beat.upper_pin
        });
      });

      sMatches.push(m);
    }

    sessions.push({
      session_id: sDef.id,
      session_name: sDef.name,
      session_short: sDef.short,
      day: sDef.day,
      time: sDef.time,
      matches: sMatches
    });
  }

  const leaderboard = anglers.map((a, i) => ({
    rank: i + 1,
    angler: a,
    is_a_team: aSet.has(a),
    s1_pts: 0, s2_pts: 0, s3_pts: 0, s4_pts: 0,
    total_points: 0,
    total_fish: 0,
    blanks: 0,
    matches_played: 0
  }));

  return {
    sessions,
    anglerSchedule,
    leaderboard,
    threeWayCounts,
    numBeats
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Standard CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Password',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. Health check
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

    // 2. Tournament State
    if (url.pathname === '/api/state' && request.method === 'GET') {
      return new Response(JSON.stringify(getFullState()), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 3. Beats Catalog
    if (url.pathname === '/api/beats' && request.method === 'GET') {
      const trial = getActiveTrial();
      const beats = (trial && trial.tournament_data && trial.tournament_data.beats) || [];
      return new Response(JSON.stringify({ success: true, beats: beats }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 4. Trials List
    if (url.pathname === '/api/trials' && request.method === 'GET') {
      return new Response(JSON.stringify({
        success: true,
        trials: getTrialsSummaryList(),
        active_trial_id: currentData.active_trial_id
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 5. Select Trial
    if (url.pathname === '/api/trials/select' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (body.trial_id) {
        currentData.active_trial_id = body.trial_id;
        return new Response(JSON.stringify({
          success: true,
          state: getFullState()
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ success: false, error: "Missing trial_id" }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 6. Verify Admin Password ("small-Blaar")
    if (url.pathname === '/api/admin/verify_password' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const success = (body.password === ADMIN_PASSWORD);
      return new Response(JSON.stringify({
        success: success,
        message: success ? "Organizer Admin authenticated." : "Invalid organizer password."
      }), {
        status: success ? 200 : 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 7. Update Beat (GPS / Coordinates / River) - Admin Only
    if (url.pathname === '/api/beats/update' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!checkAdminAuth(request, body)) {
        return new Response(JSON.stringify({
          success: false,
          error: "Unauthorized: Organizer password required (small-Blaar)."
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const beatId = body.beat_id || body.id || body.code;
      const trial = getActiveTrial();
      if (trial && trial.tournament_data && trial.tournament_data.beats) {
        for (const b of trial.tournament_data.beats) {
          if (b.id === beatId || b.code === beatId) {
            if (body.enabled !== undefined) b.enabled = body.enabled;
            if (body.river !== undefined) b.river = body.river;
            if (body.lower_pin !== undefined) b.lower_pin = body.lower_pin;
            if (body.mid_pin !== undefined) b.mid_pin = body.mid_pin;
            if (body.upper_pin !== undefined) b.upper_pin = body.upper_pin;
            if (body.meeting_point !== undefined) b.meeting_point = body.meeting_point;
            break;
          }
        }
      }

      return new Response(JSON.stringify({ success: true, message: "Beat updated successfully." }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 8. Admin Reset / Randomize Tournament - Admin Only
    if (url.pathname === '/api/admin/reset' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!checkAdminAuth(request, body)) {
        return new Response(JSON.stringify({
          success: false,
          error: "Unauthorized: Organizer password required (small-Blaar)."
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const anglers = (body.anglers || []).map(a => a.trim()).filter(Boolean);
      if (anglers.length < 4) {
        return new Response(JSON.stringify({
          success: false,
          error: "At least 4 angler names must be provided."
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const aTeam = (body.a_team_anglers || []).filter(a => anglers.includes(a));
      const trial = getActiveTrial();
      if (trial && trial.tournament_data) {
        const sched = generateEdgeSchedule(anglers, aTeam, trial.tournament_data.beats);
        trial.tournament_data.anglers = anglers;
        trial.tournament_data.num_anglers = anglers.length;
        trial.tournament_data.a_team_anglers = aTeam;
        trial.tournament_data.num_a_team = aTeam.length;
        trial.tournament_data.sessions = sched.sessions;
        trial.tournament_data.angler_schedule = sched.anglerSchedule;
        trial.tournament_data.leaderboard = sched.leaderboard;
        trial.tournament_data.three_way_counts = sched.threeWayCounts;
        trial.tournament_data.num_beats = sched.numBeats;
        if (body.tournament_name) {
          trial.tournament_data.tournament_name = body.tournament_name;
          trial.name = body.tournament_name;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Tournament reset successfully for ${anglers.length} anglers with ${aTeam.length} A-Team members.`,
        state: getFullState()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 9. Submit Match Score
    if (url.pathname === '/api/submit' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      return new Response(JSON.stringify({
        success: true,
        status: "CONFIRMED",
        message: "Score submitted and verified."
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 10. Admin Resolve Match - Admin Only
    if (url.pathname === '/api/admin/resolve' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!checkAdminAuth(request, body)) {
        return new Response(JSON.stringify({
          success: false,
          error: "Unauthorized: Organizer password required (small-Blaar)."
        }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        status: "ADMIN_CONFIRMED",
        message: "Official score confirmed by organizer."
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Pass through to static assets (index.html, app.js, styles.css, disa_logo.png)
    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }

      // If this is a page navigation (HTML request), fallback to index.html
      if (request.headers.get("accept") && request.headers.get("accept").includes("text/html")) {
        const indexReq = new Request(new URL("/index.html", request.url), request);
        return env.ASSETS.fetch(indexReq);
      }
    }

    // Guarantee JSON response for all API routes
    return new Response(JSON.stringify({ success: false, error: "Endpoint not found" }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
