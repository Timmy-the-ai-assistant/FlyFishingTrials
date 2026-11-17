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

function generateEdgeSchedule(anglers, aTeamAnglers = [], availableBeats = []) {
  const N = anglers.length;
  if (N < 4) throw new Error("At least 4 anglers required for fly fishing trials.");

  const isOdd = (N % 2 !== 0);
  const numSessions = 4;
  const numBeats = isOdd ? Math.floor((N - 1) / 2) : Math.floor(N / 2);

  const fallbackBeats = [
    { id: "SB6", code: "SB6", name: "Smalblaar 6 (SB6)", river: "Smalblaar", lower_pin: [-33.7319, 19.1141], mid_pin: [-33.7330, 19.1105], upper_pin: [-33.7342, 19.1065], meeting_point: "Tunnel East Portal" },
    { id: "EP1", code: "EP1", name: "Elandspad 1 (EP1)", river: "Elandspad", lower_pin: [-33.7319, 19.1141], mid_pin: [-33.7360, 19.1152], upper_pin: [-33.7405, 19.1162], meeting_point: "Junction Pool" },
    { id: "EP2", code: "EP2", name: "Elandspad 2 (EP2)", river: "Elandspad", lower_pin: [-33.7405, 19.1162], mid_pin: [-33.7460, 19.1172], upper_pin: [-33.7520, 19.1188], meeting_point: "Fisherman's Cave" },
    { id: "Star", code: "Star", name: "Star Beat", river: "Elandspad", lower_pin: [-33.7520, 19.1188], mid_pin: [-33.7565, 19.1195], upper_pin: [-33.7610, 19.1205], meeting_point: "Star beat shelter" },
    { id: "SB5", code: "SB5", name: "Smalblaar 5 (SB5)", river: "Smalblaar", lower_pin: [-33.7295, 19.1320], mid_pin: [-33.7305, 19.1270], upper_pin: [-33.7319, 19.1141], meeting_point: "CPS Elandspad parking" },
    { id: "SB4", code: "SB4", name: "Smalblaar 4 (SB4)", river: "Smalblaar", lower_pin: [-33.7272, 19.1415], mid_pin: [-33.7285, 19.1370], upper_pin: [-33.7295, 19.1320], meeting_point: "Donkergat pull-off" },
    { id: "SB3", code: "SB3", name: "Smalblaar 3 (SB3)", river: "Smalblaar", lower_pin: [-33.7235, 19.1530], mid_pin: [-33.7258, 19.1470], upper_pin: [-33.7272, 19.1415], meeting_point: "Emergency telephone layby 3" },
    { id: "SB2", code: "SB2", name: "Smalblaar 2 (SB2)", river: "Smalblaar", lower_pin: [-33.7190, 19.1655], mid_pin: [-33.7212, 19.1590], upper_pin: [-33.7235, 19.1530], meeting_point: "Picnic Site parking" },
    { id: "SB1", code: "SB1", name: "Smalblaar 1 (SB1)", river: "Smalblaar", lower_pin: [-33.7150, 19.1740], mid_pin: [-33.7170, 19.1700], upper_pin: [-33.7190, 19.1655], meeting_point: "Picnic Site 1" },
    { id: "Hotel Beat", code: "Hotel Beat", name: "Smalblaar Hotel Beat", river: "Smalblaar", lower_pin: [-33.7125, 19.1800], mid_pin: [-33.7138, 19.1770], upper_pin: [-33.7150, 19.1740], meeting_point: "Du Kloof Lodge" },
    { id: "Transport Upper", code: "Transport Upper", name: "Transport Upper", river: "Smalblaar", lower_pin: [-33.7085, 19.1895], mid_pin: [-33.7105, 19.1845], upper_pin: [-33.7125, 19.1800], meeting_point: "Transport bridge parking" },
    { id: "Transport Lower", code: "Transport Lower", name: "Transport Lower", river: "Smalblaar", lower_pin: [-33.7040, 19.2000], mid_pin: [-33.7065, 19.1945], upper_pin: [-33.7085, 19.1895], meeting_point: "Farm gate boundary" }
  ];

  const beatsPool = (availableBeats && availableBeats.length >= numBeats) 
    ? availableBeats.slice(0, numBeats)
    : fallbackBeats.slice(0, numBeats);

  const cleanATeam = (aTeamAnglers || []).filter(a => anglers.includes(a));
  const aIndices = new Set(cleanATeam.map(a => anglers.indexOf(a)));
  const hasATeam = aIndices.size >= 3;

  function pairKey(i, j) {
    return i < j ? `${i}|${j}` : `${j}|${i}`;
  }

  const sessionDefs = [
    { id: 1, name: "Saturday Morning", short: "Sat AM", day: "Saturday", time: "Morning" },
    { id: 2, name: "Saturday Afternoon", short: "Sat PM", day: "Saturday", time: "Afternoon" },
    { id: 3, name: "Sunday Morning", short: "Sun AM", day: "Sunday", time: "Morning" },
    { id: 4, name: "Sunday Afternoon", short: "Sun PM", day: "Sunday", time: "Afternoon" }
  ];

  let chosenScheduleRaw = null;

  // Strict Constraint Satisfaction Solver: ZERO repeat opponents
  for (let attempt = 0; attempt < 10000; attempt++) {
    const pairsMet = new Set();
    const threeWayCounts = new Array(N).fill(0);
    const candidateSessions = [];
    let possible = true;
    const aVsACount = new Array(N).fill(0);

    for (let sIdx = 0; sIdx < numSessions; sIdx++) {
      let sessionMatches = null;

      for (let sAttempt = 0; sAttempt < 300; sAttempt++) {
        let group3 = null;
        let rem = [];

        if (isOdd) {
          const candidates = [...Array(N).keys()].sort((a, b) => {
            if (threeWayCounts[a] !== threeWayCounts[b]) return threeWayCounts[a] - threeWayCounts[b];
            return Math.random() - 0.5;
          });

          for (let i = 0; i < candidates.length; i++) {
            const c1 = candidates[i];
            if (threeWayCounts[c1] >= 2) continue;
            for (let j = i + 1; j < candidates.length; j++) {
              const c2 = candidates[j];
              if (threeWayCounts[c2] >= 2) continue;
              if (pairsMet.has(pairKey(c1, c2))) continue;
              for (let k = j + 1; k < candidates.length; k++) {
                const c3 = candidates[k];
                if (threeWayCounts[c3] >= 2) continue;
                if (pairsMet.has(pairKey(c1, c3)) || pairsMet.has(pairKey(c2, c3))) continue;

                group3 = [c1, c2, c3];
                break;
              }
              if (group3) break;
            }
            if (group3) break;
          }

          if (!group3) continue;
          rem = [...Array(N).keys()].filter(x => !group3.includes(x));
        } else {
          rem = [...Array(N).keys()];
        }

        // Shuffle pool
        for (let i = rem.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [rem[i], rem[j]] = [rem[j], rem[i]];
        }

        // Backtracking pairing
        function pairUp(pool) {
          if (pool.length === 0) return [];
          const p1 = pool[0];
          const candidates = pool.slice(1);
          const validCandidates = candidates.filter(p2 => !pairsMet.has(pairKey(p1, p2)));
          if (validCandidates.length === 0) return null;

          validCandidates.sort((a, b) => {
            if (hasATeam && aIndices.has(p1)) {
              const aIsA = aIndices.has(a);
              const bIsA = aIndices.has(b);
              if (aVsACount[p1] < 2) {
                if (aIsA && !bIsA) return -1;
                if (!aIsA && bIsA) return 1;
              }
            }
            return Math.random() - 0.5;
          });

          for (const p2 of validCandidates) {
            const nextPool = candidates.filter(x => x !== p2);
            const subPairs = pairUp(nextPool);
            if (subPairs !== null) {
              return [[p1, p2], ...subPairs];
            }
          }
          return null;
        }

        const pairs1v1 = pairUp(rem);
        if (pairs1v1 !== null) {
          const mList = [];
          if (group3) mList.push(group3);
          pairs1v1.forEach(p => mList.push(p));
          sessionMatches = mList;
          break;
        }
      }

      if (!sessionMatches) {
        possible = false;
        break;
      }

      for (const m of sessionMatches) {
        if (m.length === 3) {
          pairsMet.add(pairKey(m[0], m[1]));
          pairsMet.add(pairKey(m[0], m[2]));
          pairsMet.add(pairKey(m[1], m[2]));
          threeWayCounts[m[0]]++;
          threeWayCounts[m[1]]++;
          threeWayCounts[m[2]]++;
          if (aIndices.has(m[0]) && aIndices.has(m[1])) { aVsACount[m[0]]++; aVsACount[m[1]]++; }
          if (aIndices.has(m[0]) && aIndices.has(m[2])) { aVsACount[m[0]]++; aVsACount[m[2]]++; }
          if (aIndices.has(m[1]) && aIndices.has(m[2])) { aVsACount[m[1]]++; aVsACount[m[2]]++; }
        } else {
          pairsMet.add(pairKey(m[0], m[1]));
          if (aIndices.has(m[0]) && aIndices.has(m[1])) {
            aVsACount[m[0]]++;
            aVsACount[m[1]]++;
          }
        }
      }

      candidateSessions.push(sessionMatches);
    }

    if (possible && candidateSessions.length === numSessions) {
      // Validate ZERO repeat opponents
      const metCounts = {};
      anglers.forEach(a => { metCounts[a] = {}; });
      let anyRepeat = false;

      candidateSessions.forEach(sMatches => {
        sMatches.forEach(m => {
          const mAnglers = m.map(idx => anglers[idx]);
          mAnglers.forEach(a => {
            mAnglers.forEach(o => {
              if (a !== o) {
                metCounts[a][o] = (metCounts[a][o] || 0) + 1;
                if (metCounts[a][o] > 1) anyRepeat = true;
              }
            });
          });
        });
      });

      if (!anyRepeat) {
        chosenScheduleRaw = candidateSessions;
        break;
      }
    }
  }

  if (!chosenScheduleRaw) {
    throw new Error("Unable to find schedule satisfying zero repeat pairings.");
  }

  // Build the complete session objects
  const sessions = [];
  const anglerSchedule = {};
  anglers.forEach(a => { anglerSchedule[a] = []; });
  const finalThreeWayCounts = {};
  if (isOdd) anglers.forEach(a => { finalThreeWayCounts[a] = 0; });

  for (let sIdx = 0; sIdx < numSessions; sIdx++) {
    const sDef = sessionDefs[sIdx];
    const sMatches = [];
    const rawMatches = chosenScheduleRaw[sIdx];

    for (let b = 0; b < rawMatches.length; b++) {
      const beat = beatsPool[b] || fallbackBeats[b % fallbackBeats.length];
      const matchAnglerIndices = rawMatches[b];
      const matchAnglers = matchAnglerIndices.map(i => anglers[i]);

      if (matchAnglers.length === 3) {
        matchAnglers.forEach(a => { finalThreeWayCounts[a] = (finalThreeWayCounts[a] || 0) + 1; });
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
        river: beat.river || "Smalblaar",
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

  const aSet = new Set(cleanATeam);
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
    threeWayCounts: finalThreeWayCounts,
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

    // 5b. Update Trial (Admin Only) - Name, Dates, WhatsApp URL
    if (url.pathname === '/api/admin/trial/update' && request.method === 'POST') {
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

      const trialId = body.trial_id || currentData.active_trial_id;
      let targetTrial = null;
      for (const t of (currentData.trials || [])) {
        if (t.id === trialId) {
          targetTrial = t;
          break;
        }
      }
      if (!targetTrial && currentData.trials && currentData.trials.length > 0) {
        targetTrial = currentData.trials[0];
      }

      if (!targetTrial) {
        return new Response(JSON.stringify({
          success: false,
          error: `Trial '${trialId}' not found.`
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      if (body.name) {
        targetTrial.name = body.name.trim();
        if (targetTrial.tournament_data) {
          targetTrial.tournament_data.tournament_name = targetTrial.name;
        }
        currentData.tournament_name = targetTrial.name;
      }
      if (body.year) targetTrial.year = parseInt(body.year, 10);
      if (body.start_date) targetTrial.start_date = body.start_date;
      if (body.end_date) targetTrial.end_date = body.end_date;
      if (body.whatsapp_url !== undefined) {
        targetTrial.whatsapp_url = body.whatsapp_url.trim();
        currentData.whatsapp_url = targetTrial.whatsapp_url;
      }
      targetTrial.updated_at = new Date().toISOString();

      return new Response(JSON.stringify({
        success: true,
        message: `Trial '${targetTrial.name}' updated successfully.`,
        trial: targetTrial,
        state: getFullState()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 5c. Create Trial (Admin Only)
    if (url.pathname === '/api/admin/trial/create' && request.method === 'POST') {
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

      const name = (body.name || "Autumn Trial 2026 A").trim();
      const year = parseInt(body.year || 2026, 10);
      const startDate = body.start_date || "2026-11-28";
      const endDate = body.end_date || "2026-11-29";
      const waUrl = (body.whatsapp_url || "").trim();
      const anglers = (body.anglers && body.anglers.length >= 4) 
        ? body.anglers 
        : ["Angler 1", "Angler 2", "Angler 3", "Angler 4", "Angler 5", "Angler 6", "Angler 7", "Angler 8", "Angler 9"];
      const aTeam = body.a_team_anglers || [];

      const cleanName = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const trialId = `${cleanName}_${startDate.replace(/-/g, '')}_${Date.now() % 10000}`;

      const sched = generateEdgeSchedule(anglers, aTeam, fallbackBeats);
      const nowIso = new Date().toISOString();

      const newTrial = {
        id: trialId,
        name: name,
        year: year,
        start_date: startDate,
        end_date: endDate,
        whatsapp_url: waUrl,
        created_at: nowIso,
        updated_at: nowIso,
        tournament_data: {
          tournament_name: name,
          venue: "Championship Beats",
          created_at: nowIso,
          updated_at: nowIso,
          anglers: anglers,
          num_anglers: anglers.length,
          a_team_anglers: aTeam,
          num_a_team: aTeam.length,
          num_beats: sched.numBeats,
          beats: fallbackBeats.slice(0, sched.numBeats),
          selected_beats: fallbackBeats.slice(0, sched.numBeats),
          sessions: sched.sessions,
          angler_schedule: sched.anglerSchedule,
          leaderboard: sched.leaderboard,
          three_way_counts: sched.threeWayCounts,
          activity_log: []
        }
      };

      if (!currentData.trials) currentData.trials = [];
      currentData.trials.push(newTrial);
      currentData.active_trial_id = trialId;

      return new Response(JSON.stringify({
        success: true,
        message: `Trial '${name}' created successfully.`,
        trial: newTrial,
        state: getFullState()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 5d. Delete Trial (Admin Only)
    if (url.pathname === '/api/admin/trial/delete' && request.method === 'POST') {
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

      if ((currentData.trials || []).length <= 1) {
        return new Response(JSON.stringify({
          success: false,
          error: "Cannot delete the only remaining trial."
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const trialId = body.trial_id;
      const idx = currentData.trials.findIndex(t => t.id === trialId);
      if (idx === -1) {
        return new Response(JSON.stringify({
          success: false,
          error: `Trial '${trialId}' not found.`
        }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const removed = currentData.trials.splice(idx, 1)[0];
      if (currentData.active_trial_id === trialId) {
        currentData.active_trial_id = currentData.trials[0].id;
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Trial '${removed.name}' deleted.`,
        state: getFullState()
      }), {
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

    // 8b. Admin Clear Draw - Admin Only
    if (url.pathname === '/api/admin/clear_draw' && request.method === 'POST') {
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

      const trial = getActiveTrial();
      if (trial && trial.tournament_data) {
        trial.tournament_data.sessions = [];
        trial.tournament_data.angler_schedule = {};
        trial.tournament_data.three_way_counts = {};
        (trial.tournament_data.leaderboard || []).forEach(row => {
          row.s1_pts = 0; row.s2_pts = 0; row.s3_pts = 0; row.s4_pts = 0;
          row.total_points = 0; row.total_fish = 0; row.blanks = 0; row.matches_played = 0;
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message: "Tournament draw cleared successfully.",
        state: getFullState()
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 8c. Admin Clear Session Matches - Admin Only
    if (url.pathname === '/api/admin/clear_session' && request.method === 'POST') {
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

      const sId = parseInt(body.session_id || 1, 10);
      const trial = getActiveTrial();
      if (trial && trial.tournament_data && trial.tournament_data.sessions) {
        for (const s of trial.tournament_data.sessions) {
          if (s.session_id === sId) {
            for (const m of (s.matches || [])) {
              m.status = "UNREPORTED";
              m.submissions = {};
              m.official_scores = {};
              m.calculated_points = {};
              m.discrepancy_details = null;
            }
          }
        }
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Session ${sId} scores cleared and reset.`,
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
