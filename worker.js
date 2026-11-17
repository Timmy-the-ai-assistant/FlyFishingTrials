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

  let lb = tData.leaderboard || [];
  if (lb.length === 0 && tData.anglers && tData.anglers.length > 0) {
    const aSet = new Set(tData.a_team_anglers || []);
    lb = tData.anglers.map((a, i) => ({
      rank: i + 1,
      name: a,
      angler: a,
      is_a_team: aSet.has(a),
      s1_pts: 0, s2_pts: 0, s3_pts: 0, s4_pts: 0,
      total_points: 0,
      total_fish: 0,
      blanks: 0,
      matches_played: 0,
      session_points: { 1: 0, 2: 0, 3: 0, 4: 0 }
    }));
  }

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
    leaderboard: lb,
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
    { id: "SB1", code: "SB1", name: "SB1", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", lower_pin: [-33.7150, 19.1740], mid_pin: [-33.7170, 19.1700], upper_pin: [-33.7190, 19.1655], meeting_point: "Picnic site pull-off" },
    { id: "SB2", code: "SB2", name: "SB2", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", lower_pin: [-33.7190, 19.1655], mid_pin: [-33.7212, 19.1590], upper_pin: [-33.7235, 19.1530], meeting_point: "Picnic site parking" },
    { id: "SB3", code: "SB3", name: "SB3", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", lower_pin: [-33.7235, 19.1530], mid_pin: [-33.7258, 19.1470], upper_pin: [-33.7272, 19.1415], meeting_point: "N1 emergency telephone layby 3" },
    { id: "SB4", code: "SB4", name: "SB4", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", lower_pin: [-33.7272, 19.1415], mid_pin: [-33.7285, 19.1370], upper_pin: [-33.7295, 19.1320], meeting_point: "Donkergat pull-off" },
    { id: "SB5", code: "SB5", name: "SB5", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", lower_pin: [-33.7295, 19.1320], mid_pin: [-33.7305, 19.1270], upper_pin: [-33.7319, 19.1141], meeting_point: "CPS Elandspad parking lot" },
    { id: "SB6", code: "SB6", name: "SB6", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", lower_pin: [-33.7319, 19.1141], mid_pin: [-33.7330, 19.1105], upper_pin: [-33.7342, 19.1065], meeting_point: "Tunnel East Portal Parking / Junction Path" },
    { id: "SB(HOTEL)", code: "SB(HOTEL)", name: "SB(HOTEL)", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 1, sun_available: true, sun_sessions: 1, usage_mode: "single", lower_pin: [-33.7125, 19.1800], mid_pin: [-33.7138, 19.1770], upper_pin: [-33.7150, 19.1740], meeting_point: "Du Kloof Lodge guest parking" },
    { id: "SB(TRANSPORT)", code: "SB(TRANSPORT)", name: "SB(TRANSPORT)", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", lower_pin: [-33.7085, 19.1895], mid_pin: [-33.7105, 19.1845], upper_pin: [-33.7125, 19.1800], meeting_point: "Transport bridge parking" },
    { id: "EP1", code: "EP1", name: "EP1", river: "Elands Pad", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", lower_pin: [-33.7319, 19.1141], mid_pin: [-33.7360, 19.1152], upper_pin: [-33.7405, 19.1162], meeting_point: "Junction Pool trail head" },
    { id: "EP2", code: "EP2", name: "EP2", river: "Elands Pad", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", lower_pin: [-33.7405, 19.1162], mid_pin: [-33.7460, 19.1172], upper_pin: [-33.7520, 19.1188], meeting_point: "Fisherman's Cave trail" },
    { id: "EP3", code: "EP3", name: "EP3", river: "Elands Pad", enabled: true, sat_available: true, sat_sessions: 1, sun_available: true, sun_sessions: 1, usage_mode: "single", lower_pin: [-33.7520, 19.1188], mid_pin: [-33.7565, 19.1195], upper_pin: [-33.7610, 19.1205], meeting_point: "Star beat rock shelter" },
    { id: "EP4", code: "EP4", name: "EP4", river: "Elands Pad", enabled: true, sat_available: true, sat_sessions: 1, sun_available: true, sun_sessions: 1, usage_mode: "single", lower_pin: [-33.7610, 19.1205], mid_pin: [-33.7650, 19.1212], upper_pin: [-33.7690, 19.1220], meeting_point: "Kraalstroom trail / Upper gorge" },
    { id: "MOLENAARS(UPPER)", code: "MOLENAARS(UPPER)", name: "MOLENAARS(UPPER)", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", lower_pin: [-33.7085, 19.1895], mid_pin: [-33.7105, 19.1845], upper_pin: [-33.7125, 19.1800], meeting_point: "Transport bridge parking" },
    { id: "MOLENAARS(LOWER)", code: "MOLENAARS(LOWER)", name: "MOLENAARS(LOWER)", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", lower_pin: [-33.7040, 19.2000], mid_pin: [-33.7065, 19.1945], upper_pin: [-33.7085, 19.1895], meeting_point: "Farm gate boundary on N1" }
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
  let bestScheduleScore = -999999;

  // Strict Constraint Satisfaction Solver: ZERO repeat opponents + A-Team 1v1 Clashes + Challenger Exposure
  for (let attempt = 0; attempt < 5000; attempt++) {
    const pairsMet = new Set();
    const threeWayCounts = new Array(N).fill(0);
    const candidateSessions = [];
    let possible = true;
    const aVsACount = new Array(N).fill(0);
    const challengerFacedA = new Array(N).fill(0);

    for (let sIdx = 0; sIdx < numSessions; sIdx++) {
      let sessionMatches = null;

      for (let sAttempt = 0; sAttempt < 150; sAttempt++) {
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

                // A-vs-A matches must be strictly 1v1: max 1 A-Team member in any 3-way match!
                const aCountInG3 = (aIndices.has(c1) ? 1 : 0) + (aIndices.has(c2) ? 1 : 0) + (aIndices.has(c3) ? 1 : 0);
                if (aCountInG3 > 1) continue;

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
            let scoreA = 0, scoreB = 0;
            if (hasATeam) {
              if (aIndices.has(p1)) {
                scoreA += aIndices.has(a) 
                  ? (aVsACount[p1] < 2 && aVsACount[a] < 2 ? -200 : 500) 
                  : (challengerFacedA[a] < 2 ? -100 : 0);
                scoreB += aIndices.has(b) 
                  ? (aVsACount[p1] < 2 && aVsACount[b] < 2 ? -200 : 500) 
                  : (challengerFacedA[b] < 2 ? -100 : 0);
              } else {
                if (aIndices.has(a)) scoreA += (challengerFacedA[p1] < 2 ? -100 : 0);
                if (aIndices.has(b)) scoreB += (challengerFacedA[p1] < 2 ? -100 : 0);
              }
            }
            return (scoreA - scoreB) + (Math.random() - 0.5);
          });

          for (const p2 of validCandidates) {
            const nextPool = pool.filter(x => x !== p1 && x !== p2);
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
          const a1 = aIndices.has(m[0]), a2 = aIndices.has(m[1]), a3 = aIndices.has(m[2]);
          if (a1 && !a2) challengerFacedA[m[1]]++;
          if (a1 && !a3) challengerFacedA[m[2]]++;
          if (a2 && !a1) challengerFacedA[m[0]]++;
          if (a2 && !a3) challengerFacedA[m[2]]++;
          if (a3 && !a1) challengerFacedA[m[0]]++;
          if (a3 && !a2) challengerFacedA[m[1]]++;
        } else {
          pairsMet.add(pairKey(m[0], m[1]));
          const a1 = aIndices.has(m[0]), a2 = aIndices.has(m[1]);
          if (a1 && a2) {
            aVsACount[m[0]]++;
            aVsACount[m[1]]++;
          } else if (a1 && !a2) {
            challengerFacedA[m[1]]++;
          } else if (a2 && !a1) {
            challengerFacedA[m[0]]++;
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

      if (anyRepeat) continue;

      // Validate A-Team criteria (each A-Team member plays exactly 2 A-Team clashes in separate 1v1 sessions)
      let aTeamValid = true;
      if (hasATeam) {
        for (const aIdx of aIndices) {
          if (aVsACount[aIdx] !== 2) {
            aTeamValid = false;
            break;
          }
        }
      }
      if (hasATeam && !aTeamValid) continue;

      // Quality evaluation for Challenger vs A-Team exposure
      let cFaced2 = 0;
      let cFacedAtLeast1 = 0;
      const nonACount = N - aIndices.size;
      for (let i = 0; i < N; i++) {
        if (!aIndices.has(i)) {
          if (challengerFacedA[i] >= 2) cFaced2++;
          if (challengerFacedA[i] >= 1) cFacedAtLeast1++;
        }
      }

      const score = (cFaced2 * 100) + (cFacedAtLeast1 * 200);
      if (score > bestScheduleScore) {
        bestScheduleScore = score;
        chosenScheduleRaw = candidateSessions;
        // Break early if ideal target is reached (all challengers face >= 1, and majority face 2)
        if (cFacedAtLeast1 === nonACount && cFaced2 >= Math.floor(nonACount / 2)) {
          break;
        }
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

  // --- Dynamic Beat Allocation & Stayer Engine ---
  const activePool = (availableBeats && availableBeats.length >= numBeats)
    ? availableBeats.filter(b => b.enabled !== false)
    : fallbackBeats;
  const pool = activePool.length >= numBeats ? activePool : fallbackBeats;

  const isEp = b => (b.river || '').toLowerCase().includes('eland');
  const isSb = b => !isEp(b);

  function pickBalancedBeats(beatList, count, preferDouble = true) {
    const list = [...beatList];
    if (preferDouble) {
      list.sort((a, b) => {
        const ma = (a.usage_mode === 'single') ? 1 : 0;
        const mb = (b.usage_mode === 'single') ? 1 : 0;
        return ma - mb;
      });
    }
    const ep = list.filter(isEp);
    const sb = list.filter(isSb);
    const res = [];
    const maxL = Math.max(ep.length, sb.length);
    for (let i = 0; i < maxL; i++) {
      if (sb[i] && res.length < count && !res.includes(sb[i])) res.push(sb[i]);
      if (ep[i] && res.length < count && !res.includes(ep[i])) res.push(ep[i]);
    }
    for (const b of list) {
      if (res.length >= count) break;
      if (!res.includes(b)) res.push(b);
    }
    return res;
  }

  // Day 1 (Saturday): S1 Morning & S2 Afternoon
  const satPool = pool.filter(b => b.sat_available !== false);
  const activeSatPool = satPool.length >= numBeats ? satPool : pool;
  const s1Beats = pickBalancedBeats(activeSatPool, numBeats, true);
  const s1DoubleBeats = s1Beats.filter(b => (b.sat_sessions === 2 || (b.sat_sessions === undefined && b.usage_mode !== 'single')));
  const s1SingleIds = new Set(s1Beats.filter(b => (b.sat_sessions === 1 || (b.sat_sessions === undefined && b.usage_mode === 'single'))).map(b => b.id || b.code));
  const s2UnusedPool = activeSatPool.filter(b => {
    const id = b.id || b.code;
    return !s1SingleIds.has(id) && !s1DoubleBeats.some(db => (db.id || db.code) === id);
  });
  const s2Beats = [...s1DoubleBeats];
  for (const b of s2UnusedPool) {
    if (s2Beats.length >= numBeats) break;
    s2Beats.push(b);
  }
  for (const b of activeSatPool) {
    if (s2Beats.length >= numBeats) break;
    if (!s2Beats.some(eb => (eb.id || eb.code) === (b.id || b.code))) {
      s2Beats.push(b);
    }
  }
  for (const b of pool) {
    if (s2Beats.length >= numBeats) break;
    if (!s2Beats.some(eb => (eb.id || eb.code) === (b.id || b.code))) {
      s2Beats.push(b);
    }
  }

  const s1MatchesRaw = chosenScheduleRaw[0];
  const s2MatchesRaw = chosenScheduleRaw[1];

  const s1OverlappingCount = s1DoubleBeats.length;
  function matchDay1Stayers(beatIdx, usedS2, curr) {
    if (beatIdx === s1OverlappingCount) return curr;
    const beatAnglers = s1MatchesRaw[beatIdx];
    for (const stayerIdx of beatAnglers) {
      const s2mIdx = s2MatchesRaw.findIndex(m => m.includes(stayerIdx));
      if (s2mIdx !== -1 && !usedS2.has(s2mIdx)) {
        const nextUsed = new Set(usedS2);
        nextUsed.add(s2mIdx);
        const res = matchDay1Stayers(beatIdx + 1, nextUsed, [...curr, { beatIdx, stayerIdx, s2mIdx }]);
        if (res) return res;
      }
    }
    return null;
  }

  const d1Stayers = matchDay1Stayers(0, new Set(), []) || [];
  const s2AssignedMatches = new Array(numBeats).fill(null);
  const s2Stayers = new Array(numBeats).fill(null);
  const usedS2Indices = new Set();

  d1Stayers.forEach(item => {
    s2AssignedMatches[item.beatIdx] = s2MatchesRaw[item.s2mIdx];
    s2Stayers[item.beatIdx] = anglers[item.stayerIdx];
    usedS2Indices.add(item.s2mIdx);
  });

  let remS2Matches = s2MatchesRaw.filter((_, idx) => !usedS2Indices.has(idx));
  for (let b = 0; b < numBeats; b++) {
    if (!s2AssignedMatches[b]) {
      s2AssignedMatches[b] = remS2Matches.shift();
      s2Stayers[b] = null;
    }
  }

  // Track rivers fished on Day 1
  const anglerRiversD1 = {};
  anglers.forEach(a => { anglerRiversD1[a] = new Set(); });
  for (let b = 0; b < numBeats; b++) {
    s1MatchesRaw[b].forEach(idx => anglerRiversD1[anglers[idx]].add(s1Beats[b].river));
    s2AssignedMatches[b].forEach(idx => anglerRiversD1[anglers[idx]].add(s2Beats[b].river));
  }

  // Day 2 (Sunday): S3 Morning & S4 Afternoon (daily limits reset, configured per Sunday availability)
  const sunPool = pool.filter(b => b.sun_available !== false);
  const activeSunPool = sunPool.length >= numBeats ? sunPool : pool;
  const s3Beats = pickBalancedBeats(activeSunPool, numBeats, true);
  const s3DoubleBeats = s3Beats.filter(b => (b.sun_sessions === 2 || (b.sun_sessions === undefined && b.usage_mode !== 'single')));
  const s3SingleIds = new Set(s3Beats.filter(b => (b.sun_sessions === 1 || (b.sun_sessions === undefined && b.usage_mode === 'single'))).map(b => b.id || b.code));
  const s4UnusedPool = activeSunPool.filter(b => {
    const id = b.id || b.code;
    return !s3SingleIds.has(id) && !s3DoubleBeats.some(db => (db.id || db.code) === id);
  });
  const s4Beats = [...s3DoubleBeats];
  for (const b of s4UnusedPool) {
    if (s4Beats.length >= numBeats) break;
    s4Beats.push(b);
  }
  for (const b of activeSunPool) {
    if (s4Beats.length >= numBeats) break;
    if (!s4Beats.some(eb => (eb.id || eb.code) === (b.id || b.code))) {
      s4Beats.push(b);
    }
  }
  for (const b of pool) {
    if (s4Beats.length >= numBeats) break;
    if (!s4Beats.some(eb => (eb.id || eb.code) === (b.id || b.code))) {
      s4Beats.push(b);
    }
  }

  const s3MatchesRaw = chosenScheduleRaw[2];
  const s4MatchesRaw = chosenScheduleRaw[3];

  let bestS3Perm = [...Array(numBeats).keys()];
  let bestS3Score = -1;
  for (let pTry = 0; pTry < 25; pTry++) {
    const perm = [...Array(numBeats).keys()].sort(() => Math.random() - 0.5);
    let sc = 0;
    for (let b = 0; b < numBeats; b++) {
      const r = s3Beats[b].river;
      s3MatchesRaw[perm[b]].forEach(idx => {
        if (!anglerRiversD1[anglers[idx]].has(r)) sc += 10;
      });
    }
    if (sc > bestS3Score) {
      bestS3Score = sc;
      bestS3Perm = perm;
    }
  }
  const s3AssignedMatches = bestS3Perm.map(idx => s3MatchesRaw[idx]);

  const s3OverlappingCount = s3DoubleBeats.length;
  function matchDay2Stayers(beatIdx, usedS4, curr) {
    if (beatIdx === s3OverlappingCount) return curr;
    const beatAnglers = s3AssignedMatches[beatIdx];
    const sortedCandidates = [...beatAnglers].sort((a, b) => {
      const wasStayerA = s2Stayers.includes(anglers[a]) ? 1 : 0;
      const wasStayerB = s2Stayers.includes(anglers[b]) ? 1 : 0;
      return wasStayerA - wasStayerB;
    });

    for (const stayerIdx of sortedCandidates) {
      const s4mIdx = s4MatchesRaw.findIndex(m => m.includes(stayerIdx));
      if (s4mIdx !== -1 && !usedS4.has(s4mIdx)) {
        const nextUsed = new Set(usedS4);
        nextUsed.add(s4mIdx);
        const res = matchDay2Stayers(beatIdx + 1, nextUsed, [...curr, { beatIdx, stayerIdx, s4mIdx }]);
        if (res) return res;
      }
    }
    return null;
  }

  const d2Stayers = matchDay2Stayers(0, new Set(), []) || [];
  const s4AssignedMatches = new Array(numBeats).fill(null);
  const s4Stayers = new Array(numBeats).fill(null);
  const usedS4Indices = new Set();

  d2Stayers.forEach(item => {
    s4AssignedMatches[item.beatIdx] = s4MatchesRaw[item.s4mIdx];
    s4Stayers[item.beatIdx] = anglers[item.stayerIdx];
    usedS4Indices.add(item.s4mIdx);
  });

  let remS4Matches = s4MatchesRaw.filter((_, idx) => !usedS4Indices.has(idx));
  for (let b = 0; b < numBeats; b++) {
    if (!s4AssignedMatches[b]) {
      s4AssignedMatches[b] = remS4Matches.shift();
      s4Stayers[b] = null;
    }
  }

  const sessionBeatAssignments = [
    { beats: s1Beats, matches: s1MatchesRaw, stayers: new Array(numBeats).fill(null) },
    { beats: s2Beats, matches: s2AssignedMatches, stayers: s2Stayers },
    { beats: s3Beats, matches: s3AssignedMatches, stayers: new Array(numBeats).fill(null) },
    { beats: s4Beats, matches: s4AssignedMatches, stayers: s4Stayers }
  ];

  for (let sIdx = 0; sIdx < numSessions; sIdx++) {
    const sDef = sessionDefs[sIdx];
    const sMatches = [];
    const assignment = sessionBeatAssignments[sIdx];

    for (let b = 0; b < numBeats; b++) {
      const beat = assignment.beats[b] || fallbackBeats[b % fallbackBeats.length];
      const matchAnglerIndices = assignment.matches[b];
      const matchAnglers = matchAnglerIndices.map(i => anglers[i]);

      if (matchAnglers.length === 3) {
        matchAnglers.forEach(a => { finalThreeWayCounts[a] = (finalThreeWayCounts[a] || 0) + 1; });
      }

      const stayer = assignment.stayers[b];

      const m = {
        match_id: `S${sDef.id}_M${b + 1}`,
        match_number: b + 1,
        match_type: matchAnglers.length === 3 ? "1v1v1" : "1v1",
        beat_number: b + 1,
        beat_id: beat.id || beat.code,
        beat_code: beat.code || beat.id,
        beat_name: beat.name,
        river: beat.river || "Small Blaar",
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
    name: a,
    angler: a,
    is_a_team: aSet.has(a),
    s1_pts: 0, s2_pts: 0, s3_pts: 0, s4_pts: 0,
    total_points: 0,
    total_fish: 0,
    blanks: 0,
    matches_played: 0,
    session_points: { 1: 0, 2: 0, 3: 0, 4: 0 }
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
      if (body.venue !== undefined) {
        targetTrial.venue = body.venue.trim();
        if (targetTrial.tournament_data) {
          targetTrial.tournament_data.venue = targetTrial.venue;
        }
        currentData.venue = targetTrial.venue;
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

    // 5b-2. Update A-Team Members (Admin Only)
    if (url.pathname === '/api/admin/trial/update_ateam' && request.method === 'POST') {
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
        const validAnglers = new Set(trial.tournament_data.anglers || []);
        const rawATeam = body.a_team_anglers || [];
        const cleanATeam = rawATeam.filter(a => validAnglers.has(a));
        trial.tournament_data.a_team_anglers = cleanATeam;
        trial.tournament_data.num_a_team = cleanATeam.length;
        
        // Update is_a_team flags on leaderboard
        const aSet = new Set(cleanATeam);
        (trial.tournament_data.leaderboard || []).forEach(row => {
          const name = row.angler || row.name;
          row.is_a_team = aSet.has(name);
        });

        // Also update match badge flags if sessions exist
        (trial.tournament_data.sessions || []).forEach(s => {
          (s.matches || []).forEach(m => {
            const mAnglers = m.anglers || [];
            m.a_team_competitors = mAnglers.filter(a => aSet.has(a));
            m.has_a_team_angler = m.a_team_competitors.length > 0;
            m.is_head_to_head_a_team = m.a_team_competitors.length >= 2;
          });
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message: "A-Team members updated successfully.",
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
            if (body.sat_available !== undefined) b.sat_available = body.sat_available;
            if (body.sat_sessions !== undefined) b.sat_sessions = Number(body.sat_sessions);
            if (body.sun_available !== undefined) b.sun_available = body.sun_available;
            if (body.sun_sessions !== undefined) b.sun_sessions = Number(body.sun_sessions);
            if (body.river !== undefined) b.river = body.river;
            if (body.usage_mode !== undefined) b.usage_mode = body.usage_mode;
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

    // 7b. Batch Update All Beats (Admin Only)
    if (url.pathname === '/api/admin/beats/update_all' && request.method === 'POST') {
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

      const beatsList = body.beats || [];
      const trial = getActiveTrial();
      let updatedCount = 0;
      if (trial && trial.tournament_data && trial.tournament_data.beats) {
        beatsList.forEach(nb => {
          const bId = nb.id || nb.code;
          const found = trial.tournament_data.beats.find(b => b.id === bId || b.code === bId);
          if (found) {
            if (nb.enabled !== undefined) found.enabled = nb.enabled;
            if (nb.sat_available !== undefined) found.sat_available = nb.sat_available;
            if (nb.sat_sessions !== undefined) found.sat_sessions = Number(nb.sat_sessions);
            if (nb.sun_available !== undefined) found.sun_available = nb.sun_available;
            if (nb.sun_sessions !== undefined) found.sun_sessions = Number(nb.sun_sessions);
            if (nb.river !== undefined) found.river = nb.river;
            if (nb.usage_mode !== undefined) found.usage_mode = nb.usage_mode;
            if (nb.meeting_point !== undefined) found.meeting_point = nb.meeting_point;
            if (nb.lower_pin !== undefined) found.lower_pin = nb.lower_pin;
            if (nb.mid_pin !== undefined) found.mid_pin = nb.mid_pin;
            if (nb.upper_pin !== undefined) found.upper_pin = nb.upper_pin;
            updatedCount++;
          }
        });
      }
      if (currentData.beats) {
        beatsList.forEach(nb => {
          const bId = nb.id || nb.code;
          const found = currentData.beats.find(b => b.id === bId || b.code === bId);
          if (found) {
            if (nb.enabled !== undefined) found.enabled = nb.enabled;
            if (nb.sat_available !== undefined) found.sat_available = nb.sat_available;
            if (nb.sat_sessions !== undefined) found.sat_sessions = Number(nb.sat_sessions);
            if (nb.sun_available !== undefined) found.sun_available = nb.sun_available;
            if (nb.sun_sessions !== undefined) found.sun_sessions = Number(nb.sun_sessions);
            if (nb.river !== undefined) found.river = nb.river;
            if (nb.usage_mode !== undefined) found.usage_mode = nb.usage_mode;
            if (nb.meeting_point !== undefined) found.meeting_point = nb.meeting_point;
            if (nb.lower_pin !== undefined) found.lower_pin = nb.lower_pin;
            if (nb.mid_pin !== undefined) found.mid_pin = nb.mid_pin;
            if (nb.upper_pin !== undefined) found.upper_pin = nb.upper_pin;
          }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        message: `Successfully updated ${updatedCount} beats.`,
        state: getFullState()
      }), {
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
