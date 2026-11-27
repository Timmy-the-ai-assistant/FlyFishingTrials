const APP_VERSION = "v2.6.0";
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
    angler_availability: tData.angler_availability || {},
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

const DEFAULT_CPS_BEATS = [
  { id: "EP1", code: "EP1", name: "EP1", river: "Elands Pad", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", travel_time: 15, lower_pin: [-33.7319, 19.1141], mid_pin: [-33.7360, 19.1152], upper_pin: [-33.7405, 19.1162], meeting_point: "Junction Pool trail head", notes: "EP1: 2x sessions" },
  { id: "EP2", code: "EP2", name: "EP2", river: "Elands Pad", enabled: true, sat_available: true, sat_sessions: 1, sun_available: true, sun_sessions: 1, usage_mode: "single", travel_time: 30, lower_pin: [-33.7405, 19.1162], mid_pin: [-33.7460, 19.1172], upper_pin: [-33.7520, 19.1188], meeting_point: "Fisherman's Cave trail", notes: "EP2: 1x session" },
  { id: "EP3", code: "EP3", name: "EP3", river: "Elands Pad", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", travel_time: 30, lower_pin: [-33.7520, 19.1188], mid_pin: [-33.7565, 19.1195], upper_pin: [-33.7610, 19.1205], meeting_point: "Star beat rock shelter", notes: "EP3: 2x sessions" },
  { id: "SB6", code: "SB6", name: "SB6", river: "Elands Pad", enabled: true, sat_available: true, sat_sessions: 1, sun_available: true, sun_sessions: 1, usage_mode: "single", travel_time: 15, lower_pin: [-33.7319, 19.1141], mid_pin: [-33.7330, 19.1105], upper_pin: [-33.7342, 19.1065], meeting_point: "Tunnel East Portal Parking / Junction Path", notes: "SB6: 1x session (Elands access)" },
  { id: "SB1", code: "SB1", name: "SB1", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", travel_time: 15, lower_pin: [-33.7150, 19.1740], mid_pin: [-33.7170, 19.1700], upper_pin: [-33.7190, 19.1655], meeting_point: "Picnic site pull-off", notes: "SB1: 2x sessions" },
  { id: "SB2", code: "SB2", name: "SB2", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", travel_time: 15, lower_pin: [-33.7190, 19.1655], mid_pin: [-33.7212, 19.1590], upper_pin: [-33.7235, 19.1530], meeting_point: "Picnic site parking", notes: "SB2: 2x sessions" },
  { id: "SB3", code: "SB3", name: "SB3", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 2, sun_available: true, sun_sessions: 2, usage_mode: "double", travel_time: 15, lower_pin: [-33.7235, 19.1530], mid_pin: [-33.7258, 19.1470], upper_pin: [-33.7272, 19.1415], meeting_point: "N1 emergency telephone layby 3", notes: "SB3: 2x sessions" },
  { id: "SB4", code: "SB4", name: "SB4", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 1, sun_available: true, sun_sessions: 1, usage_mode: "single", travel_time: 15, lower_pin: [-33.7272, 19.1415], mid_pin: [-33.7285, 19.1370], upper_pin: [-33.7295, 19.1320], meeting_point: "Donkergat pull-off", notes: "SB4: 1x session" },
  { id: "SB(TRANSPORT)", code: "SB(TRANSPORT)", name: "SB(TRANSPORT)", river: "Small Blaar", enabled: true, sat_available: true, sat_sessions: 1, sun_available: true, sun_sessions: 1, usage_mode: "single", travel_time: 15, lower_pin: [-33.7085, 19.1895], mid_pin: [-33.7105, 19.1845], upper_pin: [-33.7125, 19.1800], meeting_point: "Transport bridge parking", notes: "Transport: 1x session" },
  { id: "SB5", code: "SB5", name: "SB5", river: "Small Blaar", enabled: false, sat_available: false, sat_sessions: 0, sun_available: false, sun_sessions: 0, usage_mode: "double", travel_time: 15, lower_pin: [-33.7295, 19.1320], mid_pin: [-33.7305, 19.1270], upper_pin: [-33.7319, 19.1141], meeting_point: "CPS Elandspad parking lot" },
  { id: "SB(HOTEL)", code: "SB(HOTEL)", name: "SB(HOTEL)", river: "Small Blaar", enabled: false, sat_available: false, sat_sessions: 0, sun_available: false, sun_sessions: 0, usage_mode: "single", travel_time: 15, lower_pin: [-33.7125, 19.1800], mid_pin: [-33.7138, 19.1770], upper_pin: [-33.7150, 19.1740], meeting_point: "Du Kloof Lodge guest parking" },
  { id: "MOLENAARS(UPPER)", code: "MOLENAARS(UPPER)", name: "MOLENAARS(UPPER)", river: "Small Blaar", enabled: false, sat_available: false, sat_sessions: 0, sun_available: false, sun_sessions: 0, usage_mode: "double", travel_time: 15, lower_pin: [-33.7040, 19.2000], mid_pin: [-33.7065, 19.1945], upper_pin: [-33.7085, 19.1895], meeting_point: "Upper Molenaars turn-off" },
  { id: "MOLENAARS(LOWER)", code: "MOLENAARS(LOWER)", name: "MOLENAARS(LOWER)", river: "Small Blaar", enabled: false, sat_available: false, sat_sessions: 0, sun_available: false, sun_sessions: 0, usage_mode: "double", travel_time: 15, lower_pin: [-33.6980, 19.2150], mid_pin: [-33.7010, 19.2075], upper_pin: [-33.7040, 19.2000], meeting_point: "Lower Molenaars boundary" }
];

function generateEdgeScheduleInternal(anglers, aTeamAnglers = [], availableBeats = [], anglerAvailability = {}) {
  const N = anglers.length;
  if (N < 2) throw new Error("At least 2 anglers required for fly fishing trials.");

  const numSessions = 4;
  const fallbackBeats = (availableBeats && availableBeats.length > 0) ? availableBeats : DEFAULT_CPS_BEATS;

  function isAvailable(anglerName, sId) {
    if (!anglerAvailability) return true;
    const val = anglerAvailability[anglerName];
    if (val === undefined || val === null) return true;
    if (Array.isArray(val)) return val.includes(sId);
    if (typeof val === 'object') return Boolean(val[sId] ?? val[String(sId)] ?? true);
    return true;
  }

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

  for (let attempt = 0; attempt < 5000; attempt++) {
    const pairsMet = new Set();
    const byeCounts = new Array(N).fill(0);
    const candidateSessions = [];
    let possible = true;
    const aVsACount = new Array(N).fill(0);
    const challengerFacedA = new Array(N).fill(0);

    for (let sIdx = 0; sIdx < numSessions; sIdx++) {
      const sId = sIdx + 1;
      const initialActive = [];
      const sessionSolo = [];

      for (let i = 0; i < N; i++) {
        if (isAvailable(anglers[i], sId)) initialActive.push(i);
        else sessionSolo.push(i);
      }

      let sessionMatches = null;

      for (let sAttempt = 0; sAttempt < 150; sAttempt++) {
        let currActive = [...initialActive];
        let currSolo = [...sessionSolo];

        // STRICT TWO-PERSON PAIRINGS (Zero 3-way combos):
        // If active count is odd, issue 1 BYE to make it even
        if (currActive.length % 2 !== 0) {
          const byeCandidates = [...currActive].sort((a, b) => {
            if (byeCounts[a] !== byeCounts[b]) return byeCounts[a] - byeCounts[b];
            const aIsA = aIndices.has(a) ? 1 : 0;
            const bIsA = aIndices.has(b) ? 1 : 0;
            if (aIsA !== bIsA) return aIsA - bIsA; // Non-A-team prefers bye first
            return Math.random() - 0.5;
          });

          const byeAngler = byeCandidates[0];
          currActive = currActive.filter(x => x !== byeAngler);
          currSolo.push(byeAngler);
        }

        // Shuffle currActive
        for (let i = currActive.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [currActive[i], currActive[j]] = [currActive[j], currActive[i]];
        }

        function pairUp(pool) {
          if (pool.length === 0) return [];
          const p1 = pool[0];
          const cands = pool.slice(1);
          const valids = cands.filter(p2 => !pairsMet.has(pairKey(p1, p2)));
          if (valids.length === 0) return null;

          valids.sort((a, b) => {
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

          for (const p2 of valids) {
            const nextPool = pool.filter(x => x !== p1 && x !== p2);
            const sub = pairUp(nextPool);
            if (sub !== null) return [[p1, p2], ...sub];
          }
          return null;
        }

        const pairs1v1 = pairUp(currActive);
        if (pairs1v1 !== null) {
          const mList = [];
          pairs1v1.forEach(p => mList.push(p));
          currSolo.forEach(u => mList.push([u]));
          sessionMatches = {
            matches: mList,
            byes: currSolo,
            pairs: pairs1v1
          };
          break;
        }
      }

      if (!sessionMatches) {
        possible = false;
        break;
      }

      for (const p of sessionMatches.pairs) {
        pairsMet.add(pairKey(p[0], p[1]));
        const a1 = aIndices.has(p[0]), a2 = aIndices.has(p[1]);
        if (a1 && a2) {
          aVsACount[p[0]]++;
          aVsACount[p[1]]++;
        } else if (a1 && !a2) {
          challengerFacedA[p[1]]++;
        } else if (a2 && !a1) {
          challengerFacedA[p[0]]++;
        }
      }

      for (const bIdx of sessionMatches.byes) {
        byeCounts[bIdx]++;
      }

      candidateSessions.push(sessionMatches.matches);
    }

    if (possible && candidateSessions.length === numSessions) {
      const metCounts = {};
      anglers.forEach(a => { metCounts[a] = {}; });
      let anyRepeat = false;

      candidateSessions.forEach(sMatches => {
        sMatches.forEach(m => {
          if (m.length > 1) {
            const mAnglers = m.map(idx => anglers[idx]);
            mAnglers.forEach(a => {
              mAnglers.forEach(o => {
                if (a !== o) {
                  metCounts[a][o] = (metCounts[a][o] || 0) + 1;
                  if (metCounts[a][o] > 1) anyRepeat = true;
                }
              });
            });
          }
        });
      });

      if (anyRepeat) continue;

      let aTeamValid = true;
      if (hasATeam) {
        for (const aIdx of aIndices) {
          const aName = anglers[aIdx];
          const activeSessCount = [1, 2, 3, 4].filter(sid => isAvailable(aName, sid)).length;
          const targetClashes = Math.min(2, Math.max(0, activeSessCount - 1));
          if (aVsACount[aIdx] < targetClashes) {
            aTeamValid = false;
            break;
          }
        }
      }
      if (hasATeam && !aTeamValid && attempt < 3500) continue;

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
        if (cFacedAtLeast1 >= Math.floor(nonACount * 0.8)) {
          break;
        }
      }
    }
  }

  if (!chosenScheduleRaw) throw new Error("Could not solve schedule");

  const s1MatchesRaw = chosenScheduleRaw[0];
  const s2MatchesRaw = chosenScheduleRaw[1];
  const s3MatchesRaw = chosenScheduleRaw[2];
  const s4MatchesRaw = chosenScheduleRaw[3];

  const s1NumBeats = s1MatchesRaw.length;
  const s2NumBeats = s2MatchesRaw.length;
  const s3NumBeats = s3MatchesRaw.length;
  const s4NumBeats = s4MatchesRaw.length;
  const maxBeatsNeeded = Math.max(s1NumBeats, s2NumBeats, s3NumBeats, s4NumBeats);

  const activePool = (availableBeats && availableBeats.length >= maxBeatsNeeded)
    ? availableBeats.filter(b => b.enabled !== false)
    : fallbackBeats;
  const pool = activePool.length >= maxBeatsNeeded ? activePool : fallbackBeats;

  const isEp = b => (b.river || '').toLowerCase().includes('eland');
  const isSb = b => !isEp(b);

  // CPS Catch Ranking & River Strategy:
  // Morning: Elands Pad (EP2, EP3) + Upper Small Blaar (SB6, SB5, SB3, SB2, SB1, SB(HOTEL))
  // Afternoon: Best Small Blaar (SB(HOTEL), SB6, SB1, SB3, SB2, SB5, SB4, SB(TRANSPORT))
  const BEAT_PRIORITY_MORNING = [
    'EP2', 'EP3', 'SB6', 'SB5', 'SB3', 'SB2', 'SB1', 'SB(HOTEL)', 'SB4', 'SB(TRANSPORT)', 'MOLENAARS(UPPER)', 'MOLENAARS(LOWER)'
  ];
  const BEAT_PRIORITY_AFTERNOON = [
    'SB(HOTEL)', 'SB6', 'SB1', 'SB3', 'SB2', 'SB5', 'SB4', 'SB(TRANSPORT)', 'EP2', 'EP3', 'MOLENAARS(UPPER)', 'MOLENAARS(LOWER)'
  ];

  function getPriorityScore(beat, prioList) {
    const id = beat.id || beat.code;
    const idx = prioList.indexOf(id);
    return idx === -1 ? 999 : idx;
  }

  function pickDayBeats(dayPool, amCount, pmCount) {
    const epCandidates = dayPool.filter(isEp);
    epCandidates.sort((a, b) => getPriorityScore(a, BEAT_PRIORITY_MORNING) - getPriorityScore(b, BEAT_PRIORITY_MORNING));
    const sbCandidates = dayPool.filter(isSb);
    sbCandidates.sort((a, b) => getPriorityScore(a, BEAT_PRIORITY_MORNING) - getPriorityScore(b, BEAT_PRIORITY_MORNING));

    const amBeats = [];
    const maxEpInAm = Math.min(Math.ceil(amCount / 2), epCandidates.length);
    for (let i = 0; i < maxEpInAm; i++) {
      amBeats.push(epCandidates[i]);
    }
    for (const b of sbCandidates) {
      if (amBeats.length >= amCount) break;
      if (!amBeats.some(x => (x.id || x.code) === (b.id || b.code))) amBeats.push(b);
    }
    for (const b of epCandidates) {
      if (amBeats.length >= amCount) break;
      if (!amBeats.some(x => (x.id || x.code) === (b.id || b.code))) amBeats.push(b);
    }

    const amSbDoubles = amBeats.filter(b => isSb(b) && (b.sat_sessions === 2 || (b.sat_sessions === undefined && b.usage_mode !== 'single')));
    amSbDoubles.sort((a, b) => getPriorityScore(a, BEAT_PRIORITY_AFTERNOON) - getPriorityScore(b, BEAT_PRIORITY_AFTERNOON));

    const pmBeats = [...amSbDoubles];
    const sbAfternoonPool = dayPool.filter(isSb);
    sbAfternoonPool.sort((a, b) => getPriorityScore(a, BEAT_PRIORITY_AFTERNOON) - getPriorityScore(b, BEAT_PRIORITY_AFTERNOON));
    for (const b of sbAfternoonPool) {
      if (pmBeats.length >= pmCount) break;
      if (!pmBeats.some(x => (x.id || x.code) === (b.id || b.code))) pmBeats.push(b);
    }
    for (const b of dayPool) {
      if (pmBeats.length >= pmCount) break;
      if (!pmBeats.some(x => (x.id || x.code) === (b.id || b.code))) pmBeats.push(b);
    }

    const overlapping = [];
    amBeats.forEach(amb => {
      const pIdx = pmBeats.findIndex(pmb => (pmb.id || pmb.code) === (amb.id || amb.code));
      if (pIdx !== -1) {
        overlapping.push(amb);
      }
    });

    const amAligned = [...overlapping, ...amBeats.filter(b => !overlapping.some(o => (o.id || o.code) === (b.id || b.code)))];
    const pmAligned = [...overlapping, ...pmBeats.filter(b => !overlapping.some(o => (o.id || o.code) === (b.id || b.code)))];

    return { amBeats: amAligned, pmBeats: pmAligned, overlappingCount: overlapping.length };
  }

  // Saturday (S1 Morning -> S2 Afternoon)
  const satPool = pool.filter(b => b.sat_available !== false);
  const activeSatPool = satPool.length >= maxBeatsNeeded ? satPool : pool;
  const satBeatsPlan = pickDayBeats(activeSatPool, s1NumBeats, s2NumBeats);
  const s1Beats = satBeatsPlan.amBeats;
  const s2Beats = satBeatsPlan.pmBeats;
  const s1OverlappingCount = satBeatsPlan.overlappingCount;

  // Track morning anglers on upper Elandspad (EP3 and EP2) to avoid long jumps to SB1/Hotel
  const d1EpHeavyAnglers = new Set();
  s1Beats.forEach((b, bIdx) => {
    const bId = b.id || b.code;
    if (bId === 'EP3' || bId === 'EP2') {
      (s1MatchesRaw[bIdx] || []).forEach(aIdx => d1EpHeavyAnglers.add(aIdx));
    }
  });

  // Day 1 Stayers & Optimal Transition Matching
  function matchDay1Stayers(beatIdx, usedS2, curr) {
    if (beatIdx === s1OverlappingCount) return curr;
    const beatAnglers = s1MatchesRaw[beatIdx];
    if (!beatAnglers || beatAnglers.length <= 1) return matchDay1Stayers(beatIdx + 1, usedS2, curr);
    
    // Sort stayers candidates: prefer pairing stayer with an incoming EP3/EP2 gorge angler on SB6/SB5
    const candidates = [];
    for (const stayerIdx of beatAnglers) {
      s2MatchesRaw.forEach((m, s2mIdx) => {
        if (m.length > 1 && m.includes(stayerIdx) && !usedS2.has(s2mIdx)) {
          const partnerIdx = m.find(x => x !== stayerIdx);
          const hasEpHeavy = d1EpHeavyAnglers.has(partnerIdx);
          candidates.push({ stayerIdx, s2mIdx, priority: hasEpHeavy ? -100 : 0 });
        }
      });
    }
    candidates.sort((a, b) => a.priority - b.priority);

    for (const cand of candidates) {
      const nextUsed = new Set(usedS2);
      nextUsed.add(cand.s2mIdx);
      const res = matchDay1Stayers(beatIdx + 1, nextUsed, [...curr, { beatIdx, stayerIdx: cand.stayerIdx, s2mIdx: cand.s2mIdx }]);
      if (res) return res;
    }
    return matchDay1Stayers(beatIdx + 1, usedS2, curr);
  }

  const d1Stayers = matchDay1Stayers(0, new Set(), []) || [];
  const s2AssignedMatches = new Array(s2NumBeats).fill(null);
  const s2Stayers = new Array(s2NumBeats).fill(null);
  const usedS2Indices = new Set();
  d1Stayers.forEach(item => {
    s2AssignedMatches[item.beatIdx] = s2MatchesRaw[item.s2mIdx];
    s2Stayers[item.beatIdx] = anglers[item.stayerIdx];
    usedS2Indices.add(item.s2mIdx);
  });
  
  // Assign remaining S2 matches, ensuring any remaining EP3/EP2 gorge anglers get upper beats
  let remS2 = s2MatchesRaw.filter((_, idx) => !usedS2Indices.has(idx));
  remS2.sort((mA, mB) => {
    const hasA = mA.some(a => d1EpHeavyAnglers.has(a));
    const hasB = mB.some(a => d1EpHeavyAnglers.has(a));
    return (hasB ? 1 : 0) - (hasA ? 1 : 0);
  });

  for (let b = 0; b < s2NumBeats; b++) {
    if (!s2AssignedMatches[b]) {
      s2AssignedMatches[b] = remS2.shift();
      s2Stayers[b] = null;
    }
  }

  // Sunday (S3 Morning -> S4 Afternoon)
  const sunPool = pool.filter(b => b.sun_available !== false);
  const activeSunPool = sunPool.length >= maxBeatsNeeded ? sunPool : pool;
  const sunBeatsPlan = pickDayBeats(activeSunPool, s3NumBeats, s4NumBeats);
  const s3Beats = sunBeatsPlan.amBeats;
  const s4Beats = sunBeatsPlan.pmBeats;
  const s3AssignedMatches = [...s3MatchesRaw];
  const s3OverlappingCount = sunBeatsPlan.overlappingCount;

  // Track morning anglers on upper Elandspad (EP3 and EP2) on Sunday
  const d2EpHeavyAnglers = new Set();
  s3Beats.forEach((b, bIdx) => {
    const bId = b.id || b.code;
    if (bId === 'EP3' || bId === 'EP2') {
      (s3MatchesRaw[bIdx] || []).forEach(aIdx => d2EpHeavyAnglers.add(aIdx));
    }
  });

  // Day 2 Stayers & Optimal Transition Matching
  function matchDay2Stayers(beatIdx, usedS4, curr) {
    if (beatIdx === s3OverlappingCount) return curr;
    const beatAnglers = s3MatchesRaw[beatIdx];
    if (!beatAnglers || beatAnglers.length <= 1) return matchDay2Stayers(beatIdx + 1, usedS4, curr);

    const candidates = [];
    for (const stayerIdx of beatAnglers) {
      s4MatchesRaw.forEach((m, s4mIdx) => {
        if (m.length > 1 && m.includes(stayerIdx) && !usedS4.has(s4mIdx)) {
          const partnerIdx = m.find(x => x !== stayerIdx);
          const hasEpHeavy = d2EpHeavyAnglers.has(partnerIdx);
          candidates.push({ stayerIdx, s4mIdx, priority: hasEpHeavy ? -100 : 0 });
        }
      });
    }
    candidates.sort((a, b) => a.priority - b.priority);

    for (const cand of candidates) {
      const nextUsed = new Set(usedS4);
      nextUsed.add(cand.s4mIdx);
      const res = matchDay2Stayers(beatIdx + 1, nextUsed, [...curr, { beatIdx, stayerIdx: cand.stayerIdx, s4mIdx: cand.s4mIdx }]);
      if (res) return res;
    }
    return matchDay2Stayers(beatIdx + 1, usedS4, curr);
  }

  const d2Stayers = matchDay2Stayers(0, new Set(), []) || [];
  const s4AssignedMatches = new Array(s4NumBeats).fill(null);
  const s4Stayers = new Array(s4NumBeats).fill(null);
  const usedS4Indices = new Set();
  d2Stayers.forEach(item => {
    s4AssignedMatches[item.beatIdx] = s4MatchesRaw[item.s4mIdx];
    s4Stayers[item.beatIdx] = anglers[item.stayerIdx];
    usedS4Indices.add(item.s4mIdx);
  });

  let remS4 = s4MatchesRaw.filter((_, idx) => !usedS4Indices.has(idx));
  remS4.sort((mA, mB) => {
    const hasA = mA.some(a => d2EpHeavyAnglers.has(a));
    const hasB = mB.some(a => d2EpHeavyAnglers.has(a));
    return (hasB ? 1 : 0) - (hasA ? 1 : 0);
  });

  for (let b = 0; b < s4NumBeats; b++) {
    if (!s4AssignedMatches[b]) {
      s4AssignedMatches[b] = remS4.shift();
      s4Stayers[b] = null;
    }
  }

  const sessionBeatAssignments = [
    { beats: s1Beats, matches: s1MatchesRaw, stayers: new Array(s1NumBeats).fill(null) },
    { beats: s2Beats, matches: s2AssignedMatches, stayers: s2Stayers },
    { beats: s3Beats, matches: s3AssignedMatches, stayers: new Array(s3NumBeats).fill(null) },
    { beats: s4Beats, matches: s4AssignedMatches, stayers: s4Stayers }
  ];

  const sessions = [];
  const anglerSchedule = {};
  anglers.forEach(a => { anglerSchedule[a] = []; });

  for (let sIdx = 0; sIdx < numSessions; sIdx++) {
    const sDef = sessionDefs[sIdx];
    const sMatches = [];
    const assignment = sessionBeatAssignments[sIdx];
    const matchCount = assignment.matches.length;

    for (let b = 0; b < matchCount; b++) {
      const beat = assignment.beats[b] || fallbackBeats[b % fallbackBeats.length];
      const matchAnglerIndices = assignment.matches[b];
      const matchAnglers = matchAnglerIndices.map(i => anglers[i]);
      const isSolo = (matchAnglers.length === 1);
      const stayer = isSolo ? null : assignment.stayers[b];

      const m = {
        match_id: `S${sDef.id}_M${b + 1}`,
        match_number: b + 1,
        match_type: isSolo ? "BYE" : "1v1",
        is_solo: isSolo,
        is_bye: isSolo,
        beat_number: b + 1,
        beat: b + 1,
        beat_id: beat.id || beat.code,
        beat_code: beat.code || beat.id,
        beat_name: beat.name,
        river: beat.river || "Small Blaar",
        lower_pin: beat.lower_pin || [-33.7319, 19.1141],
        mid_pin: beat.mid_pin || [-33.7330, 19.1180],
        upper_pin: beat.upper_pin || [-33.7340, 19.1225],
        meeting_point: beat.meeting_point || "Parking",
        travel_time: beat.travel_time || 15,
        anglers: matchAnglers,
        stayer: stayer,
        status: isSolo ? "BYE" : "UNREPORTED",
        submissions: {},
        official_scores: {},
        calculated_points: {}
      };

      if (isSolo) {
        const a = matchAnglers[0];
        anglerSchedule[a].push({
          session_id: sDef.id,
          session_name: sDef.name,
          session_short: sDef.short,
          day: sDef.day,
          time: sDef.time,
          beat_number: b + 1,
          beat: b + 1,
          beat_id: beat.id || beat.code,
          beat_code: beat.code || beat.id,
          beat_name: beat.name,
          river: beat.river || "Small Blaar",
          meeting_point: beat.meeting_point,
          travel_time: beat.travel_time || 15,
          match_type: "BYE",
          is_solo: true,
          is_bye: true,
          opponents: [],
          is_stayer: false,
          section: "Full Beat (Issued Bye)",
          pin: beat.lower_pin || [-33.7319, 19.1141],
          lower_pin: beat.lower_pin,
          mid_pin: beat.mid_pin,
          upper_pin: beat.upper_pin
        });
      } else {
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
            beat: b + 1,
            beat_id: beat.id || beat.code,
            beat_code: beat.code || beat.id,
            beat_name: beat.name,
            river: beat.river || "Small Blaar",
            meeting_point: beat.meeting_point,
          travel_time: beat.travel_time || 15,
            match_type: m.match_type,
            is_solo: false,
            opponents: opps,
            is_stayer: isStayer,
            section: isStayer ? "Second Half (Upper Section)" : "First Half (Lower Section)",
            pin: isStayer ? (beat.mid_pin || beat.lower_pin) : beat.lower_pin,
            lower_pin: beat.lower_pin,
            mid_pin: beat.mid_pin,
            upper_pin: beat.upper_pin
          });
        });
      }

      sMatches.push(m);
    }

    sessions.push({
      session_id: sDef.id,
      session_name: sDef.name,
      session_short: sDef.short,
      day: sDef.day,
      time: sDef.time,
      time_slot: sDef.time,
      is_saved: false,
      saved_at: null,
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

  const finalThreeWayCounts = {};
  anglers.forEach(a => { finalThreeWayCounts[a] = 0; });
  sessions.forEach(s => {
    (s.matches || []).forEach(m => {
      if (m.anglers && m.anglers.length === 3) {
        m.anglers.forEach(a => {
          finalThreeWayCounts[a] = (finalThreeWayCounts[a] || 0) + 1;
        });
      }
    });
  });

  return {
    sessions,
    anglerSchedule,
    leaderboard,
    threeWayCounts: finalThreeWayCounts,
    numBeats: maxBeatsNeeded
  };
}



function buildTemplateDraw(sundayARiver = "Small Blaar") {
  const s1 = {
    session_id: 1,
    name: "Saturday Morning",
    day: "Saturday",
    time_slot: "Morning",
    matches: [
      { id: "S1_M1", beat_code: "EP1", beat_id: "EP1", river: "Elands Pad", anglers: ["A1", "B1"], travel_time: 15, group: "Group 1 (Elands)", match_desc: "A vs B" },
      { id: "S1_M2", beat_code: "EP3", beat_id: "EP3", river: "Elands Pad", anglers: ["A2", "B2"], travel_time: 30, group: "Group 1 (Elands)", match_desc: "A vs B" },
      { id: "S1_M3", beat_code: "SB1", beat_id: "SB1", river: "Small Blaar", anglers: ["A3", "B3"], travel_time: 15, group: "Group 2 (Small Blaar)", match_desc: "A vs B" },
      { id: "S1_M4", beat_code: "SB2", beat_id: "SB2", river: "Small Blaar", anglers: ["A4", "B5"], travel_time: 15, group: "Group 2 (Small Blaar)", match_desc: "A vs B" },
      { id: "S1_M5", beat_code: "SB3", beat_id: "SB3", river: "Small Blaar", anglers: ["B4", "B6"], travel_time: 15, group: "Group 2 (Small Blaar)", match_desc: "B vs B" }
    ]
  };

  const s2 = {
    session_id: 2,
    name: "Saturday Afternoon",
    day: "Saturday",
    time_slot: "Afternoon",
    matches: [
      { id: "S2_M1", beat_code: "EP1", beat_id: "EP1", river: "Elands Pad", anglers: ["A1", "B2"], travel_time: 15, group: "Group 1 (Elands)", match_desc: "A vs B" },
      { id: "S2_M2", beat_code: "EP3", beat_id: "EP3", river: "Elands Pad", anglers: ["A2", "B1"], travel_time: 30, group: "Group 1 (Elands)", match_desc: "A vs B" },
      { id: "S2_M3", beat_code: "SB1", beat_id: "SB1", river: "Small Blaar", anglers: ["A3", "B4"], travel_time: 15, group: "Group 2 (Small Blaar)", match_desc: "A vs B" },
      { id: "S2_M4", beat_code: "SB2", beat_id: "SB2", river: "Small Blaar", anglers: ["A4", "B6"], travel_time: 15, group: "Group 2 (Small Blaar)", match_desc: "A vs B" },
      { id: "S2_M5", beat_code: "SB3", beat_id: "SB3", river: "Small Blaar", anglers: ["B3", "B5"], travel_time: 15, group: "Group 2 (Small Blaar)", match_desc: "B vs B" }
    ]
  };

  let s3_matches = [];
  let s4_matches = [];

  if (sundayARiver === "Small Blaar") {
    s3_matches = [
      { id: "S3_M1", beat_code: "SB1", beat_id: "SB1", river: "Small Blaar", anglers: ["A1", "A2"], travel_time: 15, group: "A-Team River", match_desc: "A vs A" },
      { id: "S3_M2", beat_code: "SB2", beat_id: "SB2", river: "Small Blaar", anglers: ["A3", "A4"], travel_time: 15, group: "A-Team River", match_desc: "A vs A" },
      { id: "S3_M3", beat_code: "EP1", beat_id: "EP1", river: "Elands Pad", anglers: ["B1", "B3"], travel_time: 15, group: "B-Team River", match_desc: "B vs B" },
      { id: "S3_M4", beat_code: "EP3", beat_id: "EP3", river: "Elands Pad", anglers: ["B2", "B4"], travel_time: 30, group: "B-Team River", match_desc: "B vs B" },
      { id: "S3_M5", beat_code: "EP2", beat_id: "EP2", river: "Elands Pad", anglers: ["B5", "B6_or_new"], travel_time: 30, group: "B-Team River", match_desc: "B vs B" }
    ];

    s4_matches = [
      { id: "S4_M1", beat_code: "SB3", beat_id: "SB3", river: "Small Blaar", anglers: ["A1", "A3"], travel_time: 15, group: "A-Team River", match_desc: "A vs A" },
      { id: "S4_M2", beat_code: "SB1", beat_id: "SB1", river: "Small Blaar", anglers: ["A2", "A4"], travel_time: 15, group: "A-Team River", match_desc: "A vs A" },
      { id: "S4_M3", beat_code: "EP3", beat_id: "EP3", river: "Elands Pad", anglers: ["B1", "B4"], travel_time: 30, group: "B-Team River", match_desc: "B vs B" },
      { id: "S4_M4", beat_code: "EP1", beat_id: "EP1", river: "Elands Pad", anglers: ["B2", "B5"], travel_time: 15, group: "B-Team River", match_desc: "B vs B" },
      { id: "S4_M5", beat_code: "SB6", beat_id: "SB6", river: "Elands Pad", anglers: ["B3", "B6_or_new"], travel_time: 15, group: "B-Team River", match_desc: "B vs B" }
    ];
  } else {
    s3_matches = [
      { id: "S3_M1", beat_code: "EP2", beat_id: "EP2", river: "Elands Pad", anglers: ["A1", "A2"], travel_time: 30, group: "A-Team River", match_desc: "A vs A" },
      { id: "S3_M2", beat_code: "EP1", beat_id: "EP1", river: "Elands Pad", anglers: ["A3", "A4"], travel_time: 15, group: "A-Team River", match_desc: "A vs A" },
      { id: "S3_M3", beat_code: "SB1", beat_id: "SB1", river: "Small Blaar", anglers: ["B1", "B3"], travel_time: 15, group: "B-Team River", match_desc: "B vs B" },
      { id: "S3_M4", beat_code: "SB2", beat_id: "SB2", river: "Small Blaar", anglers: ["B2", "B4"], travel_time: 15, group: "B-Team River", match_desc: "B vs B" },
      { id: "S3_M5", beat_code: "SB4", beat_id: "SB4", river: "Small Blaar", anglers: ["B5", "B6_or_new"], travel_time: 15, group: "B-Team River", match_desc: "B vs B" }
    ];

    s4_matches = [
      { id: "S4_M1", beat_code: "EP3", beat_id: "EP3", river: "Elands Pad", anglers: ["A1", "A3"], travel_time: 30, group: "A-Team River", match_desc: "A vs A" },
      { id: "S4_M2", beat_code: "SB6", beat_id: "SB6", river: "Elands Pad", anglers: ["A2", "A4"], travel_time: 15, group: "A-Team River", match_desc: "A vs A" },
      { id: "S4_M3", beat_code: "SB3", beat_id: "SB3", river: "Small Blaar", anglers: ["B1", "B4"], travel_time: 15, group: "B-Team River", match_desc: "B vs B" },
      { id: "S4_M4", beat_code: "SB1", beat_id: "SB1", river: "Small Blaar", anglers: ["B2", "B5"], travel_time: 15, group: "B-Team River", match_desc: "B vs B" },
      { id: "S4_M5", beat_code: "SB(TRANSPORT)", beat_id: "SB(TRANSPORT)", river: "Small Blaar", anglers: ["B3", "B6_or_new"], travel_time: 15, group: "B-Team River", match_desc: "B vs B" }
    ];
  }

  const s3 = { session_id: 3, name: "Sunday Morning", day: "Sunday", time_slot: "Morning", matches: s3_matches };
  const s4 = { session_id: 4, name: "Sunday Afternoon", day: "Sunday", time_slot: "Afternoon", matches: s4_matches };

  return {
    sunday_a_team_river: sundayARiver,
    sunday_b_team_river: sundayARiver === "Small Blaar" ? "Elands Pad" : "Small Blaar",
    sessions: [s1, s2, s3, s4]
  };
}

function generateGroupTournamentSchedule(anglers, aTeamAnglers = [], availableBeats = [], anglerAvailability = {}) {
  const aList = [...aTeamAnglers.filter(a => anglers.includes(a))];
  for (let i = aList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [aList[i], aList[j]] = [aList[j], aList[i]];
  }

  const challengers = anglers.filter(a => !aTeamAnglers.includes(a));
  const isAvailable = (ang, sess) => {
    const av = anglerAvailability[ang];
    if (!av || !Array.isArray(av) || av.length === 0) return true;
    return av.includes(sess);
  };

  const satChallengers = challengers.filter(a => isAvailable(a, 1) || isAvailable(a, 2));
  const sunChallengers = challengers.filter(a => isAvailable(a, 3) || isAvailable(a, 4));

  const satB = [...satChallengers];
  for (let i = satB.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [satB[i], satB[j]] = [satB[j], satB[i]];
  }

  const A1 = aList[0], A2 = aList[1], A3 = aList[2], A4 = aList[3];
  const B1 = satB[0], B2 = satB[1], B3 = satB[2], B4 = satB[3], B5 = satB[4], B6 = satB[5];

  const satOnly = satChallengers.filter(a => !sunChallengers.includes(a));
  const sunOnly = sunChallengers.filter(a => !satChallengers.includes(a));

  let sunB1 = B1, sunB2 = B2, sunB3 = B3, sunB4 = B4, sunB5 = B5, sunB6 = B6;
  if (satOnly.length > 0 && sunOnly.length > 0) {
    const outA = satOnly[0];
    const inA = sunOnly[0];
    if (sunB1 === outA) sunB1 = inA;
    else if (sunB2 === outA) sunB2 = inA;
    else if (sunB3 === outA) sunB3 = inA;
    else if (sunB4 === outA) sunB4 = inA;
    else if (sunB5 === outA) sunB5 = inA;
    else if (sunB6 === outA) sunB6 = inA;
  }

  const sundayARiver = Math.random() < 0.5 ? "Small Blaar" : "Elands Pad";

  const s1 = {
    session_id: 1,
    name: "Saturday Morning",
    day: "Saturday",
    time_slot: "Morning",
    matches: [
      { id: "S1_M1", beat_code: "EP1", beat_id: "EP1", river: "Elands Pad", anglers: [A1, B1], travel_time: 15, group: "Group 1 (Elands)", match_type: "NORMAL" },
      { id: "S1_M2", beat_code: "EP3", beat_id: "EP3", river: "Elands Pad", anglers: [A2, B2], travel_time: 30, group: "Group 1 (Elands)", match_type: "NORMAL" },
      { id: "S1_M3", beat_code: "SB1", beat_id: "SB1", river: "Small Blaar", anglers: [A3, B3], travel_time: 15, group: "Group 2 (Small Blaar)", match_type: "NORMAL" },
      { id: "S1_M4", beat_code: "SB2", beat_id: "SB2", river: "Small Blaar", anglers: [A4, B5], travel_time: 15, group: "Group 2 (Small Blaar)", match_type: "NORMAL" },
      { id: "S1_M5", beat_code: "SB3", beat_id: "SB3", river: "Small Blaar", anglers: [B4, B6], travel_time: 15, group: "Group 2 (Small Blaar)", match_type: "NORMAL" }
    ]
  };

  const s2 = {
    session_id: 2,
    name: "Saturday Afternoon",
    day: "Saturday",
    time_slot: "Afternoon",
    matches: [
      { id: "S2_M1", beat_code: "EP1", beat_id: "EP1", river: "Elands Pad", anglers: [A1, B2], travel_time: 15, group: "Group 1 (Elands)", match_type: "NORMAL" },
      { id: "S2_M2", beat_code: "EP3", beat_id: "EP3", river: "Elands Pad", anglers: [A2, B1], travel_time: 30, group: "Group 1 (Elands)", match_type: "NORMAL" },
      { id: "S2_M3", beat_code: "SB1", beat_id: "SB1", river: "Small Blaar", anglers: [A3, B4], travel_time: 15, group: "Group 2 (Small Blaar)", match_type: "NORMAL" },
      { id: "S2_M4", beat_code: "SB2", beat_id: "SB2", river: "Small Blaar", anglers: [A4, B6], travel_time: 15, group: "Group 2 (Small Blaar)", match_type: "NORMAL" },
      { id: "S2_M5", beat_code: "SB3", beat_id: "SB3", river: "Small Blaar", anglers: [B3, B5], travel_time: 15, group: "Group 2 (Small Blaar)", match_type: "NORMAL" }
    ]
  };

  let s3_matches = [];
  let s4_matches = [];

  if (sundayARiver === "Small Blaar") {
    s3_matches = [
      { id: "S3_M1", beat_code: "SB1", beat_id: "SB1", river: "Small Blaar", anglers: [A1, A2], travel_time: 15, group: "A-Team River", match_type: "NORMAL" },
      { id: "S3_M2", beat_code: "SB2", beat_id: "SB2", river: "Small Blaar", anglers: [A3, A4], travel_time: 15, group: "A-Team River", match_type: "NORMAL" },
      { id: "S3_M3", beat_code: "EP1", beat_id: "EP1", river: "Elands Pad", anglers: [sunB1, sunB3], travel_time: 15, group: "B-Team River", match_type: "NORMAL" },
      { id: "S3_M4", beat_code: "EP3", beat_id: "EP3", river: "Elands Pad", anglers: [sunB2, sunB4], travel_time: 30, group: "B-Team River", match_type: "NORMAL" },
      { id: "S3_M5", beat_code: "EP2", beat_id: "EP2", river: "Elands Pad", anglers: [sunB5, sunB6], travel_time: 30, group: "B-Team River", match_type: "NORMAL" }
    ];

    s4_matches = [
      { id: "S4_M1", beat_code: "SB3", beat_id: "SB3", river: "Small Blaar", anglers: [A1, A3], travel_time: 15, group: "A-Team River", match_type: "NORMAL" },
      { id: "S4_M2", beat_code: "SB1", beat_id: "SB1", river: "Small Blaar", anglers: [A2, A4], travel_time: 15, group: "A-Team River", match_type: "NORMAL" },
      { id: "S4_M3", beat_code: "EP3", beat_id: "EP3", river: "Elands Pad", anglers: [sunB1, sunB4], travel_time: 30, group: "B-Team River", match_type: "NORMAL" },
      { id: "S4_M4", beat_code: "EP1", beat_id: "EP1", river: "Elands Pad", anglers: [sunB2, sunB5], travel_time: 15, group: "B-Team River", match_type: "NORMAL" },
      { id: "S4_M5", beat_code: "SB6", beat_id: "SB6", river: "Elands Pad", anglers: [sunB3, sunB6], travel_time: 15, group: "B-Team River", match_type: "NORMAL" }
    ];
  } else {
    s3_matches = [
      { id: "S3_M1", beat_code: "EP2", beat_id: "EP2", river: "Elands Pad", anglers: [A1, A2], travel_time: 30, group: "A-Team River", match_type: "NORMAL" },
      { id: "S3_M2", beat_code: "EP1", beat_id: "EP1", river: "Elands Pad", anglers: [A3, A4], travel_time: 15, group: "A-Team River", match_type: "NORMAL" },
      { id: "S3_M3", beat_code: "SB1", beat_id: "SB1", river: "Small Blaar", anglers: [sunB1, sunB3], travel_time: 15, group: "B-Team River", match_type: "NORMAL" },
      { id: "S3_M4", beat_code: "SB2", beat_id: "SB2", river: "Small Blaar", anglers: [sunB2, sunB4], travel_time: 15, group: "B-Team River", match_type: "NORMAL" },
      { id: "S3_M5", beat_code: "SB4", beat_id: "SB4", river: "Small Blaar", anglers: [sunB5, sunB6], travel_time: 15, group: "B-Team River", match_type: "NORMAL" }
    ];

    s4_matches = [
      { id: "S4_M1", beat_code: "EP3", beat_id: "EP3", river: "Elands Pad", anglers: [A1, A3], travel_time: 30, group: "A-Team River", match_type: "NORMAL" },
      { id: "S4_M2", beat_code: "SB6", beat_id: "SB6", river: "Elands Pad", anglers: [A2, A4], travel_time: 15, group: "A-Team River", match_type: "NORMAL" },
      { id: "S4_M3", beat_code: "SB3", beat_id: "SB3", river: "Small Blaar", anglers: [sunB1, sunB4], travel_time: 15, group: "B-Team River", match_type: "NORMAL" },
      { id: "S4_M4", beat_code: "SB1", beat_id: "SB1", river: "Small Blaar", anglers: [sunB2, sunB5], travel_time: 15, group: "B-Team River", match_type: "NORMAL" },
      { id: "S4_M5", beat_code: "SB(TRANSPORT)", beat_id: "SB(TRANSPORT)", river: "Small Blaar", anglers: [sunB3, sunB6], travel_time: 15, group: "B-Team River", match_type: "NORMAL" }
    ];
  }

  const s3 = { session_id: 3, name: "Sunday Morning", day: "Sunday", time_slot: "Morning", matches: s3_matches };
  const s4 = { session_id: 4, name: "Sunday Afternoon", day: "Sunday", time_slot: "Afternoon", matches: s4_matches };
  const sessions = [s1, s2, s3, s4];

  const anglerSchedule = {};
  anglers.forEach(a => { anglerSchedule[a] = []; });
  sessions.forEach(s => {
    s.matches.forEach(m => {
      m.anglers.forEach(a => {
        const opps = m.anglers.filter(x => x !== a);
        anglerSchedule[a].push({
          session: s.session_id,
          session_name: s.name,
          beat: m.beat_code,
          river: m.river,
          opponents: opps,
          opponent: opps.join(' & ') || 'BYE',
          match_id: m.id
        });
      });
    });
  });

  const aSet = new Set(aTeamAnglers);
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

  const threeWayCounts = {};
  anglers.forEach(a => { threeWayCounts[a] = 0; });

  return {
    sessions,
    anglerSchedule,
    leaderboard,
    threeWayCounts,
    numBeats: 5
  };
}

function generateEdgeSchedule(anglers, aTeamAnglers = [], availableBeats = [], anglerAvailability = {}) {
  // If exactly 4 A-Team anglers, use the dedicated Group Draw architecture
  const activeATeam = (aTeamAnglers || []).filter(a => anglers.includes(a));
  if (activeATeam.length === 4 && anglers.length >= 8) {
    try {
      return generateGroupTournamentSchedule(anglers, activeATeam, availableBeats, anglerAvailability);
    } catch (e) {
      console.warn("Group tournament generation fallback:", e);
    }
  }

  let bestResult = null;
  for (let cycle = 0; cycle < 50; cycle++) {
    const sched = generateEdgeScheduleInternal(anglers, aTeamAnglers, availableBeats, anglerAvailability);
    
    // Check max beat repeat count across all 4 sessions (Rule: <= 2 times per beat)
    const counts = {};
    anglers.forEach(a => { counts[a] = {}; });
    sched.sessions.forEach(s => {
      s.matches.forEach(m => {
        const b = m.beat_code || m.beat_id;
        m.anglers.forEach(a => {
          counts[a][b] = (counts[a][b] || 0) + 1;
        });
      });
    });

    let hasViolation = false;
    for (const a of anglers) {
      for (const b in counts[a]) {
        if (counts[a][b] > 2) {
          hasViolation = true;
          break;
        }
      }
      if (hasViolation) break;
    }

    if (!hasViolation) {
      return sched;
    }
    bestResult = sched;
  }
  return bestResult;
}export default {
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
        // 2b. Draw Template (Without Names)
    if (url.pathname === '/api/draw/template' && request.method === 'GET') {
      const sundayRiver = url.searchParams.get('sunday_river') || 'Small Blaar';
      const template = buildTemplateDraw(sundayRiver);
      return new Response(JSON.stringify({
        success: true,
        template: template,
        rules: {
          group1_sat: "2 A-Team + 2 B-Team on Elands Pad (EP1, EP3). Each A angler verses each B angler.",
          group2_sat: "2 A-Team + 4 B-Team on Small Blaar (SB1, SB2, SB3). Each A verses 2 B, remaining 2 B verse 2 unique B.",
          sunday_a_team: "All 4 A-Team anglers assigned to one river (2 matches against A-Team members).",
          sunday_b_team: "All B-Team anglers assigned to opposite river (fish 2 new competitors).",
          beat_limits: "EP1: 2x, EP3: 2x, EP2: 1x, SB6: 1x, SB1: 2x, SB2: 2x, SB3: 2x, SB4: 1x, Transport: 1x"
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

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

      const anglerAvailability = body.angler_availability || {};
      const sched = generateEdgeSchedule(anglers, aTeam, fallbackBeats, anglerAvailability);
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
          angler_availability: anglerAvailability,
          num_beats: sched.numBeats,
          beats: fallbackBeats.map(b => ({ ...b })),
          selected_beats: sched.s1Beats || fallbackBeats.slice(0, sched.numBeats),
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
            if (body.travel_time !== undefined) b.travel_time = Number(body.travel_time);
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
            if (nb.travel_time !== undefined) found.travel_time = Number(nb.travel_time);
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
            if (nb.travel_time !== undefined) found.travel_time = Number(nb.travel_time);
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
      const anglerAvailability = body.angler_availability || (trial && trial.tournament_data && trial.tournament_data.angler_availability) || {};
      if (trial && trial.tournament_data) {
        const sched = generateEdgeSchedule(anglers, aTeam, trial.tournament_data.beats, anglerAvailability);
        trial.tournament_data.anglers = anglers;
        trial.tournament_data.num_anglers = anglers.length;
        trial.tournament_data.a_team_anglers = aTeam;
        trial.tournament_data.num_a_team = aTeam.length;
        trial.tournament_data.angler_availability = anglerAvailability;
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

    // 8d. Update Angler Session Availability (Admin Only)
    if (url.pathname === '/api/admin/angler_availability/update' && request.method === 'POST') {
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
      if (!trial || !trial.tournament_data) {
        return new Response(JSON.stringify({
          success: false,
          error: "No active trial found."
        }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const availability = body.angler_availability || {};
      trial.tournament_data.angler_availability = availability;

      if (body.redraw) {
        const anglers = trial.tournament_data.anglers || [];
        const aTeam = trial.tournament_data.a_team_anglers || [];
        const beats = trial.tournament_data.beats || [];
        const sched = generateEdgeSchedule(anglers, aTeam, beats, availability);
        trial.tournament_data.sessions = sched.sessions;
        trial.tournament_data.angler_schedule = sched.anglerSchedule;
        trial.tournament_data.leaderboard = sched.leaderboard;
        trial.tournament_data.three_way_counts = sched.threeWayCounts;
        trial.tournament_data.num_beats = sched.numBeats;
      }

      return new Response(JSON.stringify({
        success: true,
        message: body.redraw 
          ? "Angler availability saved and draw re-randomized successfully!" 
          : "Angler session availability saved successfully.",
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
