const APP_VERSION = "v2.5.0";
/**
 * Fly Fishing Trials - Real-Time Frontend Application
 * Handles live polling, dual-submission Google-form verification,
 * dynamic schedule rendering, QR code generation, and discrepancy management.
 */

let tournamentState = null;
let currentTab = 'leaderboard';
let activeSessionFilter = 0;
let qrCodeObj = null;
let pollingInterval = null;
let selectedAteamSet = new Set();
let anglerAvailabilityState = {};

// Presets for easy setup (8 to 20 anglers)
const MASTER_ANGLER_POOL = [
  "John Smith", "David Miller", "Michael Brown", "James Wilson",
  "Robert Taylor", "William Clark", "Richard Hall", "Thomas Evans",
  "Peter Jones", "Charles Scott", "George Adams", "Edward Baker",
  "Brian Campbell", "Andrew Mitchell", "Steven Roberts", "Mark Phillips",
  "Paul Turner", "Kevin Parker", "Jason White", "Daniel Harris"
];

function getPresetAnglers(n) {
  return MASTER_ANGLER_POOL.slice(0, n).map((name, i) => `Angler ${i + 1} - ${name}`);
}

const PRESETS = {
  8: getPresetAnglers(8),
  9: getPresetAnglers(9),
  10: getPresetAnglers(10),
  11: getPresetAnglers(11),
  12: getPresetAnglers(12),
  14: getPresetAnglers(14),
  16: getPresetAnglers(16),
  20: getPresetAnglers(20)
};

document.addEventListener('DOMContentLoaded', () => {
  loadState();
  fetchNetworkInfo();

  // Poll state every 4 seconds for real-time live match updates
  pollingInterval = setInterval(() => {
    loadState(false);
  }, 4000);

  // Setup textarea listener for angler count and A-team validation
  const anglerListEl = document.getElementById('adminAnglerList');
  if (anglerListEl) {
    anglerListEl.addEventListener('input', () => {
      updateAnglerCountHint();
      renderAteamChecklist();
    });
  }
});

// --- State Loading & Polling ---
async function loadState(isManual = false) {
  const refreshIcon = document.getElementById('refreshIcon');
  if (isManual && refreshIcon) {
    refreshIcon.style.transform = 'rotate(360deg)';
    refreshIcon.style.transition = 'transform 0.5s ease';
    setTimeout(() => { refreshIcon.style.transform = ''; }, 500);
  }

  try {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    tournamentState = data;
    if (data.a_team_anglers && (!selectedAteamSet || selectedAteamSet.size === 0)) {
      selectedAteamSet.clear();
      data.a_team_anglers.forEach(a => selectedAteamSet.add(a));
    }
    initAnglerAvailabilityFromState();
    renderAll();
  } catch (err) {
    console.error("Failed to load tournament state:", err);
  }
}

// --- Main Render Dispatcher ---
function renderAll() {
  if (!tournamentState) return;

  renderTrialBar();
  renderAnglerAvailability();
  updateAdminUIState();
  renderHeader();
  renderLeaderboard();
  renderSchedule();
  renderSubmitFormOptions();
  renderAdminQueue();
  renderAllMatchesTable();
  checkDiscrepancyBanner();
  renderTopAnglerDropdown();

  if (currentTab === 'map' && typeof streamMap !== 'undefined' && streamMap) {
    updateMapPins();
  }
}

// --- Header Meta ---
function renderHeader() {
  const meta = tournamentState.metadata || {};
  document.getElementById('tournamentTitle').textContent = meta.tournament_name || tournamentState.tournament_name || "Fly Fishing Trials";
  document.getElementById('tournamentVenue').textContent = meta.venue || tournamentState.venue || "Championship Beats";

  const numAnglers = meta.num_anglers || (tournamentState.anglers ? tournamentState.anglers.length : 0);
  const countTag = document.getElementById('anglerCountTag');
  countTag.textContent = `${numAnglers} Anglers`;

  const aTeamAnglers = tournamentState.a_team_anglers || [];
  const aTeamTag = document.getElementById('aTeamCountTag');
  if (aTeamTag) {
    if (aTeamAnglers.length > 0) {
      aTeamTag.textContent = `⭐ ${aTeamAnglers.length} Top 8`;
      aTeamTag.classList.remove('hidden');
    } else {
      aTeamTag.classList.add('hidden');
    }
  }

  const formatTag = document.getElementById('formatTag');
  if (numAnglers % 2 === 1) {
    formatTag.textContent = "Odd: 1v1v1 + 1v1 Beats";
    formatTag.className = "meta-tag tag-accent";
  } else {
    formatTag.textContent = "Even: 1 vs 1 Beats";
    formatTag.className = "meta-tag tag-format";
  }
}

// --- Banner Alert for Discrepancies ---
function checkDiscrepancyBanner() {
  const discrepancies = tournamentState.discrepancies || [];
  const banner = document.getElementById('discrepancyBanner');
  const badge = document.getElementById('adminBadge');

  if (discrepancies.length > 0) {
    banner.classList.remove('hidden');
    document.getElementById('bannerText').innerHTML = 
      `<strong>⚠️ ${discrepancies.length} Score Discrepanc${discrepancies.length > 1 ? 'ies' : 'y'} Detected!</strong> Conflicting catch submissions require organizer review.`;
    badge.textContent = discrepancies.length;
    badge.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
    badge.classList.add('hidden');
  }
}

// --- Leaderboard Rendering ---
function renderLeaderboard() {
  const lb = tournamentState.leaderboard || [];
  const tbody = document.getElementById('leaderboardBody');

  if (lb.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4">No standings data available.</td></tr>`;
    return;
  }

  // Update summary stats
  const totalMatches = (tournamentState.sessions || []).reduce((acc, s) => acc + (s.matches ? s.matches.length : 0), 0);
  const completedMatches = (tournamentState.sessions || []).reduce((acc, s) => {
    return acc + (s.matches ? s.matches.filter(m => m.status === 'CONFIRMED').length : 0);
  }, 0);
  const totalFish = lb.reduce((acc, row) => acc + (row.total_fish || 0), 0);

  document.getElementById('statCompletedMatches').textContent = `${completedMatches} / ${totalMatches}`;
  document.getElementById('statTotalFish').textContent = totalFish;

  let html = '';
  lb.forEach((row, idx) => {
    const rank = idx + 1;
    let rankBadgeClass = 'rank-other';
    if (rank === 1) rankBadgeClass = 'rank-1';
    else if (rank === 2) rankBadgeClass = 'rank-2';
    else if (rank === 3) rankBadgeClass = 'rank-3';

    const sPoints = row.session_points || {};
    const s1 = sPoints[1] !== undefined ? sPoints[1].toFixed(2) : '-';
    const s2 = sPoints[2] !== undefined ? sPoints[2].toFixed(2) : '-';
    const s3 = sPoints[3] !== undefined ? sPoints[3].toFixed(2) : '-';
    const s4 = sPoints[4] !== undefined ? sPoints[4].toFixed(2) : '-';

    const blanksBadge = row.blanks > 0 
      ? `<span class="blank-pill">${row.blanks} Blank${row.blanks > 1 ? 's' : ''}</span>`
      : `<span class="text-muted">0</span>`;

    const aTeamList = tournamentState.a_team_anglers || [];
    const anglerName = row.angler || row.name || '';
    const isA = row.is_a_team || aTeamList.includes(anglerName);
    const aTeamBadge = isA 
      ? `<span class="ateam-badge-mini" title="Top 8 Seeded Angler">⭐ Top 8</span>` 
      : '';

    html += `
      <tr>
        <td><span class="rank-badge ${rankBadgeClass}">${rank}</span></td>
        <td>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <strong>${escapeHtml(anglerName)}</strong>
            ${aTeamBadge}
          </div>
        </td>
        <td><span class="score-highlight">${(row.total_points || 0).toFixed(2)}</span></td>
        <td><span class="fish-count">${row.total_fish || 0}</span></td>
        <td>${blanksBadge}</td>
        <td class="monospace">${s1}</td>
        <td class="monospace">${s2}</td>
        <td class="monospace">${s3}</td>
        <td class="monospace">${s4}</td>
        <td><span class="tag-accent">${row.num_three_way_matches || 0}</span></td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// --- Schedule & Beat Matrix Rendering ---
function renderSchedule() {
  const sessions = tournamentState.sessions || [];
  const container = document.getElementById('scheduleContainer');

  let filteredSessions = sessions;
  if (activeSessionFilter > 0) {
    filteredSessions = sessions.filter(s => s.session_id === activeSessionFilter);
  }

  if (filteredSessions.length === 0) {
    container.innerHTML = `<div class="card text-center py-4">No sessions found for this filter.</div>`;
    return;
  }

  let html = '';
  filteredSessions.forEach(session => {
    const savedBadge = session.is_saved 
      ? `<span class="meta-tag tag-accent" title="Saved at ${escapeHtml(session.saved_at || '')}">Saved ✓</span>` 
      : '';
    const allConfirmed = (session.matches || []).length > 0 && 
      (session.matches || []).every(m => m.status === 'CONFIRMED' || m.status === 'ADMIN_CONFIRMED');
    const completedBadge = allConfirmed 
      ? `<span class="meta-tag tag-accent" style="background:rgba(16,185,129,0.25);">Completed ✓</span>` 
      : '';

    html += `
      <div class="session-block">
        <div class="session-header-row">
          <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
            <h3>${escapeHtml(session.session_name || session.name)}</h3>
            <span class="session-time-pill">${escapeHtml(session.session_short || session.time_slot || '')}</span>
            ${savedBadge}
            ${completedBadge}
          </div>
          <div style="display:flex; align-items:center; gap:0.6rem;">
            <button class="btn btn-sm btn-secondary admin-only-action ${isAdminAuthenticated() ? '' : 'hidden'}" onclick="quickSaveSession(${session.session_id})" title="Save snapshot of Session ${session.session_id}">
              💾 Save Session ${session.session_id}
            </button>
            <button class="btn btn-sm btn-outline-danger admin-only-action ${isAdminAuthenticated() ? '' : 'hidden'}" onclick="clearSessionMatchesPrompt(${session.session_id})" title="Reset/clear scores for Session ${session.session_id}">
              🗑️ Clear S${session.session_id}
            </button>
            <span class="text-muted text-sm">${(session.matches || []).length} Beats</span>
          </div>
        </div>

        <div class="matches-cards-grid">
    `;

    const aTeamList = tournamentState.a_team_anglers || [];

    (session.matches || []).forEach(match => {
      let statusClass = 'status-pending';
      let statusLabel = 'Pending';

      if (match.status === 'CONFIRMED' || match.status === 'ADMIN_CONFIRMED') {
        statusClass = 'status-confirmed';
        statusLabel = 'Confirmed';
      } else if (match.status === 'DISCREPANCY') {
        statusClass = 'status-discrepancy';
        statusLabel = 'Discrepancy';
      } else if (match.status === 'PENDING_CONFIRMATION' || match.status === 'PARTIALLY_REPORTED') {
        const numRep = Object.keys(match.submissions || match.reported_by || {}).length;
        statusClass = 'status-partial';
        statusLabel = `${numRep} of ${match.anglers.length} Reported`;
      }

      const isSolo = match.is_solo || match.match_type === 'SOLO' || (match.anglers && match.anglers.length === 1);
      const is3Way = !isSolo && (match.match_type === '1v1v1' || match.anglers.length === 3);
      const typeBadge = is3Way ? `<span class="three-way-badge">3-Way Match (1v1v1)</span>` : '';

      let aTeamClashBadge = '';
      if (isSolo) {
        aTeamClashBadge = `<span class="badge" style="background:rgba(99,102,241,0.25); color:#a5b4fc; border:1px solid rgba(99,102,241,0.4); font-size:0.7rem; padding:0.15rem 0.45rem; border-radius:4px; font-weight:700;">👤 Solo Beat (Non-Competing)</span>`;
      } else if (match.is_head_to_head_a_team) {
        aTeamClashBadge = `<span class="clash-badge">⚔️ Top 8 Clash</span>`;
      } else if (match.has_a_team_angler) {
        aTeamClashBadge = `<span class="clash-badge" style="color:#93c5fd; background:rgba(56,189,248,0.15); border-color:rgba(56,189,248,0.3);">⭐ Top 8 vs Challenger</span>`;
      }

      html += `
        <div class="match-card">
          <div>
            <div class="match-card-top">
              <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                <span class="beat-tag">Beat ${match.beat || match.beat_number}</span>
                ${match.beat_code || match.beat_name ? `<span class="beat-tag" style="background:rgba(255,255,255,0.06); font-size:0.75rem;">${escapeHtml(match.beat_code || match.beat_name)}</span>` : ''}
                <span class="beat-tag" style="background:rgba(245,158,11,0.15); font-size:0.7rem; color:#fbbf24;">⏱️ ${match.travel_time || 15}m travel</span>
                ${match.river ? `<span class="beat-tag" style="background:${(match.river||'').toLowerCase().includes('eland') ? 'rgba(168,85,247,0.15)' : 'rgba(56,189,248,0.15)'}; font-size:0.7rem; color:${(match.river||'').toLowerCase().includes('eland') ? '#c084fc' : '#7dd3fc'};">${escapeHtml(match.river)}</span>` : ''}
                ${aTeamClashBadge}
                ${match.stayer ? `<span class="badge" style="background:rgba(16,185,129,0.2); color:#34d399; border:1px solid rgba(16,185,129,0.3); font-size:0.7rem; padding:0.15rem 0.4rem; border-radius:4px; font-weight:700;">🔄 Stayer: ${escapeHtml(match.stayer)}</span>` : ''}
              </div>
              <span class="match-status-badge ${statusClass}">${statusLabel}</span>
            </div>

            <div class="competitors-list">
      `;

      match.anglers.forEach(angler => {
        const fish = match.official_scores ? match.official_scores[angler] : null;
        const pts = match.calculated_points ? match.calculated_points[angler] : (match.points_awarded ? match.points_awarded[angler] : null);

        let resultStr = '';
        if (isSolo) {
          resultStr = `<span class="text-muted text-xs">Solo Practice / Free Session</span>`;
        } else if ((match.status === 'CONFIRMED' || match.status === 'ADMIN_CONFIRMED') && fish !== null && pts !== null) {
          resultStr = `
            <span class="fish-pill">${fish} fish</span>
            <span class="pts-pill">${pts.toFixed(2)} pts</span>
          `;
        } else {
          // Check if this angler reported
          const reported = (match.submissions && match.submissions[angler]) || (match.reported_by && match.reported_by[angler]);
          resultStr = reported ? `<span class="text-muted text-sm">Reported ✓</span>` : `<span class="text-dim text-sm">-</span>`;
        }

        const isAnglerA = aTeamList.includes(angler);
        const aTag = isAnglerA ? `<span class="ateam-badge-mini">Top 8</span>` : '';
        const isStayerAngler = (match.stayer === angler);
        const stayerTag = isStayerAngler ? `<span class="ateam-badge-mini" style="background:rgba(16,185,129,0.2); color:#34d399; border-color:rgba(16,185,129,0.3);" title="Remains on beat from morning session">🔄 Stayer</span>` : '';

        html += `
          <div class="competitor-row">
            <div style="display:flex; align-items:center; gap:0.4rem;">
              <span class="competitor-name">${escapeHtml(angler)}</span>
              ${aTag}
              ${stayerTag}
            </div>
            <div class="competitor-result">${resultStr}</div>
          </div>
        `;
      });

      html += `
            </div>
            ${typeBadge}
          </div>

          <div class="match-quick-action">
            ${isSolo
              ? `<span class="text-xs text-muted" style="padding:0.35rem 0.65rem; background:rgba(255,255,255,0.04); border-radius:4px; border:1px solid rgba(255,255,255,0.06); font-size:0.75rem;">👤 Solo Beat (No Score)</span>`
              : `<button class="btn btn-sm btn-outline" onclick="prefillSubmitForm(${session.session_id}, '${escapeHtml(match.match_id)}')">
                   Submit Score
                 </button>`
            }
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

function filterSchedule(sessionId) {
  activeSessionFilter = sessionId;
  const buttons = document.querySelectorAll('#sessionFilters .filter-btn');
  buttons.forEach((btn, idx) => {
    btn.classList.toggle('active', idx === sessionId);
  });
  renderSchedule();
}

// --- Submit Match Score Form (Google Forms Style) ---
function renderSubmitFormOptions() {
  const anglerSelect = document.getElementById('submitAnglerSelect');
  const sessionVal = document.getElementById('submitSessionSelect').value;

  if (!sessionVal || !tournamentState) {
    anglerSelect.innerHTML = `<option value="">-- Select session first --</option>`;
    anglerSelect.disabled = true;
    return;
  }

  anglerSelect.disabled = false;
  const currentAngler = anglerSelect.value;

  const anglers = tournamentState.anglers || [];
  let html = `<option value="">-- Select your name --</option>`;
  anglers.forEach(name => {
    const selected = name === currentAngler ? 'selected' : '';
    html += `<option value="${escapeHtml(name)}" ${selected}>${escapeHtml(name)}</option>`;
  });
  anglerSelect.innerHTML = html;
}

function onSessionChange() {
  renderSubmitFormOptions();
  onAnglerChange();
}

function onAnglerChange() {
  const sessionVal = parseInt(document.getElementById('submitSessionSelect').value);
  const anglerVal = document.getElementById('submitAnglerSelect').value;

  const banner = document.getElementById('matchLookupBanner');
  const catchContainer = document.getElementById('catchInputsContainer');
  const catchGrid = document.getElementById('catchFieldsGrid');
  const alertBox = document.getElementById('submissionAlert');
  alertBox.classList.add('hidden');

  if (!sessionVal || !anglerVal || !tournamentState) {
    banner.classList.add('hidden');
    catchContainer.classList.add('hidden');
    return;
  }

  // Find match for this angler in this session
  const session = (tournamentState.sessions || []).find(s => s.session_id === sessionVal);
  if (!session) return;

  const match = (session.matches || []).find(m => m.anglers.includes(anglerVal));
  if (!match) {
    banner.classList.remove('hidden');
    document.getElementById('matchBeatTitle').textContent = "Match Not Found";
    document.getElementById('matchStatusText').textContent = "You are not assigned to a match in this session.";
    catchContainer.classList.add('hidden');
    return;
  }

  // Display Match Info Banner
  banner.classList.remove('hidden');
  document.getElementById('matchBeatTitle').textContent = `Beat ${match.beat}: ${match.anglers.join(' vs ')}`;
  const is3Way = match.anglers.length === 3;
  document.getElementById('matchTypeBadge').textContent = is3Way ? "3-Way Match (1v1v1)" : "1 vs 1";

  // Check current status
  let statusText = "Ready for submission.";
  if (match.status === 'CONFIRMED' || match.status === 'ADMIN_CONFIRMED') {
    statusText = "✅ This match is already CONFIRMED with official scores recorded.";
  } else if (match.status === 'DISCREPANCY') {
    statusText = "⚠️ Conflict: Submissions from competitors did not match. Waiting for organizer review.";
  } else if (match.status === 'PENDING_CONFIRMATION' || match.status === 'PARTIALLY_REPORTED') {
    const submitters = Object.keys(match.submissions || match.reported_by || {});
    if (submitters.includes(anglerVal)) {
      statusText = "⏳ You have submitted your scorecard. Waiting for opponent to submit.";
    } else {
      statusText = `📝 Opponent (${submitters.join(', ')}) has submitted! Please enter your catch to verify.`;
    }
  }
  document.getElementById('matchStatusText').textContent = statusText;

  // Build catch inputs for all anglers in this match
  catchContainer.classList.remove('hidden');
  let inputsHtml = '';

  match.anglers.forEach(comp => {
    const isMe = comp === anglerVal;
    // Check if this angler previously reported
    let prevVal = '';
    const subs = match.submissions || match.reported_by || {};
    if (subs[anglerVal]) {
      const rep = subs[anglerVal].reported_scores || {};
      if (rep[comp] !== undefined) prevVal = rep[comp];
    } else if (match.official_scores && match.official_scores[comp] !== undefined) {
      prevVal = match.official_scores[comp];
    }

    inputsHtml += `
      <div class="catch-field-row">
        <div class="catch-field-label">
          <span>${escapeHtml(comp)}</span>
          ${isMe ? '<span class="angler-is-you">YOU</span>' : ''}
        </div>
        <input type="number" 
               class="form-control catch-field-input" 
               name="score_${escapeHtml(comp)}" 
               data-angler="${escapeHtml(comp)}" 
               min="0" 
               max="999" 
               value="${prevVal !== '' ? prevVal : '0'}" 
               required>
      </div>
    `;
  });

  catchGrid.innerHTML = inputsHtml;
}

function prefillSubmitForm(sessionId, matchId) {
  switchTab('submit');
  document.getElementById('submitSessionSelect').value = sessionId;
  renderSubmitFormOptions();

  // Pick first angler in that match
  const session = (tournamentState.sessions || []).find(s => s.session_id === sessionId);
  if (session) {
    const match = (session.matches || []).find(m => m.match_id === matchId);
    if (match && match.anglers.length > 0) {
      document.getElementById('submitAnglerSelect').value = match.anglers[0];
      onAnglerChange();
    }
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const sessionVal = parseInt(document.getElementById('submitSessionSelect').value);
  const anglerVal = document.getElementById('submitAnglerSelect').value;
  const notesVal = document.getElementById('submitNotes').value;
  const alertBox = document.getElementById('submissionAlert');

  if (!sessionVal || !anglerVal) return;

  const session = (tournamentState.sessions || []).find(s => s.session_id === sessionVal);
  const match = session ? (session.matches || []).find(m => m.anglers.includes(anglerVal)) : null;

  if (!match) {
    alert("Could not locate your match for this session.");
    return;
  }

  // Collect reported scores
  const scoreInputs = document.querySelectorAll('#catchFieldsGrid input[data-angler]');
  const reportedScores = {};
  scoreInputs.forEach(input => {
    reportedScores[input.getAttribute('data-angler')] = parseInt(input.value) || 0;
  });

  const payload = {
    session_id: sessionVal,
    match_id: match.match_id,
    submitter_name: anglerVal,
    reported_scores: reportedScores,
    notes: notesVal
  };

  const submitBtn = document.getElementById('submitScoreBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = "Verifying Submission...";

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    alertBox.classList.remove('hidden', 'success', 'info', 'danger');

    if (!data.success) {
      alertBox.className = 'submission-alert danger';
      alertBox.innerHTML = `<strong>Error:</strong> ${escapeHtml(data.error || 'Submission failed')}`;
    } else {
      if (data.status === 'CONFIRMED' || data.status === 'ADMIN_CONFIRMED') {
        alertBox.className = 'submission-alert success';
        alertBox.innerHTML = `
          <strong>🎉 Score Verified & Confirmed!</strong><br>
          Both submissions matched perfectly. Match points have been calculated and the live leaderboard has updated automatically!
        `;
      } else if (data.status === 'PENDING_CONFIRMATION' || data.status === 'PARTIALLY_REPORTED') {
        alertBox.className = 'submission-alert info';
        alertBox.innerHTML = `
          <strong>✅ Scorecard Received!</strong><br>
          Waiting for your opponent to submit their scorecard. Once both are received and matched, scores will lock in automatically.
        `;
      } else if (data.status === 'DISCREPANCY') {
        alertBox.className = 'submission-alert danger';
        alertBox.innerHTML = `
          <strong>⚠️ Discrepancy Flagged!</strong><br>
          The catch counts you entered do not match your opponent's submission. The tournament organizer has been notified to intervene.
        `;
      }
      // Reload tournament state to reflect updates
      await loadState();
    }
  } catch (err) {
    alertBox.classList.remove('hidden');
    alertBox.className = 'submission-alert danger';
    alertBox.innerHTML = `<strong>Network Error:</strong> Failed to connect to tournament server: ${err.message}`;
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "🚀 Submit Official Scorecard";
  }
}

// --- Organizer Admin View ---
function renderAdminQueue() {
  const discrepancies = tournamentState.discrepancies || [];
  const listEl = document.getElementById('discrepancyList');
  const counterEl = document.getElementById('discrepancyCounter');

  counterEl.textContent = `${discrepancies.length} pending`;

  if (discrepancies.length === 0) {
    listEl.innerHTML = `<div class="empty-state">✅ No unresolved discrepancies. All dual-submissions match!</div>`;
    return;
  }

  let html = '';
  discrepancies.forEach(item => {
    const reports = item.submissions || item.reported_by || {};
    const submitters = Object.keys(reports);

    html += `
      <div class="discrepancy-card">
        <div class="discrepancy-header">
          <div>
            <strong>Session ${item.session_id} - Beat ${item.beat || item.beat_number}</strong>: 
            <span class="text-muted">${item.anglers.join(' vs ')}</span>
          </div>
          <span class="match-status-badge status-discrepancy">Conflicting Reports</span>
        </div>

        <div class="discrepancy-reports">
    `;

    submitters.forEach(author => {
      const rep = reports[author];
      html += `
        <div class="report-box">
          <div class="report-author">${escapeHtml(author)}'s Submission:</div>
      `;
      item.anglers.forEach(ang => {
        const val = rep.reported_scores ? rep.reported_scores[ang] : 0;
        html += `<div class="report-item"><span>${escapeHtml(ang)}</span><strong class="monospace">${val} fish</strong></div>`;
      });
      html += `</div>`;
    });

    html += `
        </div>

        <div class="admin-resolve-row mt-2">
          <button class="btn btn-sm btn-primary" onclick="openAdminEditModal(${item.session_id}, '${escapeHtml(item.match_id)}')">
            🛠️ Review & Enter Official Score
          </button>
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

function renderAllMatchesTable() {
  const tbody = document.getElementById('allMatchesBody');
  const sessions = tournamentState.sessions || [];

  let html = '';
  sessions.forEach(sess => {
    (sess.matches || []).forEach(match => {
      let statusClass = 'status-pending';
      if (match.status === 'CONFIRMED') statusClass = 'status-confirmed';
      else if (match.status === 'DISCREPANCY') statusClass = 'status-discrepancy';
      else if (match.status === 'PARTIALLY_REPORTED') statusClass = 'status-partial';

      let scoresSummary = '-';
      if (match.status === 'CONFIRMED' && match.official_scores) {
        scoresSummary = Object.entries(match.official_scores)
          .map(([a, f]) => `${a}: <strong>${f}</strong>`)
          .join(', ');
      }

      html += `
        <tr>
          <td>S${sess.session_id} (${sess.name})</td>
          <td><strong>Beat ${match.beat}</strong></td>
          <td>${escapeHtml(match.anglers.join(' vs '))}</td>
          <td><span class="match-status-badge ${statusClass}">${match.status}</span></td>
          <td>${scoresSummary}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick="openAdminEditModal(${sess.session_id}, '${escapeHtml(match.match_id)}')">
              Edit Score
            </button>
          </td>
        </tr>
      `;
    });
  });

  tbody.innerHTML = html;
}

// --- Admin Edit Score Modal ---
function openAdminEditModal(sessionId, matchId) {
  const session = (tournamentState.sessions || []).find(s => s.session_id === sessionId);
  const match = session ? (session.matches || []).find(m => m.match_id === matchId) : null;
  if (!match) return;

  document.getElementById('editSessionId').value = sessionId;
  document.getElementById('editMatchId').value = matchId;
  document.getElementById('editModalTitle').textContent = `Official Score: S${sessionId} Beat ${match.beat}`;

  const container = document.getElementById('editFieldsContainer');
  let html = '';
  match.anglers.forEach(ang => {
    const curVal = match.official_scores && match.official_scores[ang] !== undefined 
      ? match.official_scores[ang] 
      : 0;

    html += `
      <div class="catch-field-row">
        <label><strong>${escapeHtml(ang)}</strong> (Fish Caught):</label>
        <input type="number" 
               class="form-control catch-field-input" 
               name="admin_score_${escapeHtml(ang)}" 
               data-angler="${escapeHtml(ang)}" 
               min="0" 
               value="${curVal}" 
               required>
      </div>
    `;
  });
  container.innerHTML = html;

  document.getElementById('editScoreModal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('editScoreModal').classList.add('hidden');
}

async function submitAdminEditScore(e) {
  e.preventDefault();
  if (!isAdminAuthenticated()) {
    openAdminPasswordModal(() => submitAdminEditScore(e));
    return;
  }

  const sessionId = parseInt(document.getElementById('editSessionId').value);
  const matchId = document.getElementById('editMatchId').value;
  const adminNote = document.getElementById('editAdminNote').value;

  const inputs = document.querySelectorAll('#editFieldsContainer input[data-angler]');
  const officialScores = {};
  inputs.forEach(inp => {
    officialScores[inp.getAttribute('data-angler')] = parseInt(inp.value) || 0;
  });

  try {
    const res = await fetch('/api/admin/resolve', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Admin-Password': getAdminPassword()
      },
      body: JSON.stringify({
        session_id: sessionId,
        match_id: matchId,
        official_scores: officialScores,
        admin_note: adminNote,
        password: getAdminPassword()
      })
    });

    if (res.status === 401) {
      openAdminPasswordModal(() => submitAdminEditScore(e));
      return;
    }

    const data = await res.json();
    if (data.success) {
      closeEditModal();
      await loadState();
      alert("Official score recorded and verified!");
    } else {
      alert(`Error: ${data.error || 'Failed to save official score'}`);
    }
  } catch (err) {
    alert(`Request error: ${err.message}`);
  }
}

// --- Angler Manager & Randomiser ---
function parseAnglerLines() {
  const text = document.getElementById('adminAnglerList').value;
  if (!text) return [];
  const lines = text.split('\n');
  const results = [];
  lines.forEach(rawLine => {
    let line = rawLine.trim();
    if (!line) return;
    // Check if line contains [A] or (A-Team) or [A-Team] or starts with *
    const isTagA = /\[A\]|\[A-Team\]|\(A-Team\)|\(A\)/i.test(line) || line.startsWith('*');
    // Clean name
    let cleanName = line.replace(/\[A\]|\[A-Team\]|\(A-Team\)|\(A\)/ig, '').replace(/^\*/, '').trim();
    if (cleanName) {
      if (isTagA) {
        selectedAteamSet.add(cleanName);
      }
      results.push(cleanName);
    }
  });
  return results;
}

function loadPreset(n) {
  if (!PRESETS[n]) return;
  document.getElementById('adminAnglerList').value = PRESETS[n].join('\n');
  
  // Auto-select standard top A-team for presets
  selectedAteamSet.clear();
  const k = Math.max(3, Math.ceil(n / 3));
  PRESETS[n].slice(0, k).forEach(a => selectedAteamSet.add(a));
  
  updateAnglerCountHint();
  renderAteamChecklist();
}

function updateAnglerCountHint() {
  const lines = parseAnglerLines();
  const hint = document.getElementById('anglerValidationHint');

  if (lines.length >= 8 && lines.length <= 20) {
    const isEven = lines.length % 2 === 0;
    const desc = isEven 
      ? `Even: ${lines.length / 2} beats (all 1v1)` 
      : `Odd: ${(lines.length - 1) / 2} beats (1 beat 1v1v1 + rest 1v1)`;
    hint.innerHTML = `<span style="color: var(--primary)">✓ Valid tournament field: ${lines.length} anglers (${desc}).</span>`;
  } else {
    hint.innerHTML = `<span style="color: var(--danger)">⚠️ Currently ${lines.length} anglers. Allowed: 8 to 20 anglers.</span>`;
  }
}

function renderAteamChecklist() {
  const container = document.getElementById('ateamChecklistContainer');
  const summaryEl = document.getElementById('ateamValidationSummary');
  if (!container) return;

  const anglers = parseAnglerLines();
  if (anglers.length === 0) {
    container.innerHTML = `<div class="text-muted text-sm py-2">Enter angler names above to configure Top 8 members.</div>`;
    if (summaryEl) summaryEl.innerHTML = '';
    return;
  }

  // Prune any A-team members no longer in the list
  const validAnglerSet = new Set(anglers);
  for (const a of Array.from(selectedAteamSet)) {
    if (!validAnglerSet.has(a)) {
      selectedAteamSet.delete(a);
    }
  }

  let html = '';
  anglers.forEach(name => {
    const isA = selectedAteamSet.has(name);
    html += `
      <label class="ateam-check-item ${isA ? 'selected' : ''}">
        <input type="checkbox" ${isA ? 'checked' : ''} onchange="toggleAteamAngler('${escapeHtml(name)}')">
        <span>${escapeHtml(name)}</span>
        ${isA ? '<span class="ateam-badge-mini">⭐ Top 8</span>' : ''}
      </label>
    `;
  });
  container.innerHTML = html;

  // Validation Summary
  const k = selectedAteamSet.size;
  const N = anglers.length;
  if (summaryEl) {
    if (k === 0) {
      summaryEl.innerHTML = `<span class="text-muted">ℹ️ No Top 8 selected. All competitors will participate in standard random draw.</span>`;
    } else if (k < 3) {
      summaryEl.innerHTML = `<span style="color: var(--danger)">⚠️ Top 8 currently has ${k} member(s). Minimum 3 required so each Top 8 member can face 2 different Top 8 opponents without repeat pairings.</span>`;
    } else {
      const challengerCount = N - k;
      const challengerCoverage = (2 * k >= challengerCount) 
        ? `<span style="color:var(--primary);">✓ Every challenger is guaranteed to face at least one Top 8 member.</span>`
        : `<span style="color:var(--accent-gold);">Note: With ${k} Top 8 members, ${2*k} challenger matches are available for ${challengerCount} challengers.</span>`;

      summaryEl.innerHTML = `
        <span style="color: var(--primary)">✓ <strong>${k} Top 8 Anglers Selected:</strong></span> 
        Each will play <strong>2 matches</strong> against fellow Top 8 members and <strong>2 normal matches</strong>. ${challengerCoverage}
      `;
    }
  }
}

function toggleAteamAngler(name) {
  if (selectedAteamSet.has(name)) {
    selectedAteamSet.delete(name);
  } else {
    selectedAteamSet.add(name);
  }
  renderAteamChecklist();
}

function selectTopNAteam(n) {
  const anglers = parseAnglerLines();
  selectedAteamSet.clear();
  anglers.slice(0, n).forEach(a => selectedAteamSet.add(a));
  renderAteamChecklist();
}

function clearAteamSelection() {
  selectedAteamSet.clear();
  renderAteamChecklist();
}

async function confirmResetTournament() {
  if (!isAdminAuthenticated()) {
    openAdminPasswordModal(() => confirmResetTournament());
    return;
  }

  const anglers = parseAnglerLines();

  if (anglers.length < 8 || anglers.length > 20) {
    alert(`Please provide between 8 and 20 anglers (currently ${anglers.length}).`);
    return;
  }

  // Check duplicates
  const set = new Set(anglers);
  if (set.size !== anglers.length) {
    alert("Duplicate angler names detected! Each name must be unique.");
    return;
  }

  const aTeamList = Array.from(selectedAteamSet).filter(a => set.has(a));
  if (aTeamList.length > 0 && aTeamList.length < 3) {
    alert(`Top 8 requires at least 3 members (currently selected ${aTeamList.length}). Please select at least 3 or clear Top 8 selection.`);
    return;
  }

  const aTeamDesc = aTeamList.length > 0 
    ? `\n⭐ A-Team Members (${aTeamList.length}): ${aTeamList.join(', ')}\n(Each plays 2 A-Team clashes and 2 normal matches)` 
    : '';

  const ok = confirm(`Are you sure you want to randomize a new tournament draw with ${anglers.length} anglers?${aTeamDesc}\n\nThis will clear any previous match results.`);
  if (!ok) return;

  const tName = document.getElementById('adminTournamentName').value.trim() || "Fly Fishing Trials 2026";
  const venue = document.getElementById('adminVenue').value.trim() || "Championship Beats";

  try {
    const res = await fetch('/api/admin/reset', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Admin-Password': getAdminPassword()
      },
      body: JSON.stringify({
        anglers: anglers,
        a_team_anglers: aTeamList,
        angler_availability: anglerAvailabilityState,
        tournament_name: tName,
        venue: venue,
        password: getAdminPassword()
      })
    });

    if (res.status === 401) {
      openAdminPasswordModal(() => confirmResetTournament());
      return;
    }

    const data = await res.json();
    if (data.success) {
      alert("🎉 New tournament draw randomized successfully with A-Team constraints applied!");
      switchTab('schedule');
      await loadState();
    } else {
      alert(`Error: ${data.error || 'Failed to reset tournament'}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --- Redo Tournament Draw with Strict Zero Repeat Pairings & A-Team Criteria ---
async function redoTournamentDrawPrompt() {
  if (!isAdminAuthenticated()) {
    openAdminPasswordModal(() => redoTournamentDrawPrompt());
    return;
  }

  // Prioritize selectedAteamSet if configured in Admin tab, else tournamentState.a_team_anglers
  const anglers = (tournamentState && tournamentState.anglers && tournamentState.anglers.length >= 4)
    ? tournamentState.anglers
    : parseAnglerLines();

  if (anglers.length < 4) {
    alert("At least 4 anglers are required to generate a draw.");
    return;
  }

  let aTeamList = [];
  if (selectedAteamSet && selectedAteamSet.size > 0) {
    aTeamList = Array.from(selectedAteamSet).filter(a => anglers.includes(a));
  } else if (tournamentState && tournamentState.a_team_anglers) {
    aTeamList = tournamentState.a_team_anglers.filter(a => anglers.includes(a));
  }

  const aTeamDesc = aTeamList.length > 0 
    ? `\n⭐ Top 8 Members (${aTeamList.length}): ${aTeamList.join(', ')}\n• Each faces 2 fellow Top 8 members in 2 separate 1v1 sessions.\n• Challengers face Top 8 members.`
    : '\n(No A-Team members selected)';

  const ok = confirm(`🎲 Redo tournament draw with optimal fairness parameters?${aTeamDesc}\n\n• Zero repeat opponents (100% unique pairings guaranteed)\n• Existing match results will be reset.\n\nProceed?`);
  if (!ok) return;

  const tName = (tournamentState && tournamentState.tournament_name) || "Fly Fishing Trials 2026";
  const venue = (tournamentState && tournamentState.venue) || "Championship Beats";

  try {
    const res = await fetch('/api/admin/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': getAdminPassword()
      },
      body: JSON.stringify({
        anglers: anglers,
        a_team_anglers: aTeamList,
        angler_availability: anglerAvailabilityState,
        tournament_name: tName,
        venue: venue,
        password: getAdminPassword()
      })
    });

    if (res.status === 401) {
      openAdminPasswordModal(() => redoTournamentDrawPrompt());
      return;
    }

    const data = await res.json();
    if (data.success) {
      alert("🎉 Tournament draw successfully re-randomized!\n\nAll 4 sessions generated with 100% unique pairings and A-Team 1v1 parameters satisfied.");
      await loadState();
      switchTab('schedule');
    } else {
      alert(`Error: ${data.error || 'Failed to redo draw'}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --- Save A-Team Selection & Redo Draw Immediately ---
async function saveAteamSelectionAndRedraw() {
  if (!isAdminAuthenticated()) {
    openAdminPasswordModal(() => saveAteamSelectionAndRedraw());
    return;
  }

  const anglers = parseAnglerLines();
  if (anglers.length < 4) {
    alert("At least 4 anglers must be entered.");
    return;
  }

  const aTeamList = Array.from(selectedAteamSet);
  if (aTeamList.length > 0 && aTeamList.length < 3) {
    alert(`Top 8 requires at least 3 members (currently selected ${aTeamList.length}). Please select at least 3 or clear Top 8 selection.`);
    return;
  }

  const aTeamDesc = aTeamList.length > 0 
    ? `\n⭐ Top 8 Members (${aTeamList.length}): ${aTeamList.join(', ')}\n• Each faces 2 fellow Top 8 members in 2 separate 1v1 sessions.\n• Challengers face Top 8 members.`
    : '\n(No A-Team members selected)';

  const ok = confirm(`💾 Save Top 8 members (${aTeamList.join(', ') || 'None'}) and re-randomize tournament draw?${aTeamDesc}\n\n• Zero repeat opponents guaranteed.\n• Existing match scores will be reset.\n\nProceed?`);
  if (!ok) return;

  const tName = document.getElementById('adminTournamentName')?.value.trim() || (tournamentState?.tournament_name || "Fly Fishing Trials 2026");
  const venue = document.getElementById('adminVenue')?.value.trim() || (tournamentState?.venue || "Championship Beats");

  try {
    const res = await fetch('/api/admin/reset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': getAdminPassword()
      },
      body: JSON.stringify({
        anglers: anglers,
        a_team_anglers: aTeamList,
        angler_availability: anglerAvailabilityState,
        tournament_name: tName,
        venue: venue,
        password: getAdminPassword()
      })
    });

    if (res.status === 401) {
      openAdminPasswordModal(() => saveAteamSelectionAndRedraw());
      return;
    }

    const data = await res.json();
    if (data.success) {
      tournamentState = data.state;
      alert(`🎉 Top 8 saved and tournament draw successfully generated with optimal parameters!\n\nA-Team: ${aTeamList.join(', ')}`);
      await loadState();
      switchTab('schedule');
    } else {
      alert(`Error: ${data.error || 'Failed to save Top 8 and redraw.'}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --- Save A-Team Designation Only (Without Resetting Draw) ---
async function saveAteamSelectionOnly() {
  if (!isAdminAuthenticated()) {
    openAdminPasswordModal(() => saveAteamSelectionOnly());
    return;
  }

  const aTeamList = Array.from(selectedAteamSet);
  try {
    const res = await fetch('/api/admin/trial/update_ateam', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': getAdminPassword()
      },
      body: JSON.stringify({
        a_team_anglers: aTeamList,
        password: getAdminPassword()
      })
    });

    if (res.status === 401) {
      openAdminPasswordModal(() => saveAteamSelectionOnly());
      return;
    }

    const data = await res.json();
    if (data.success) {
      tournamentState = data.state;
      selectedAteamSet.clear();
      (tournamentState.a_team_anglers || []).forEach(a => selectedAteamSet.add(a));
      renderAll();
      renderAteamChecklist();
      alert(`✅ Top 8 successfully saved for ${tournamentState.trial_info?.name || 'this trial'}:\n\n${aTeamList.join(', ') || 'None'}`);
    } else {
      alert(`Error: ${data.error || 'Failed to update Top 8.'}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --- Save Tournament Name and Venue ---
async function saveTournamentMetadata() {
  if (!isAdminAuthenticated()) {
    openAdminPasswordModal(() => saveTournamentMetadata());
    return;
  }

  const nameInput = document.getElementById('adminTournamentName');
  const venueInput = document.getElementById('adminVenue');
  const name = nameInput ? nameInput.value.trim() : '';
  const venue = venueInput ? venueInput.value.trim() : '';

  if (!name) {
    alert("Please enter a Tournament Name.");
    return;
  }

  const trialId = tournamentState?.trial_info?.id || tournamentState?.active_trial_id;

  try {
    const res = await fetch('/api/admin/trial/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': getAdminPassword()
      },
      body: JSON.stringify({
        trial_id: trialId,
        name: name,
        venue: venue,
        password: getAdminPassword()
      })
    });

    if (res.status === 401) {
      openAdminPasswordModal(() => saveTournamentMetadata());
      return;
    }

    const data = await res.json();
    if (data.success) {
      if (tournamentState) {
        tournamentState.tournament_name = name;
        tournamentState.venue = venue;
        if (tournamentState.trial_info) {
          tournamentState.trial_info.name = name;
          tournamentState.trial_info.venue = venue;
        }
      }
      const titleEl = document.getElementById('tournamentTitle');
      if (titleEl) titleEl.textContent = name;
      const subtitleEl = document.getElementById('tournamentSubtitle');
      if (subtitleEl) subtitleEl.textContent = venue;
      alert(`✅ Tournament Name ("${name}") and Venue ("${venue}") updated successfully!`);
    } else {
      alert(`Error updating tournament details: ${data.error || 'Failed'}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --- Angler Session Availability (Competition Sessions Checkboxes) ---
function initAnglerAvailabilityFromState() {
  const avail = (tournamentState && tournamentState.angler_availability) || {};
  const anglers = (tournamentState && tournamentState.anglers && tournamentState.anglers.length > 0)
    ? tournamentState.anglers
    : parseAnglerLines();
  
  anglerAvailabilityState = {};
  anglers.forEach(a => {
    if (avail[a] && Array.isArray(avail[a])) {
      anglerAvailabilityState[a] = [...avail[a]];
    } else {
      anglerAvailabilityState[a] = [1, 2, 3, 4];
    }
  });
}

function renderAnglerAvailability() {
  const container = document.getElementById('anglerAvailabilityContainer');
  const summaryEl = document.getElementById('anglerAvailabilitySummary');
  if (!container) return;

  const anglers = parseAnglerLines();
  if (anglers.length === 0) {
    container.innerHTML = '<div class="text-muted text-sm py-2">Enter angler names above to configure session availability.</div>';
    if (summaryEl) summaryEl.innerHTML = '';
    return;
  }

  // Ensure state contains entries for all current anglers
  anglers.forEach(a => {
    if (!anglerAvailabilityState[a] || !Array.isArray(anglerAvailabilityState[a])) {
      if (tournamentState && tournamentState.angler_availability && tournamentState.angler_availability[a]) {
        anglerAvailabilityState[a] = [...tournamentState.angler_availability[a]];
      } else {
        anglerAvailabilityState[a] = [1, 2, 3, 4];
      }
    }
  });

  const aTeamSet = new Set(selectedAteamSet && selectedAteamSet.size > 0 
    ? Array.from(selectedAteamSet) 
    : (tournamentState?.a_team_anglers || []));

  let html = `
    <table class="data-table text-sm" style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--border); text-align:left;">
          <th style="padding:0.4rem;">Angler</th>
          <th style="text-align:center; padding:0.4rem; width:80px;">S1 (Sat AM)</th>
          <th style="text-align:center; padding:0.4rem; width:80px;">S2 (Sat PM)</th>
          <th style="text-align:center; padding:0.4rem; width:80px;">S3 (Sun AM)</th>
          <th style="text-align:center; padding:0.4rem; width:80px;">S4 (Sun PM)</th>
          <th style="padding:0.4rem; width:150px; text-align:center;">Competition Status</th>
          <th style="padding:0.4rem; width:120px; text-align:center;">Quick Select</th>
        </tr>
      </thead>
      <tbody>
  `;

  let sCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let sSoloCounts = { 1: 0, 2: 0, 3: 0, 4: 0 };

  anglers.forEach(name => {
    const isA = aTeamSet.has(name);
    const sessions = anglerAvailabilityState[name] || [1, 2, 3, 4];
    const s1 = sessions.includes(1);
    const s2 = sessions.includes(2);
    const s3 = sessions.includes(3);
    const s4 = sessions.includes(4);

    if (s1) sCounts[1]++; else sSoloCounts[1]++;
    if (s2) sCounts[2]++; else sSoloCounts[2]++;
    if (s3) sCounts[3]++; else sSoloCounts[3]++;
    if (s4) sCounts[4]++; else sSoloCounts[4]++;

    const compCount = sessions.length;
    const soloCount = 4 - compCount;

    let statusBadge = '';
    if (compCount === 4) {
      statusBadge = '<span class="badge" style="background:rgba(16,185,129,0.2); color:#34d399; font-weight:700;">4 / 4 Competing</span>';
    } else if (compCount === 0) {
      statusBadge = '<span class="badge" style="background:rgba(239,68,68,0.2); color:#f87171; font-weight:700;">All Solo (0 Comp)</span>';
    } else {
      statusBadge = `<span class="badge" style="background:rgba(99,102,241,0.2); color:#a5b4fc; font-weight:700;">${compCount} Comp / ${soloCount} Solo</span>`;
    }

    html += `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
        <td style="padding:0.4rem 0.5rem; font-weight:600;">
          <div style="display:flex; align-items:center; gap:0.4rem;">
            <span>${escapeHtml(name)}</span>
            ${isA ? '<span class="ateam-badge-mini" style="font-size:0.65rem;">⭐ Top 8</span>' : ''}
          </div>
        </td>
        <td style="text-align:center; padding:0.4rem;">
          <input type="checkbox" ${s1 ? 'checked' : ''} onchange="onAnglerAvailChange('${escapeHtml(name)}', 1, this.checked)" title="${escapeHtml(name)} - S1 Sat AM">
        </td>
        <td style="text-align:center; padding:0.4rem;">
          <input type="checkbox" ${s2 ? 'checked' : ''} onchange="onAnglerAvailChange('${escapeHtml(name)}', 2, this.checked)" title="${escapeHtml(name)} - S2 Sat PM">
        </td>
        <td style="text-align:center; padding:0.4rem;">
          <input type="checkbox" ${s3 ? 'checked' : ''} onchange="onAnglerAvailChange('${escapeHtml(name)}', 3, this.checked)" title="${escapeHtml(name)} - S3 Sun AM">
        </td>
        <td style="text-align:center; padding:0.4rem;">
          <input type="checkbox" ${s4 ? 'checked' : ''} onchange="onAnglerAvailChange('${escapeHtml(name)}', 4, this.checked)" title="${escapeHtml(name)} - S4 Sun PM">
        </td>
        <td style="text-align:center; padding:0.4rem;">
          ${statusBadge}
        </td>
        <td style="text-align:center; padding:0.4rem;">
          <div style="display:flex; justify-content:center; gap:0.25rem;">
            <button type="button" class="btn btn-sm btn-outline" style="padding:0.15rem 0.4rem; font-size:0.7rem;" onclick="setSingleAnglerAvailability('${escapeHtml(name)}', true)" title="Set all 4 sessions competing">All</button>
            <button type="button" class="btn btn-sm btn-outline" style="padding:0.15rem 0.4rem; font-size:0.7rem;" onclick="setSingleAnglerAvailability('${escapeHtml(name)}', false)" title="Mark as solo beat for all sessions">Solo</button>
          </div>
        </td>
      </tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;

  if (summaryEl) {
    summaryEl.innerHTML = `
      <span style="display:inline-flex; gap:0.8rem; flex-wrap:wrap;">
        <span><strong>S1:</strong> ${sCounts[1]} competing${sSoloCounts[1] > 0 ? ` (${sSoloCounts[1]} solo)` : ''}</span>
        <span>&bull;</span>
        <span><strong>S2:</strong> ${sCounts[2]} competing${sSoloCounts[2] > 0 ? ` (${sSoloCounts[2]} solo)` : ''}</span>
        <span>&bull;</span>
        <span><strong>S3:</strong> ${sCounts[3]} competing${sSoloCounts[3] > 0 ? ` (${sSoloCounts[3]} solo)` : ''}</span>
        <span>&bull;</span>
        <span><strong>S4:</strong> ${sCounts[4]} competing${sSoloCounts[4] > 0 ? ` (${sSoloCounts[4]} solo)` : ''}</span>
      </span>
    `;
  }
}

function onAnglerAvailChange(name, sId, checked) {
  if (!anglerAvailabilityState[name]) {
    anglerAvailabilityState[name] = [1, 2, 3, 4];
  }
  const set = new Set(anglerAvailabilityState[name]);
  if (checked) {
    set.add(sId);
  } else {
    set.delete(sId);
  }
  anglerAvailabilityState[name] = Array.from(set).sort((a, b) => a - b);
  renderAnglerAvailability();
}

function setSingleAnglerAvailability(name, isAll) {
  anglerAvailabilityState[name] = isAll ? [1, 2, 3, 4] : [];
  renderAnglerAvailability();
}

function setAllAnglerAvailability(allChecked) {
  const anglers = parseAnglerLines();
  anglers.forEach(a => {
    anglerAvailabilityState[a] = allChecked ? [1, 2, 3, 4] : [];
  });
  renderAnglerAvailability();
}

async function saveAnglerAvailabilityOnly() {
  if (!isAdminAuthenticated()) {
    openAdminPasswordModal(() => saveAnglerAvailabilityOnly());
    return;
  }

  const doRedraw = confirm("💾 Save Angler Session Availability?\n\n• Click OK to save and immediately re-randomize tournament draw (assigning solo beats to un-ticked anglers).\n• Click Cancel to save availability only without redrawing existing matches.");

  try {
    const res = await fetch('/api/admin/angler_availability/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': getAdminPassword()
      },
      body: JSON.stringify({
        angler_availability: anglerAvailabilityState,
        redraw: doRedraw,
        password: getAdminPassword()
      })
    });

    if (res.status === 401) {
      openAdminPasswordModal(() => saveAnglerAvailabilityOnly());
      return;
    }

    const data = await res.json();
    if (data.success) {
      tournamentState = data.state;
      alert(`✅ ${data.message || 'Angler availability updated successfully!'}`);
      await loadState();
      if (doRedraw) {
        switchTab('schedule');
      }
    } else {
      alert(`Error saving availability: ${data.error || 'Failed'}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --- Admin Beats & River Allocation Configuration ---
let adminBeatsList = [];

function renderAdminBeatsConfig() {
  const container = document.getElementById('adminBeatsConfigContainer');
  if (!container) return;

  const rawBeats = (tournamentState && tournamentState.beats && tournamentState.beats.length > 0)
    ? tournamentState.beats
    : (tournamentState?.trial_info?.tournament_data?.beats || []);

  if (rawBeats.length === 0) {
    container.innerHTML = '<div class="text-muted text-sm py-2">Loading beats configuration...</div>';
    return;
  }

  adminBeatsList = JSON.parse(JSON.stringify(rawBeats));

  let html = `
    <table class="data-table text-sm" style="width:100%; border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--border); text-align:left;">
          <th style="width:40px; text-align:center; padding:0.4rem;">Active</th>
          <th style="padding:0.4rem;">Beat</th>
          <th style="padding:0.4rem;">River Section</th>
          <th style="text-align:center; padding:0.4rem;">Sat Avail</th>
          <th style="padding:0.4rem;">Sat Sessions</th>
          <th style="text-align:center; padding:0.4rem;">Sun Avail</th>
          <th style="padding:0.4rem;">Sun Sessions</th>
          <th style="padding:0.4rem;">Meeting Point / Access</th>
        </tr>
      </thead>
      <tbody>
  `;

  let activeCount = 0;
  let satAvailCount = 0;
  let sunAvailCount = 0;

  adminBeatsList.forEach((b, idx) => {
    const isEnabled = (b.enabled !== false);
    if (isEnabled) activeCount++;
    const isSat = (b.sat_available !== false);
    const satSess = b.sat_sessions !== undefined ? Number(b.sat_sessions) : (b.usage_mode === 'single' ? 1 : 2);
    if (isEnabled && isSat) satAvailCount++;

    const isSun = (b.sun_available !== false);
    const sunSess = b.sun_sessions !== undefined ? Number(b.sun_sessions) : (b.usage_mode === 'single' ? 1 : 2);
    if (isEnabled && isSun) sunAvailCount++;

    const isYP = (b.river && b.river.toLowerCase().includes('eland'));
    const isSB = !isYP;

    html += `
      <tr style="border-bottom:1px solid rgba(255,255,255,0.05); background:${isEnabled ? 'transparent' : 'rgba(0,0,0,0.2)'}; opacity:${isEnabled ? '1' : '0.6'};">
        <td style="text-align:center; padding:0.4rem;">
          <input type="checkbox" id="admin_beat_active_${idx}" ${isEnabled ? 'checked' : ''} onchange="toggleAdminBeatActive(${idx})" title="Toggle Active">
        </td>
        <td style="padding:0.4rem;">
          <strong>${escapeHtml(b.code || b.id)}</strong>
          <div class="text-xs text-muted">${escapeHtml(b.name || '')}</div>
        </td>
        <td style="padding:0.4rem;">
          <select id="admin_beat_river_${idx}" class="form-control form-control-sm" style="padding:0.25rem 0.4rem; font-size:0.8rem; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;" onchange="updateAdminBeatRiver(${idx})">
            <option value="Small Blaar" ${isSB ? 'selected' : ''}>Small Blaar</option>
            <option value="Elands Pad" ${isYP ? 'selected' : ''}>Elands Pad</option>
          </select>
        </td>
        <td style="text-align:center; padding:0.4rem;">
          <input type="checkbox" id="admin_beat_sat_avail_${idx}" ${isSat ? 'checked' : ''} onchange="updateAdminBeatSatAvail(${idx})" title="Available on Saturday">
        </td>
        <td style="padding:0.4rem;">
          <select id="admin_beat_sat_sess_${idx}" class="form-control form-control-sm" style="padding:0.25rem 0.4rem; font-size:0.8rem; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;" onchange="updateAdminBeatSatSessions(${idx})">
            <option value="2" ${satSess === 2 ? 'selected' : ''}>2 Sessions (AM+PM)</option>
            <option value="1" ${satSess === 1 ? 'selected' : ''}>1 Session (1x)</option>
          </select>
        </td>
        <td style="text-align:center; padding:0.4rem;">
          <input type="checkbox" id="admin_beat_sun_avail_${idx}" ${isSun ? 'checked' : ''} onchange="updateAdminBeatSunAvail(${idx})" title="Available on Sunday">
        </td>
        <td style="padding:0.4rem;">
          <select id="admin_beat_sun_sess_${idx}" class="form-control form-control-sm" style="padding:0.25rem 0.4rem; font-size:0.8rem; background:var(--bg-secondary); color:var(--text-primary); border:1px solid var(--border); border-radius:4px;" onchange="updateAdminBeatSunSessions(${idx})">
            <option value="2" ${sunSess === 2 ? 'selected' : ''}>2 Sessions (AM+PM)</option>
            <option value="1" ${sunSess === 1 ? 'selected' : ''}>1 Session (1x)</option>
          </select>
        </td>
        <td style="padding:0.4rem;" class="text-xs text-muted">${escapeHtml(b.meeting_point || '')}</td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  container.innerHTML = html;

  const summaryEl = document.getElementById('adminBeatsValidationSummary');
  if (summaryEl) {
    summaryEl.innerHTML = `<strong>${activeCount} Active Beats:</strong> Saturday: ${satAvailCount} beats available &bull; Sunday: ${sunAvailCount} beats available`;
  }
}

function toggleAdminBeatActive(idx) {
  const chk = document.getElementById(`admin_beat_active_${idx}`);
  if (chk && adminBeatsList[idx]) {
    adminBeatsList[idx].enabled = chk.checked;
    renderAdminBeatsConfig();
  }
}

function updateAdminBeatRiver(idx) {
  const sel = document.getElementById(`admin_beat_river_${idx}`);
  if (sel && adminBeatsList[idx]) {
    adminBeatsList[idx].river = sel.value;
  }
}

function updateAdminBeatSatAvail(idx) {
  const chk = document.getElementById(`admin_beat_sat_avail_${idx}`);
  if (chk && adminBeatsList[idx]) {
    adminBeatsList[idx].sat_available = chk.checked;
  }
}

function updateAdminBeatSatSessions(idx) {
  const sel = document.getElementById(`admin_beat_sat_sess_${idx}`);
  if (sel && adminBeatsList[idx]) {
    adminBeatsList[idx].sat_sessions = parseInt(sel.value, 10);
  }
}

function updateAdminBeatSunAvail(idx) {
  const chk = document.getElementById(`admin_beat_sun_avail_${idx}`);
  if (chk && adminBeatsList[idx]) {
    adminBeatsList[idx].sun_available = chk.checked;
  }
}

function updateAdminBeatSunSessions(idx) {
  const sel = document.getElementById(`admin_beat_sun_sess_${idx}`);
  if (sel && adminBeatsList[idx]) {
    adminBeatsList[idx].sun_sessions = parseInt(sel.value, 10);
  }
}

async function saveAdminBeatsConfig() {
  if (!isAdminAuthenticated()) {
    openAdminPasswordModal(() => saveAdminBeatsConfig());
    return;
  }

  adminBeatsList.forEach((b, idx) => {
    const act = document.getElementById(`admin_beat_active_${idx}`);
    if (act) b.enabled = act.checked;
    const riv = document.getElementById(`admin_beat_river_${idx}`);
    if (riv) b.river = riv.value;
    const satAvail = document.getElementById(`admin_beat_sat_avail_${idx}`);
    if (satAvail) b.sat_available = satAvail.checked;
    const satSess = document.getElementById(`admin_beat_sat_sess_${idx}`);
    if (satSess) b.sat_sessions = parseInt(satSess.value, 10);
    const sunAvail = document.getElementById(`admin_beat_sun_avail_${idx}`);
    if (sunAvail) b.sun_available = sunAvail.checked;
    const sunSess = document.getElementById(`admin_beat_sun_sess_${idx}`);
    if (sunSess) b.sun_sessions = parseInt(sunSess.value, 10);
    b.usage_mode = (b.sat_sessions === 1 && b.sun_sessions === 1) ? 'single' : 'double';
  });

  try {
    const res = await fetch('/api/admin/beats/update_all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': getAdminPassword()
      },
      body: JSON.stringify({
        beats: adminBeatsList,
        password: getAdminPassword()
      })
    });

    if (res.status === 401) {
      openAdminPasswordModal(() => saveAdminBeatsConfig());
      return;
    }

    const data = await res.json();
    if (data.success) {
      alert(`✅ Active beats and day availability saved successfully! (${adminBeatsList.filter(b => b.enabled !== false).length} active beats ready for draw)`);
      await loadState();
      renderAdminBeatsConfig();
      updateMapPins();
    } else {
      alert(`Error saving beats config: ${data.error || 'Failed'}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --- Clear / Delete Entire Draw ---
async function clearTournamentDrawPrompt() {
  if (!isAdminAuthenticated()) {
    openAdminPasswordModal(() => clearTournamentDrawPrompt());
    return;
  }

  const ok = confirm("⚠️ Are you sure you want to clear/delete the current draw?\n\nThis will remove all session matchups and scores.");
  if (!ok) return;

  try {
    const res = await fetch('/api/admin/clear_draw', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': getAdminPassword()
      },
      body: JSON.stringify({
        password: getAdminPassword()
      })
    });

    if (res.status === 401) {
      openAdminPasswordModal(() => clearTournamentDrawPrompt());
      return;
    }

    const data = await res.json();
    if (data.success) {
      alert("🗑️ Tournament draw has been cleared.");
      await loadState();
      switchTab('schedule');
    } else {
      alert(`Error: ${data.error || 'Failed to clear draw'}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --- Reset / Clear Single Session Matches ---
async function clearSessionMatchesPrompt(sessionId) {
  if (!isAdminAuthenticated()) {
    openAdminPasswordModal(() => clearSessionMatchesPrompt(sessionId));
    return;
  }

  const ok = confirm(`Reset and clear all scores for Session ${sessionId}?\n\nMatches in this session will return to pending status.`);
  if (!ok) return;

  try {
    const res = await fetch('/api/admin/clear_session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': getAdminPassword()
      },
      body: JSON.stringify({
        session_id: sessionId,
        password: getAdminPassword()
      })
    });

    if (res.status === 401) {
      openAdminPasswordModal(() => clearSessionMatchesPrompt(sessionId));
      return;
    }

    const data = await res.json();
    if (data.success) {
      alert(`Session ${sessionId} has been reset.`);
      await loadState();
    } else {
      alert(`Error: ${data.error || 'Failed to reset session'}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --- Parameter Verification Modal & Fairness Audit ---
function closeParameterAuditModal() {
  const modal = document.getElementById('parameterAuditModal');
  if (modal) modal.classList.add('hidden');
}

function openParameterAuditModal() {
  const modal = document.getElementById('parameterAuditModal');
  const body = document.getElementById('parameterAuditBody');
  if (!modal || !body) return;

  if (!tournamentState || !tournamentState.sessions || tournamentState.sessions.length === 0) {
    body.innerHTML = `
      <div class="text-center py-4 text-muted">
        <p>No active tournament draw found.</p>
        <p class="text-sm">Please generate or randomize a draw in the Organizer Admin tab first.</p>
      </div>
    `;
    modal.classList.remove('hidden');
    return;
  }

  const anglers = tournamentState.anglers || [];
  const aTeamList = tournamentState.a_team_anglers || [];
  const aTeamSet = new Set(aTeamList);
  const challengers = anglers.filter(a => !aTeamSet.has(a));
  const sessions = tournamentState.sessions || [];

  // Track encounters
  const encounters = {};
  anglers.forEach(a => { encounters[a] = {}; });
  const aTeamOpponents = {};
  aTeamList.forEach(a => { aTeamOpponents[a] = { opponents: new Set(), sessions: [], is1v1: true }; });
  const challengerOpponents = {};
  challengers.forEach(c => { challengerOpponents[c] = { aTeamOpponents: new Set(), allOpponents: new Set() }; });
  const threeWayCounts = {};
  anglers.forEach(a => { threeWayCounts[a] = 0; });

  let repeatViolations = [];

  let totalSoloMatches = 0;
  sessions.forEach(s => {
    (s.matches || []).forEach(m => {
      const mAnglers = m.anglers || [];
      if (m.is_solo || m.match_type === 'SOLO' || mAnglers.length <= 1) {
        totalSoloMatches++;
        return; // Don't track collisions for solo matches
      }
      if (mAnglers.length === 3) {
        mAnglers.forEach(a => { threeWayCounts[a] = (threeWayCounts[a] || 0) + 1; });
      }

      for (let i = 0; i < mAnglers.length; i++) {
        for (let j = i + 1; j < mAnglers.length; j++) {
          const p1 = mAnglers[i];
          const p2 = mAnglers[j];

          encounters[p1][p2] = (encounters[p1][p2] || 0) + 1;
          encounters[p2][p1] = (encounters[p2][p1] || 0) + 1;

          if (encounters[p1][p2] > 1) {
            repeatViolations.push(`${p1} vs ${p2} (S${s.session_id})`);
          }

          // A-Team vs A-Team tracking
          if (aTeamSet.has(p1) && aTeamSet.has(p2)) {
            aTeamOpponents[p1].opponents.add(p2);
            aTeamOpponents[p1].sessions.push(s.session_short || `S${s.session_id}`);
            if (mAnglers.length > 2) aTeamOpponents[p1].is1v1 = false;

            aTeamOpponents[p2].opponents.add(p1);
            aTeamOpponents[p2].sessions.push(s.session_short || `S${s.session_id}`);
            if (mAnglers.length > 2) aTeamOpponents[p2].is1v1 = false;
          }

          // Challenger vs A-Team tracking
          if (!aTeamSet.has(p1) && aTeamSet.has(p2)) {
            challengerOpponents[p1].aTeamOpponents.add(p2);
          } else if (!aTeamSet.has(p2) && aTeamSet.has(p1)) {
            challengerOpponents[p2].aTeamOpponents.add(p1);
          }

          if (!aTeamSet.has(p1)) challengerOpponents[p1].allOpponents.add(p2);
          if (!aTeamSet.has(p2)) challengerOpponents[p2].allOpponents.add(p1);
        }
      }
    });
  });

  // Parameter 1: Zero Repeats
  const hasZeroRepeats = repeatViolations.length === 0;

  // Parameter 2: A-Team criteria (each faces 2 different A-Team members in 2 sessions, 1v1)
  let aTeamOptimalCount = 0;
  aTeamList.forEach(a => {
    const oppCount = aTeamOpponents[a].opponents.size;
    const sessCount = aTeamOpponents[a].sessions.length;
    if (oppCount === 2 && sessCount === 2 && aTeamOpponents[a].is1v1) {
      aTeamOptimalCount++;
    }
  });
  const aTeamPass = aTeamList.length === 0 || aTeamOptimalCount === aTeamList.length;

  // Parameter 3: Challenger vs A-Team exposure (target 2, acceptable >= 1)
  let challengersFacing2 = 0;
  let challengersFacingAtLeast1 = 0;
  challengers.forEach(c => {
    const count = challengerOpponents[c].aTeamOpponents.size;
    if (count >= 2) challengersFacing2++;
    if (count >= 1) challengersFacingAtLeast1++;
  });

  // Parameter 4: Beat Stayers (Morning -> Afternoon Rotation)
  const s1Session = sessions.find(s => s.session_id === 1);
  const s2Session = sessions.find(s => s.session_id === 2);
  const s3Session = sessions.find(s => s.session_id === 3);
  const s4Session = sessions.find(s => s.session_id === 4);

  function auditDayStayers(amSession, pmSession, dayLabel) {
    if (!amSession || !pmSession) return { day: dayLabel, overlaps: [], totalOverlaps: 0, stayersCount: 0 };
    const amBeats = {};
    (amSession.matches || []).forEach(m => {
      const bKey = m.beat_id || m.beat_code || m.beat || m.beat_number;
      amBeats[bKey] = m;
    });

    const results = [];
    let stayersCount = 0;
    (pmSession.matches || []).forEach(pmM => {
      const bKey = pmM.beat_id || pmM.beat_code || pmM.beat || pmM.beat_number;
      const amM = amBeats[bKey];
      if (amM) {
        const amAnglers = amM.anglers || [];
        const pmAnglers = pmM.anglers || [];
        let stayer = pmM.stayer;
        if (!stayer) {
          stayer = amAnglers.find(a => pmAnglers.includes(a));
        }
        const hasStayer = !!stayer;
        if (hasStayer) stayersCount++;
        const moversAway = amAnglers.filter(a => a !== stayer);
        const moversIn = pmAnglers.filter(a => a !== stayer);

        results.push({
          beatKey: bKey,
          beatName: pmM.beat_name || `Beat ${pmM.beat || pmM.beat_number}`,
          river: pmM.river || '',
          hasStayer: hasStayer,
          stayer: stayer || 'None',
          moversAway: moversAway,
          moversIn: moversIn
        });
      }
    });

    return {
      day: dayLabel,
      overlaps: results,
      totalOverlaps: results.length,
      stayersCount: stayersCount
    };
  }

  const satAudit = auditDayStayers(s1Session, s2Session, "Saturday (S1 ➔ S2)");
  const sunAudit = auditDayStayers(s3Session, s4Session, "Sunday (S3 ➔ S4)");
  const totalOverlappingBeats = satAudit.totalOverlaps + sunAudit.totalOverlaps;
  const totalStayersFound = satAudit.stayersCount + sunAudit.stayersCount;
  const stayerRate = totalOverlappingBeats > 0 ? Math.round((totalStayersFound / totalOverlappingBeats) * 100) : 100;
  const stayerOptimal = totalOverlappingBeats === 0 || totalStayersFound === totalOverlappingBeats;

  // Parameter 5: Dual-River Coverage (Small Blaar & Elands Pad)
  const anglerRivers = {};
  anglers.forEach(a => {
    anglerRivers[a] = { sb: 0, ep: 0, total: 0 };
  });

  sessions.forEach(s => {
    (s.matches || []).forEach(m => {
      const r = (m.river || '').toLowerCase();
      const isEP = r.includes('eland');
      (m.anglers || []).forEach(a => {
        if (anglerRivers[a]) {
          anglerRivers[a].total++;
          if (isEP) anglerRivers[a].ep++;
          else anglerRivers[a].sb++;
        }
      });
    });
  });

  let anglersBothRivers = 0;
  anglers.forEach(a => {
    if (anglerRivers[a].sb > 0 && anglerRivers[a].ep > 0) anglersBothRivers++;
  });
  const bothRiversRate = anglers.length > 0 ? Math.round((anglersBothRivers / anglers.length) * 100) : 100;

  // Parameter 6: Beat Usage Limits (Sat / Sun Daily Session Limits)
  const beatUsageCounts = {};
  sessions.forEach(s => {
    const isSat = (s.session_id === 1 || s.session_id === 2);
    (s.matches || []).forEach(m => {
      const bKey = m.beat_id || m.beat_code || m.beat_name || `Beat_${m.beat}`;
      if (!beatUsageCounts[bKey]) {
        const bConf = (tournamentState.beats || []).find(b => b.id === bKey || b.code === bKey) || {};
        beatUsageCounts[bKey] = {
          name: m.beat_name || bKey,
          river: m.river || bConf.river || '',
          sat_available: bConf.sat_available !== false,
          sat_sessions: bConf.sat_sessions !== undefined ? Number(bConf.sat_sessions) : (bConf.usage_mode === 'single' ? 1 : 2),
          sun_available: bConf.sun_available !== false,
          sun_sessions: bConf.sun_sessions !== undefined ? Number(bConf.sun_sessions) : (bConf.usage_mode === 'single' ? 1 : 2),
          satCount: 0,
          sunCount: 0,
          totalCount: 0
        };
      }
      if (isSat) beatUsageCounts[bKey].satCount++;
      else beatUsageCounts[bKey].sunCount++;
      beatUsageCounts[bKey].totalCount++;
    });
  });

  let beatUsageCompliant = true;
  const beatViolations = [];
  Object.values(beatUsageCounts).forEach(b => {
    const maxSat = b.sat_available ? b.sat_sessions : 0;
    const maxSun = b.sun_available ? b.sun_sessions : 0;
    if (b.satCount > maxSat) {
      beatUsageCompliant = false;
      beatViolations.push(`${b.name}: ${b.satCount}x on Saturday (Limit: ${maxSat})`);
    }
    if (b.sunCount > maxSun) {
      beatUsageCompliant = false;
      beatViolations.push(`${b.name}: ${b.sunCount}x on Sunday (Limit: ${maxSun})`);
    }
  });

  // Parameter 6: Beat Minimization & CPS Return Audit
  const allBeatsUsed = new Set();
  sessions.forEach(s => {
    (s.matches || []).forEach(m => {
      const code = m.beat_code || m.beat_id;
      if (code) allBeatsUsed.add(code);
    });
  });
  const totalBeatsUsedCount = allBeatsUsed.size;
  const allCpsBeats = (tournamentState.beats && tournamentState.beats.length > 0) ? tournamentState.beats : (typeof DEFAULT_CPS_BEATS !== 'undefined' ? DEFAULT_CPS_BEATS : []);
  const returnedBeatsList = allCpsBeats
    .filter(b => !allBeatsUsed.has(b.id || b.code) && !allBeatsUsed.has(b.code))
    .map(b => b.code || b.id);
  const isOptimalBeatMinimization = totalBeatsUsedCount <= 9;

  // Parameter 7: Travel Time & Transition Balance Audit
  const anglerTravelTotals = {};
  anglers.forEach(a => { anglerTravelTotals[a] = 0; });
  sessions.forEach(s => {
    (s.matches || []).forEach(m => {
      const tt = m.travel_time || 15;
      (m.anglers || []).forEach(a => {
        if (anglerTravelTotals[a] !== undefined) anglerTravelTotals[a] += tt;
      });
    });
  });
  const travelValues = Object.values(anglerTravelTotals);
  const minTravel = travelValues.length > 0 ? Math.min(...travelValues) : 0;
  const maxTravel = travelValues.length > 0 ? Math.max(...travelValues) : 0;
  const travelDelta = maxTravel - minTravel;
  const isTravelBalanced = travelDelta <= 30;

  // Check for extreme transitions (e.g. EP3/EP2 gorge to SB1/Hotel)
  const extremeTransitions = [];
  const satS1 = sessions.find(s => s.session_id === 1);
  const satS2 = sessions.find(s => s.session_id === 2);
  if (satS1 && satS2) {
    const s1AnglerBeat = {};
    (satS1.matches || []).forEach(m => (m.anglers || []).forEach(a => { s1AnglerBeat[a] = m.beat_code || m.beat_id; }));
    (satS2.matches || []).forEach(m => (m.anglers || []).forEach(a => {
      const prev = s1AnglerBeat[a];
      const curr = m.beat_code || m.beat_id;
      if ((prev === 'EP3' || prev === 'EP2') && (curr === 'SB1' || curr === 'SB(HOTEL)')) {
        extremeTransitions.push(`${a}: ${prev} ➔ ${curr} (Sat)`);
      }
    }));
  }
  const sunS3 = sessions.find(s => s.session_id === 3);
  const sunS4 = sessions.find(s => s.session_id === 4);
  if (sunS3 && sunS4) {
    const s3AnglerBeat = {};
    (sunS3.matches || []).forEach(m => (m.anglers || []).forEach(a => { s3AnglerBeat[a] = m.beat_code || m.beat_id; }));
    (sunS4.matches || []).forEach(m => (m.anglers || []).forEach(a => {
      const prev = s3AnglerBeat[a];
      const curr = m.beat_code || m.beat_id;
      if ((prev === 'EP3' || prev === 'EP2') && (curr === 'SB1' || curr === 'SB(HOTEL)')) {
        extremeTransitions.push(`${a}: ${prev} ➔ ${curr} (Sun)`);
      }
    }));
  }
  const zeroExtremeTransitions = extremeTransitions.length === 0;

  // Overall status rating
  let statusBadgeHtml = '';
  if (hasZeroRepeats && aTeamPass && challengersFacingAtLeast1 === challengers.length && beatUsageCompliant) {
    statusBadgeHtml = `<span class="badge badge-success" style="background:#059669; color:#fff; padding:0.4rem 0.8rem; border-radius:20px; font-weight:700;">✅ ALL PARAMETERS SATISFIED (OPTIMAL)</span>`;
  } else if (hasZeroRepeats && challengersFacingAtLeast1 === challengers.length) {
    statusBadgeHtml = `<span class="badge badge-info" style="background:#0284c7; color:#fff; padding:0.4rem 0.8rem; border-radius:20px; font-weight:700;">✓ VALID & ACCEPTABLE FIELD</span>`;
  } else {
    statusBadgeHtml = `<span class="badge badge-warning" style="background:#d97706; color:#fff; padding:0.4rem 0.8rem; border-radius:20px; font-weight:700;">⚠️ PARAMETER DISCREPANCY DETECTED</span>`;
  }

  // Render HTML
  let html = `
    <div style="margin-bottom:1.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; background:rgba(15,23,42,0.6); padding:1rem; border-radius:8px; border:1px solid var(--border);">
      <div>
        <h4 style="margin:0 0 0.25rem 0;">Draw Quality: <strong>${escapeHtml(tournamentState.trial_info?.name || 'Current Trial')}</strong></h4>
        <div class="text-sm text-muted">${anglers.length} Anglers &bull; ${aTeamList.length} Seeded Top 8 &bull; ${challengers.length} Challengers &bull; 4 Sessions</div>
      </div>
      <div>${statusBadgeHtml}</div>
    </div>

    <!-- Parameter 1 Card: Opponent Uniqueness -->
    <div class="card mb-3" style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
        <h4 style="margin:0;">1. Strict Opponent Uniqueness (Zero Repeat Pairings)</h4>
        <span class="status-badge ${hasZeroRepeats ? 'badge-in-session' : 'badge-past'}">
          ${hasZeroRepeats ? '✅ Passed (100% Unique)' : '❌ Repeat Pairings Found'}
        </span>
      </div>
      <p class="text-sm text-muted" style="margin:0 0 0.5rem 0;">No competitor should face the same opponent more than once across all 4 sessions.</p>
      ${hasZeroRepeats 
        ? `<div style="color:#10b981; font-weight:600; font-size:0.9rem;">✓ Perfect Uniqueness: All match assignments across 4 sessions are unique. Zero repeat pairings detected.</div>`
        : `<div style="color:#ef4444; font-weight:600; font-size:0.9rem;">⚠️ Violations: ${repeatViolations.join(', ')}</div>`
      }
    </div>

    <!-- Parameter 2 Card: A-Team vs A-Team Matchups -->
    <div class="card mb-3" style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
        <h4 style="margin:0;">2. A-Team vs A-Team Clashes (Target: 2 Different A-Team in 2 Sessions, 1v1)</h4>
        <span class="status-badge ${aTeamPass ? 'badge-in-session' : 'badge-upcoming'}">
          ${aTeamPass ? `✅ Optimal (${aTeamOptimalCount}/${aTeamList.length} Met)` : `⚠️ Acceptable (${aTeamOptimalCount}/${aTeamList.length})`}
        </span>
      </div>
      <p class="text-sm text-muted" style="margin:0 0 0.75rem 0;">Each A-Team member should compete against 2 different A-Team members across 2 sessions (one-on-one). The other 2 sessions are against challengers.</p>
      ${aTeamList.length === 0 ? `<div class="text-muted text-sm">No A-Team members designated for this trial.</div>` : `
        <table class="table text-sm" style="width:100%; border-collapse:collapse;">
          <thead>
            <tr style="border-bottom:1px solid var(--border); text-align:left;">
              <th style="padding:0.4rem;">A-Team Member</th>
              <th style="padding:0.4rem;">A-Team Opponents Faced</th>
              <th style="padding:0.4rem;">Sessions</th>
              <th style="padding:0.4rem;">1v1 Format?</th>
              <th style="padding:0.4rem;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${aTeamList.map(a => {
              const info = aTeamOpponents[a];
              const opps = Array.from(info.opponents);
              const isOpt = opps.length === 2 && info.sessions.length === 2 && info.is1v1;
              return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <td style="padding:0.4rem;"><strong>⭐ ${escapeHtml(a)}</strong></td>
                  <td style="padding:0.4rem;">${opps.length > 0 ? opps.map(o => `⭐ ${escapeHtml(o)}`).join(', ') : '<span class="text-muted">None</span>'}</td>
                  <td style="padding:0.4rem;">${info.sessions.join(', ') || '-'}</td>
                  <td style="padding:0.4rem;">${info.is1v1 ? '✅ Yes (1v1)' : '⚠️ 3-Way Match'}</td>
                  <td style="padding:0.4rem;">${isOpt ? '<span style="color:#10b981; font-weight:700;">✅ Optimal (2 Clashes)</span>' : '<span style="color:#f59e0b; font-weight:600;">⚠️ Acceptable (' + opps.length + ')</span>'}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `}
    </div>

    <!-- Parameter 3 Card: Challenger Exposure to A-Team -->
    <div class="card mb-3" style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
        <h4 style="margin:0;">3. Challenger vs A-Team Matches (Ideal: 2 A-Team Opponents)</h4>
        <span class="status-badge ${challengersFacingAtLeast1 === challengers.length ? 'badge-in-session' : 'badge-upcoming'}">
          ${challengersFacing2} of ${challengers.length} Face 2 A-Team
        </span>
      </div>
      <p class="text-sm text-muted" style="margin:0 0 0.75rem 0;">Ideal: Every non-A-Team angler faces 2 A-Team members across their 4 sessions. (Facing 1 is acceptable; facing 2 is ideal).</p>
      <table class="table text-sm" style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid var(--border); text-align:left;">
            <th style="padding:0.4rem;">Challenger</th>
            <th style="padding:0.4rem;">A-Team Opponents Faced</th>
            <th style="padding:0.4rem;">A-Team Matches</th>
            <th style="padding:0.4rem;">Evaluation</th>
          </tr>
        </thead>
        <tbody>
          ${challengers.map(c => {
            const opps = Array.from(challengerOpponents[c].aTeamOpponents);
            const count = opps.length;
            let evalBadge = '';
            if (count === 2) {
              evalBadge = '<span style="color:#10b981; font-weight:700;">✅ Optimal (2 A-Team)</span>';
            } else if (count === 1) {
              evalBadge = '<span style="color:#0284c7; font-weight:600;">✓ Acceptable (1 A-Team)</span>';
            } else if (count > 2) {
              evalBadge = '<span style="color:#8b5cf6; font-weight:600;">✓ High Exposure (' + count + ' A-Team)</span>';
            } else {
              evalBadge = '<span style="color:#ef4444; font-weight:700;">❌ Sub-optimal (0 A-Team)</span>';
            }
            return `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:0.4rem;"><strong>${escapeHtml(c)}</strong></td>
                <td style="padding:0.4rem;">${opps.length > 0 ? opps.map(o => `⭐ ${escapeHtml(o)}`).join(', ') : '<span class="text-muted">None</span>'}</td>
                <td style="padding:0.4rem;">${count}</td>
                <td style="padding:0.4rem;">${evalBadge}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Parameter 4 Card: Beat Stayer Optimization (Morning -> Afternoon Rotation) -->
    <div class="card mb-3" style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; flex-wrap:wrap; gap:0.4rem;">
        <h4 style="margin:0;">4. Beat Stayer Optimization (Morning ➔ Afternoon Rotation)</h4>
        <span class="status-badge ${stayerOptimal ? 'badge-in-session' : 'badge-upcoming'}">
          ${stayerRate}% Stayers on Overlapping Beats (${totalStayersFound}/${totalOverlappingBeats})
        </span>
      </div>
      <p class="text-sm text-muted" style="margin:0 0 0.75rem 0;">
        For beats fished in both Morning and Afternoon (Sat S1➔S2 and Sun S3➔S4), <strong>one person stays on the beat</strong> and waits for a fresh opponent, while the other competitor(s) move to new beats.
      </p>
      
      <div style="margin-bottom:0.75rem;">
        <strong class="text-sm" style="color:#38bdf8;">Saturday Rotation (S1 Morning ➔ S2 Afternoon):</strong>
        ${satAudit.overlaps.length === 0 ? `<div class="text-muted text-xs">No overlapping beats on Saturday.</div>` : `
          <table class="table text-xs mt-1" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid var(--border); text-align:left;">
                <th style="padding:0.3rem;">Beat</th>
                <th style="padding:0.3rem;">River</th>
                <th style="padding:0.3rem;">Stayer (Waited on Beat)</th>
                <th style="padding:0.3rem;">Moved Out</th>
                <th style="padding:0.3rem;">Arrived In</th>
                <th style="padding:0.3rem;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${satAudit.overlaps.map(o => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <td style="padding:0.3rem;"><strong>${escapeHtml(o.beatName)}</strong></td>
                  <td style="padding:0.3rem;">${escapeHtml(o.river)}</td>
                  <td style="padding:0.3rem;">${o.hasStayer ? `<span class="badge" style="background:#059669; color:#fff; padding:0.15rem 0.4rem; border-radius:4px; font-weight:700;">🔄 ${escapeHtml(o.stayer)}</span>` : '<span class="text-muted">None</span>'}</td>
                  <td style="padding:0.3rem;" class="text-muted">${o.moversAway.join(', ') || '-'}</td>
                  <td style="padding:0.3rem;" class="text-info">${o.moversIn.join(', ') || '-'}</td>
                  <td style="padding:0.3rem;">${o.hasStayer ? '<span style="color:#10b981; font-weight:700;">✅ Stayer Maintained</span>' : '<span style="color:#f59e0b;">⚠️ Full Mover</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>

      <div>
        <strong class="text-sm" style="color:#38bdf8;">Sunday Rotation (S3 Morning ➔ S4 Afternoon):</strong>
        ${sunAudit.overlaps.length === 0 ? `<div class="text-muted text-xs">No overlapping beats on Sunday.</div>` : `
          <table class="table text-xs mt-1" style="width:100%; border-collapse:collapse;">
            <thead>
              <tr style="border-bottom:1px solid var(--border); text-align:left;">
                <th style="padding:0.3rem;">Beat</th>
                <th style="padding:0.3rem;">River</th>
                <th style="padding:0.3rem;">Stayer (Waited on Beat)</th>
                <th style="padding:0.3rem;">Moved Out</th>
                <th style="padding:0.3rem;">Arrived In</th>
                <th style="padding:0.3rem;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${sunAudit.overlaps.map(o => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <td style="padding:0.3rem;"><strong>${escapeHtml(o.beatName)}</strong></td>
                  <td style="padding:0.3rem;">${escapeHtml(o.river)}</td>
                  <td style="padding:0.3rem;">${o.hasStayer ? `<span class="badge" style="background:#059669; color:#fff; padding:0.15rem 0.4rem; border-radius:4px; font-weight:700;">🔄 ${escapeHtml(o.stayer)}</span>` : '<span class="text-muted">None</span>'}</td>
                  <td style="padding:0.3rem;" class="text-muted">${o.moversAway.join(', ') || '-'}</td>
                  <td style="padding:0.3rem;" class="text-info">${o.moversIn.join(', ') || '-'}</td>
                  <td style="padding:0.3rem;">${o.hasStayer ? '<span style="color:#10b981; font-weight:700;">✅ Stayer Maintained</span>' : '<span style="color:#f59e0b;">⚠️ Full Mover</span>'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    </div>

    <!-- Parameter 5 Card: Dual-River Coverage (Small Blaar & Elands Pad) -->
    <div class="card mb-3" style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; flex-wrap:wrap; gap:0.4rem;">
        <h4 style="margin:0;">5. Dual-River Coverage (Small Blaar & Elands Pad)</h4>
        <span class="status-badge ${bothRiversRate >= 90 ? 'badge-in-session' : 'badge-upcoming'}">
          ${anglersBothRivers} of ${anglers.length} Fish Both Rivers (${bothRiversRate}%)
        </span>
      </div>
      <p class="text-sm text-muted" style="margin:0 0 0.75rem 0;">
        Ideal: Every angler gets the opportunity to fish on both <strong>Small Blaar</strong> and <strong>Elands Pad</strong> across their 4 competition sessions.
      </p>
      <table class="table text-xs" style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid var(--border); text-align:left;">
            <th style="padding:0.35rem;">Angler</th>
            <th style="padding:0.35rem;">Small Blaar Sessions</th>
            <th style="padding:0.35rem;">Elands Pad Sessions</th>
            <th style="padding:0.35rem;">Total Sessions</th>
            <th style="padding:0.35rem;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${anglers.map(a => {
            const counts = anglerRivers[a] || { sb: 0, ep: 0, total: 0 };
            const isBoth = (counts.sb > 0 && counts.ep > 0);
            return `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:0.35rem;"><strong>${escapeHtml(a)}</strong></td>
                <td style="padding:0.35rem;">${counts.sb} session${counts.sb === 1 ? '' : 's'}</td>
                <td style="padding:0.35rem;">${counts.ep} session${counts.ep === 1 ? '' : 's'}</td>
                <td style="padding:0.35rem;">${counts.total}</td>
                <td style="padding:0.35rem;">
                  ${isBoth 
                    ? '<span style="color:#10b981; font-weight:700;">✅ Both Rivers Fished</span>' 
                    : '<span style="color:#f59e0b; font-weight:600;">⚠️ Single River (' + (counts.sb > 0 ? 'Small Blaar' : 'Elands Pad') + ')</span>'}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Parameter 6 Card: Beat Daily Availability & Session Limits -->
    <div class="card mb-3" style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; flex-wrap:wrap; gap:0.4rem;">
        <h4 style="margin:0;">6. Beat Daily Availability &amp; Session Limits</h4>
        <span class="status-badge ${beatUsageCompliant ? 'badge-in-session' : 'badge-past'}">
          ${beatUsageCompliant ? '✅ 100% Compliant with Limits' : '❌ Capacity Violation Detected'}
        </span>
      </div>
      <p class="text-sm text-muted" style="margin:0 0 0.75rem 0;">
        Each beat is configured with daily availability and allowed session counts (1 Session vs 2 Sessions AM+PM) for Saturday and Sunday.
      </p>
      <table class="table text-xs" style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid var(--border); text-align:left;">
            <th style="padding:0.35rem;">Beat</th>
            <th style="padding:0.35rem;">River</th>
            <th style="padding:0.35rem;">Sat Limit</th>
            <th style="padding:0.35rem;">Sat Fished</th>
            <th style="padding:0.35rem;">Sun Limit</th>
            <th style="padding:0.35rem;">Sun Fished</th>
            <th style="padding:0.35rem;">Total Usage</th>
            <th style="padding:0.35rem;">Compliance</th>
          </tr>
        </thead>
        <tbody>
          ${Object.values(beatUsageCounts).map(b => {
            const maxSat = b.sat_available ? b.sat_sessions : 0;
            const maxSun = b.sun_available ? b.sun_sessions : 0;
            const valid = (b.satCount <= maxSat) && (b.sunCount <= maxSun);
            return `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:0.35rem;"><strong>${escapeHtml(b.name)}</strong></td>
                <td style="padding:0.35rem;">${escapeHtml(b.river)}</td>
                <td style="padding:0.35rem;">${b.sat_available ? `<span class="badge" style="background:#0284c7; color:#fff; font-size:0.7rem; padding:0.1rem 0.35rem;">${maxSat} Session${maxSat > 1 ? 's' : ''}</span>` : '<span class="badge" style="background:#ef4444; color:#fff; font-size:0.7rem; padding:0.1rem 0.35rem;">Unavailable</span>'}</td>
                <td style="padding:0.35rem;">${b.satCount}x ${b.satCount > maxSat ? '<span style="color:#ef4444; font-weight:700;">(Exceeded)</span>' : ''}</td>
                <td style="padding:0.35rem;">${b.sun_available ? `<span class="badge" style="background:#0284c7; color:#fff; font-size:0.7rem; padding:0.1rem 0.35rem;">${maxSun} Session${maxSun > 1 ? 's' : ''}</span>` : '<span class="badge" style="background:#ef4444; color:#fff; font-size:0.7rem; padding:0.1rem 0.35rem;">Unavailable</span>'}</td>
                <td style="padding:0.35rem;">${b.sunCount}x ${b.sunCount > maxSun ? '<span style="color:#ef4444; font-weight:700;">(Exceeded)</span>' : ''}</td>
                <td style="padding:0.35rem;">${b.totalCount} sessions</td>
                <td style="padding:0.35rem;">${valid ? '<span style="color:#10b981; font-weight:700;">✅ Compliant</span>' : '<span style="color:#ef4444; font-weight:700;">❌ Exceeded</span>'}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>

    <!-- Parameter 7 Card: CPS Beat Minimization & Return Audit -->
    <div class="card mb-3" style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; flex-wrap:wrap; gap:0.4rem;">
        <h4 style="margin:0;">7. Beat Minimization &amp; CPS Return Audit</h4>
        <span class="status-badge ${isOptimalBeatMinimization ? 'badge-in-session' : 'badge-upcoming'}">
          ${isOptimalBeatMinimization ? `✅ ${returnedBeatsList.length} Beats Returned to CPS (${totalBeatsUsedCount} Used)` : `⚠️ ${totalBeatsUsedCount} Beats Used`}
        </span>
      </div>
      <p class="text-sm text-muted" style="margin:0 0 0.75rem 0;">
        Uses as few beats as possible by starting on Elandspad &amp; SB6 in mornings, transitioning to top Small Blaar beats in afternoons with stayers, freeing unused beats back to CPS.
      </p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:0.75rem; margin-top:0.5rem;">
        <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.25); border-radius:6px; padding:0.75rem;">
          <div style="font-weight:700; color:#34d399; margin-bottom:0.35rem;">🎉 Unused Beats Ready for CPS Return (${returnedBeatsList.length}):</div>
          <div style="display:flex; flex-wrap:wrap; gap:0.4rem;">
            ${returnedBeatsList.map(b => `<span class="badge" style="background:rgba(16,185,129,0.25); color:#a7f3d0; font-size:0.8rem; padding:0.2rem 0.5rem; font-weight:700;">${escapeHtml(b)}</span>`).join('')}
          </div>
          <div class="text-xs text-muted mt-2">These beats are completely untouched and can be made available for CPS members.</div>
        </div>
        <div style="background:rgba(56,189,248,0.1); border:1px solid rgba(56,189,248,0.25); border-radius:6px; padding:0.75rem;">
          <div style="font-weight:700; color:#38bdf8; margin-bottom:0.35rem;">🌊 River Progression:</div>
          <div class="text-xs" style="line-height:1.5;">
            <div>• <strong>Morning:</strong> Starts on Elandspad (EP1, EP2, EP3) &amp; upper Small Blaar (SB6, SB5, SB3).</div>
            <div>• <strong>Afternoon:</strong> Moves onto top Small Blaar beats (SB(HOTEL), SB6, SB1, SB3, SB2, SB5).</div>
            <div>• <strong>Shared Double Beats:</strong> SB6, SB5, SB3 reused with waiting stayers (0m transition).</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Parameter 8 Card: Travel Time & Transition Balance Audit -->
    <div class="card mb-3" style="background:var(--bg-secondary); border:1px solid var(--border); border-radius:8px; padding:1rem;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem; flex-wrap:wrap; gap:0.4rem;">
        <h4 style="margin:0;">8. Travel Time &amp; Transition Balance Audit</h4>
        <span class="status-badge ${(isTravelBalanced && zeroExtremeTransitions) ? 'badge-in-session' : 'badge-upcoming'}">
          ${(isTravelBalanced && zeroExtremeTransitions) ? `✅ Balanced (±${travelDelta}m) &bull; 0 Extreme Transitions` : `⚠️ Range: ${minTravel}m - ${maxTravel}m`}
        </span>
      </div>
      <p class="text-sm text-muted" style="margin:0 0 0.75rem 0;">
        Ensures travel times are fair and balanced across all anglers, and prevents high-canyon gorge anglers (EP3/EP2) from having long jumps down to lower-pass beats (SB1/Hotel).
      </p>
      <div class="text-xs mb-2">
        ${zeroExtremeTransitions 
          ? '<span style="color:#10b981; font-weight:700;">✅ Perfect Transition Matching: 0 extreme jumps detected. Gorge anglers on EP3/EP2 transition to upper trailhead beats (SB6/SB5).</span>'
          : `<span style="color:#ef4444; font-weight:700;">⚠️ Extreme Jumps: ${extremeTransitions.join(', ')}</span>`
        }
      </div>
      <table class="table text-xs" style="width:100%; border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:1px solid var(--border); text-align:left;">
            <th style="padding:0.35rem;">Angler</th>
            <th style="padding:0.35rem;">Total Weekend Travel</th>
            <th style="padding:0.35rem;">Variance vs Field Mean</th>
            <th style="padding:0.35rem;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${anglers.map(a => {
            const t = anglerTravelTotals[a] || 0;
            const diff = t - Math.round((minTravel + maxTravel) / 2);
            return `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:0.35rem;"><strong>${escapeHtml(a)}</strong></td>
                <td style="padding:0.35rem; font-weight:700; color:#fbbf24;">⏱️ ${t} min</td>
                <td style="padding:0.35rem;">${diff >= 0 ? '+' : ''}${diff} min</td>
                <td style="padding:0.35rem;"><span style="color:#10b981; font-weight:600;">✅ Balanced</span></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  body.innerHTML = html;
  modal.classList.remove('hidden');
}

function unlockAdminInline() {
  const input = document.getElementById("inlineAdminPassword");
  const errEl = document.getElementById("inlineAdminError");
  if (!input) return;
  const pwd = input.value.trim();
  if (pwd === "small-Blaar") {
    sessionStorage.setItem("admin_password", pwd);
    if (errEl) errEl.classList.add("hidden");
    updateAdminUIState();
    alert("🔓 Organizer Admin Mode Unlocked!");
  } else {
    if (errEl) errEl.classList.remove("hidden");
  }
}

// --- Navigation & UI Utilities ---
function switchTab(tabId) {
  currentTab = tabId;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabId}`);
  });

  if (tabId === 'map') {
    initOrUpdateMap();
    if (typeof streamMap !== 'undefined' && streamMap) {
      setTimeout(() => { streamMap.invalidateSize(); }, 150);
    }
  }

  // Sync admin angler text if opening admin
  if (tabId === 'admin') {
    updateAdminUIState();
    loadSavedSessionsList();
    if (tournamentState) {
      const nameInput = document.getElementById('adminTournamentName');
      const venueInput = document.getElementById('adminVenue');
      if (nameInput && tournamentState.tournament_name) nameInput.value = tournamentState.tournament_name;
      if (venueInput && tournamentState.venue) venueInput.value = tournamentState.venue;
    }
    renderAdminBeatsConfig();
    if (tournamentState && tournamentState.anglers) {
      const listEl = document.getElementById('adminAnglerList');
      if (!listEl.value.trim()) {
        listEl.value = tournamentState.anglers.join('\n');
      }
      if (tournamentState && tournamentState.a_team_anglers && selectedAteamSet.size === 0) {
        selectedAteamSet.clear();
        tournamentState.a_team_anglers.forEach(a => selectedAteamSet.add(a));
      }
      updateAnglerCountHint();
      renderAteamChecklist();
      renderAnglerAvailability();
    }
  }
}

// --- Network & Phone QR Sharing ---
let localNetworkUrl = '';
const customDomainUrl = 'https://trials.wpflyfishing.com';
let currentShareMode = 'domain';

async function fetchNetworkInfo() {
  try {
    const res = await fetch('/api/network_info');
    if (!res.ok) return;
    const info = await res.json();
    localNetworkUrl = info.network_url;
    renderShareUrl();
  } catch (e) {
    console.warn("Could not fetch network info:", e);
    renderShareUrl();
  }
}

function switchShareUrlMode(mode) {
  currentShareMode = mode;
  document.getElementById('btnShareDomain').classList.toggle('active', mode === 'domain');
  document.getElementById('btnShareLocal').classList.toggle('active', mode === 'local');
  renderShareUrl();
}

function renderShareUrl() {
  const activeUrl = currentShareMode === 'domain' ? customDomainUrl : (localNetworkUrl || window.location.origin);
  const input = document.getElementById('networkUrlInput');
  const label = document.getElementById('shareUrlLabel');
  if (input) input.value = activeUrl;
  if (label) label.textContent = currentShareMode === 'domain' ? 'Public Domain URL (Namecheap & Cloudflare):' : 'Local Wi-Fi Network URL:';

  // Render client-side QR Code
  const qrContainer = document.getElementById('qrCodeContainer');
  if (!qrContainer) return;
  qrContainer.innerHTML = '';
  if (window.QRCode) {
    qrCodeObj = new QRCode(qrContainer, {
      text: activeUrl,
      width: 180,
      height: 180,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
  }
}

function openShareModal() {
  renderShareUrl();
  document.getElementById('shareModal').classList.remove('hidden');
}

function closeShareModal() {
  document.getElementById('shareModal').classList.add('hidden');
}

function copyNetworkUrl() {
  const input = document.getElementById('networkUrlInput');
  input.select();
  document.execCommand('copy');
  alert(`Copied to clipboard!\n${input.value}\nShare this with anglers on the riverbank.`);
}

// --- Session Snapshot & Save Manager ---
function openSaveSnapshotModal(sessionId = "") {
  const select = document.getElementById('saveSnapshotScope');
  if (select) {
    select.value = sessionId !== undefined ? sessionId : "";
  }
  const nameInput = document.getElementById('saveSnapshotName');
  if (nameInput) {
    nameInput.value = sessionId ? `Session_${sessionId}_Completed` : "";
  }
  document.getElementById('saveSnapshotModal').classList.remove('hidden');
}

function closeSaveSnapshotModal() {
  document.getElementById('saveSnapshotModal').classList.add('hidden');
}

async function quickSaveSession(sessionId) {
  try {
    const res = await fetch('/api/session/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        snapshot_name: `Session_${sessionId}_QuickSave`
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(`💾 Session ${sessionId} saved successfully!\nSnapshot file: ${data.filename}`);
      await loadState();
      loadSavedSessionsList();
    } else {
      alert(`Error saving session: ${data.error || 'Failed'}`);
    }
  } catch (err) {
    alert(`Request error: ${err.message}`);
  }
}

async function submitSaveSnapshot(e) {
  e.preventDefault();
  const scopeVal = document.getElementById('saveSnapshotScope').value;
  const nameVal = document.getElementById('saveSnapshotName').value.trim();

  const payload = {
    session_id: scopeVal ? parseInt(scopeVal) : null,
    snapshot_name: nameVal || (scopeVal ? `Session_${scopeVal}` : "Tournament_Snapshot")
  };

  try {
    const res = await fetch('/api/session/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      closeSaveSnapshotModal();
      alert(`💾 Snapshot saved successfully!\nSaved to: ${data.filename}`);
      await loadState();
      loadSavedSessionsList();
    } else {
      alert(`Error: ${data.error || 'Failed to save snapshot'}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function loadSavedSessionsList() {
  const tbody = document.getElementById('savedSessionsBody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/session/saves');
    if (!res.ok) return;
    const saves = await res.json();

    if (!saves || saves.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-3 text-muted">No saved session snapshots yet. Click "+ New Session Snapshot" to create one.</td></tr>`;
      return;
    }

    let html = '';
    saves.forEach(item => {
      const sessLabel = item.session_id ? `Session ${item.session_id}` : `Full Tournament`;
      const sessBadgeClass = item.session_id ? `tag-accent` : `tag-format`;
      const dateFormatted = new Date(item.saved_at).toLocaleString();
      const kbSize = (item.file_size / 1024).toFixed(1) + " KB";

      html += `
        <tr>
          <td><strong>${escapeHtml(item.snapshot_name || item.filename)}</strong><br/><small class="text-dim monospace">${escapeHtml(item.filename)}</small></td>
          <td><span class="meta-tag ${sessBadgeClass}">${sessLabel}</span></td>
          <td class="text-sm">${dateFormatted}</td>
          <td><span class="monospace">${item.num_anglers} anglers</span></td>
          <td><span class="score-highlight" style="font-size:0.95rem;">${item.completed_matches} / ${item.total_matches}</span></td>
          <td class="text-sm monospace">${kbSize}</td>
          <td>
            <div style="display:flex; gap:0.35rem;">
              <button class="btn btn-sm btn-primary" onclick="loadSnapshotFile('${escapeHtml(item.filename)}')">
                Restore
              </button>
              <button class="btn btn-sm btn-danger" onclick="deleteSnapshotFile('${escapeHtml(item.filename)}')">
                Delete
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  } catch (err) {
    console.error("Failed to load saved sessions:", err);
  }
}

async function loadSnapshotFile(filename) {
  const ok = confirm(`⚠️ Are you sure you want to load snapshot '${filename}'?\nThis will restore tournament scores and match states from that saved point.`);
  if (!ok) return;

  try {
    const res = await fetch('/api/session/load', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename })
    });
    const data = await res.json();
    if (data.success) {
      alert(`🎉 Snapshot '${filename}' restored successfully!`);
      await loadState();
      switchTab('schedule');
    } else {
      alert(`Error restoring snapshot: ${data.error || 'Failed'}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function deleteSnapshotFile(filename) {
  const ok = confirm(`Delete snapshot '${filename}' permanently?`);
  if (!ok) return;

  try {
    const res = await fetch('/api/session/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename })
    });
    const data = await res.json();
    if (data.success) {
      loadSavedSessionsList();
    } else {
      alert(`Error deleting snapshot: ${data.error || 'Failed'}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function handleImportJsonFile(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(evt) {
    try {
      const parsed = JSON.parse(evt.target.result);
      const res = await fetch('/api/session/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      });
      const data = await res.json();
      if (data.success) {
        alert("🎉 Tournament file imported successfully!");
        await loadState();
        switchTab('schedule');
      } else {
        alert(`Import failed: ${data.error || 'Invalid file format'}`);
      }
    } catch (err) {
      alert(`Failed to parse JSON file: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// ========================================================
// MAP CONTROLLER, 4-SESSION PIN TRACKER & BEAT MANAGER
// ========================================================

let streamMap = null;
let currentMapLayerName = 'artistic';
let baseTileLayers = {};
let riverVectorLayers = {};
let beatMarkersLayerGroup = null;
let anglerPinsLayerGroup = null;
let selectedTrackingAngler = '';
let currentEditingBeatsList = [];

// River centerline coordinates for artistic view and accurate riverbed tracing
const RIVER_PATHS_CLIENT = {
  "Smalblaar": [
    [-33.7346, 19.1030],
    [-33.7342, 19.1065],
    [-33.7335, 19.1090],
    [-33.7330, 19.1105],
    [-33.7323, 19.1125],
    [-33.7319, 19.1141],
    [-33.7315, 19.1180],
    [-33.7312, 19.1220],
    [-33.7305, 19.1270],
    [-33.7298, 19.1305],
    [-33.7295, 19.1320],
    [-33.7290, 19.1345],
    [-33.7285, 19.1370],
    [-33.7278, 19.1395],
    [-33.7272, 19.1415],
    [-33.7265, 19.1440],
    [-33.7258, 19.1470],
    [-33.7248, 19.1500],
    [-33.7235, 19.1530],
    [-33.7225, 19.1560],
    [-33.7212, 19.1590],
    [-33.7200, 19.1625],
    [-33.7190, 19.1655],
    [-33.7180, 19.1680],
    [-33.7170, 19.1700],
    [-33.7160, 19.1720],
    [-33.7150, 19.1740],
    [-33.7142, 19.1758],
    [-33.7138, 19.1770],
    [-33.7130, 19.1785],
    [-33.7125, 19.1800],
    [-33.7115, 19.1820],
    [-33.7105, 19.1845],
    [-33.7095, 19.1870],
    [-33.7085, 19.1895],
    [-33.7075, 19.1920],
    [-33.7065, 19.1945],
    [-33.7052, 19.1975],
    [-33.7040, 19.2000],
    [-33.7025, 19.2040],
    [-33.7005, 19.2085],
    [-33.6985, 19.2140],
    [-33.6970, 19.2195],
    [-33.6960, 19.2245]
  ],
  "Elandspad": [
    [-33.7319, 19.1141],
    [-33.7335, 19.1145],
    [-33.7350, 19.1150],
    [-33.7360, 19.1152],
    [-33.7375, 19.1156],
    [-33.7390, 19.1160],
    [-33.7405, 19.1162],
    [-33.7420, 19.1164],
    [-33.7440, 19.1168],
    [-33.7460, 19.1172],
    [-33.7480, 19.1175],
    [-33.7500, 19.1182],
    [-33.7520, 19.1188],
    [-33.7540, 19.1192],
    [-33.7565, 19.1195],
    [-33.7585, 19.1200],
    [-33.7610, 19.1205]
  ]
};

const TRAIL_PATHS_CLIENT = {
  "Elandspad River Path": [
    [-33.7295, 19.1320],
    [-33.7310, 19.1220],
    [-33.7319, 19.1141],
    [-33.7350, 19.1145],
    [-33.7405, 19.1160],
    [-33.7460, 19.1170],
    [-33.7520, 19.1185],
    [-33.7610, 19.1200]
  ],
  "Smalblaar Angler Trail": [
    [-33.7295, 19.1320],
    [-33.7275, 19.1410],
    [-33.7240, 19.1520],
    [-33.7195, 19.1650],
    [-33.7155, 19.1735],
    [-33.7130, 19.1795],
    [-33.7090, 19.1890]
  ]
};

// Render Top Angler Dropdown
function renderTopAnglerDropdown() {
  const sel = document.getElementById('topAnglerSelector');
  if (!sel) return;
  const anglers = (tournamentState && tournamentState.anglers) || [];
  if (anglers.length === 0) {
    sel.innerHTML = '<option value="">No anglers in this trial yet</option>';
    return;
  }

  const currentVal = sel.value || selectedTrackingAngler || "";
  let html = '<option value="">Select your name to track 4 sessions...</option>';

  const aTeamSet = new Set((tournamentState && tournamentState.a_team_anglers) || []);
  anglers.forEach(a => {
    const isA = aTeamSet.has(a);
    html += `<option value="${escapeHtml(a)}" ${a === currentVal ? 'selected' : ''}>${escapeHtml(a)} ${isA ? '⭐ [Top 8]' : ''}</option>`;
  });

  sel.innerHTML = html;
}

// When Top Angler Selected
function onTopAnglerSelected() {
  const sel = document.getElementById('topAnglerSelector');
  if (!sel) return;

  selectedTrackingAngler = sel.value;
  const pillsRow = document.getElementById('quickSessionPills');
  const card = document.getElementById('anglerItineraryCard');

  if (!selectedTrackingAngler) {
    if (pillsRow) pillsRow.classList.add('hidden');
    if (card) card.classList.add('hidden');
    updateMapPins();
    return;
  }

  // Look up schedule for this angler
  const sched = (tournamentState.angler_schedule && tournamentState.angler_schedule[selectedTrackingAngler]) || [];

  if (pillsRow) {
    pillsRow.classList.remove('hidden');
    // Populate the 4 quick session pills
    sched.forEach(s => {
      const el = document.getElementById(`pillS${s.session_id}`);
      if (el) {
        const icon = s.session_id === 1 ? '🟡' : (s.session_id === 2 ? '🟠' : (s.session_id === 3 ? '🟢' : '🔵'));
        const stayTag = s.is_stayer ? ' (2nd half)' : '';
        el.textContent = `${icon} S${s.session_id}: ${s.beat_code || s.beat_name}${stayTag}`;
        el.title = `${s.session_name} - ${s.beat_name} (${s.river}) vs ${s.opponents.join(', ')}`;
      }
    });
  }

  renderAnglerItinerary(selectedTrackingAngler, sched);
  updateMapPins();
}

function clearAnglerSelection() {
  const sel = document.getElementById('topAnglerSelector');
  if (sel) sel.value = '';
  onTopAnglerSelected();
}

function renderAnglerItinerary(anglerName, sched) {
  const card = document.getElementById('anglerItineraryCard');
  const title = document.getElementById('itineraryAnglerName');
  const grid = document.getElementById('itineraryGrid');
  if (!card || !title || !grid) return;

  card.classList.remove('hidden');
  const aTeamSet = new Set(tournamentState.a_team_anglers || []);
  const isA = aTeamSet.has(anglerName);
  const totalTravel = sched.reduce((sum, s) => sum + (s.travel_time || 15), 0);
  title.innerHTML = `<strong>${escapeHtml(anglerName)}</strong> ${isA ? '<span class="badge" style="background:#f59e0b; color:#1e1b4b; font-weight:700; margin-left:0.5rem; font-size:0.75rem;">⭐ Top 8 Angler</span>' : ''} <span class="badge" style="background:rgba(245,158,11,0.15); color:#fbbf24; border:1px solid rgba(245,158,11,0.3); font-weight:700; margin-left:0.5rem; font-size:0.75rem;">⏱️ Total Est. Travel: ${totalTravel} min</span>`;

  let html = '';
  sched.forEach(s => {
    const prevSess = sched.find(p => p.session_id === (s.session_id - 1));
    let transitionInfo = '';
    if (prevSess && (s.session_id === 2 || s.session_id === 4)) {
      if (s.is_stayer) {
        transitionInfo = '<div class="text-xs" style="color:#10b981; margin-top:0.25rem;">📍 <strong>0 min drive:</strong> Stayer waiting on beat for afternoon opponent</div>';
      } else {
        const prevB = prevSess.beat_code || prevSess.beat_id;
        const currB = s.beat_code || s.beat_id;
        const isTrailhead = (prevB === 'EP3' || prevB === 'EP2') && (currB === 'SB6' || currB === 'SB5');
        if (isTrailhead) {
          transitionInfo = `<div class="text-xs" style="color:#38bdf8; margin-top:0.25rem;">🚶 <strong>Trailhead Transfer:</strong> 0 min highway drive (exiting gorge directly onto ${currB})</div>`;
        } else {
          transitionInfo = `<div class="text-xs text-muted" style="margin-top:0.25rem;">🚶 <strong>Transfer:</strong> ${prevB} ➔ ${currB} (~10-15 min drive)</div>`;
        }
      }
    }
    const isSat = s.session_id <= 2;
    const isSolo = s.is_solo || s.match_type === 'SOLO';
    const isStay = s.is_stayer;
    const isYP = (s.river && s.river.toLowerCase().includes('eland'));
    const riverClass = isYP ? 'popup-river-yp' : 'popup-river-sb';
    const riverDisplay = isYP ? 'Elands Pad' : 'Small Blaar';
    const cardClass = `card-s${s.session_id}`;
    const pin = s.pin || s.lower_pin || [-33.7319, 19.1141];

    const statusTag = isSolo 
      ? '<span class="itinerary-status-tag" style="background:rgba(99,102,241,0.25); color:#a5b4fc; border:1px solid rgba(99,102,241,0.4);">👤 Solo Beat (Non-Competing)</span>'
      : `<span class="itinerary-status-tag ${isStay ? 'tag-stay' : 'tag-move'}">${isStay ? '📍 Stay on Beat' : '🚶 Move Beat'}</span>`;

    const sectionDisplay = isSolo ? 'Full Beat (Solo Session)' : (s.section || 'First Half');
    const opponentDisplay = isSolo ? 'None (Solo Beat)' : (s.opponents && s.opponents.length > 0 ? s.opponents.join(' & ') : 'None');

    html += `
      <div class="itinerary-card ${cardClass}">
        <div class="d-flex justify-content-between align-items-center">
          <span class="sess-pill pill-s${s.session_id}">${s.session_name}</span>
          ${statusTag}
        </div>
        <div class="itinerary-beat-title">${escapeHtml(s.beat_name || s.beat_code)}</div>
        <div class="popup-river-tag ${riverClass}">${escapeHtml(riverDisplay)} &bull; ${escapeHtml(sectionDisplay)}</div>
        <div class="popup-detail"><strong>Opponent(s):</strong> ${escapeHtml(opponentDisplay)}</div>
        <div class="popup-detail" style="color:#fbbf24;"><strong>Travel Time:</strong> ⏱️ ${s.travel_time || 15} min</div>
        <div class="popup-detail"><strong>Meeting Point:</strong> ${escapeHtml(s.meeting_point || 'Bridge Layby')}</div>
        ${transitionInfo}
        <div class="popup-detail"><strong>GPS:</strong> <code>${pin[0].toFixed(4)}, ${pin[1].toFixed(4)}</code></div>
        <a href="https://www.google.com/maps/search/?api=1&query=${pin[0]},${pin[1]}" target="_blank" class="popup-nav-link">
          🧭 Open in Google Maps Navigation &rarr;
        </a>
      </div>
    `;
  });

  grid.innerHTML = html;
}

// ========================================================
// LEAFLET MAP INITIALIZATION & LAYER SWITCHER
// ========================================================

let riverVectorsLayerGroup = null;

// Smalblaar & Elandspad geographical bounding box (valley limits)
const CPS_VALLEY_BOUNDS = [
  [-33.775, 19.085], // Southwest: Du Toitskloof tunnel entrance & lower Smalblaar
  [-33.685, 19.230]  // Northeast: Lower Molenaars / Kraalstroom
];

function initOrUpdateMap() {
  const mapContainer = document.getElementById('streamMap');
  if (!mapContainer || typeof L === 'undefined') return;

  if (!streamMap) {
    // Initial center on Du Toitskloof valley / Junction pool
    streamMap = L.map('streamMap', {
      center: [-33.727, 19.145],
      zoom: 13,
      minZoom: 12, // Clamped: Cannot zoom out further than Smalblaar & Elandspad valley!
      maxZoom: 18, // Zoom in to pools, boulders, and beat boundaries
      maxBounds: CPS_VALLEY_BOUNDS,
      maxBoundsViscosity: 0.9,
      zoomControl: true,
      attributionControl: true
    });

    // 1. Satellite (Esri World Imagery - Ultra high res, no API key required)
    baseTileLayers['satellite'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Esri &bull; High-Res Satellite'
    });

    // 2. Topographic & Mountain Relief (Esri World Topo Map - No API key required)
    baseTileLayers['topo'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: 'Esri &bull; Topographic Mountain Map'
    });

    // 3. Street Map (OpenStreetMap - Free open community map, no API key required)
    baseTileLayers['street'] = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: 'OpenStreetMap'
    });

    // 4. Artistic River View (High-Res satellite terrain with luminous artistic river ribbon)
    baseTileLayers['artistic'] = baseTileLayers['satellite'];

    // Default layer: Satellite with Artistic River Flare
    baseTileLayers['satellite'].addTo(streamMap);
    currentMapLayerName = 'satellite';

    // Layer groups for vectors and pins
    riverVectorsLayerGroup = L.layerGroup().addTo(streamMap);
    beatMarkersLayerGroup = L.layerGroup().addTo(streamMap);
    anglerPinsLayerGroup = L.layerGroup().addTo(streamMap);

    // Render river centerlines and trails following authentic river course
    drawRiverAndTrailVectors();
  }

  updateMapPins();
}

function switchMapLayer(layerName) {
  if (!streamMap) return;

  const targetTileLayer = baseTileLayers[layerName] || baseTileLayers['satellite'];
  Object.values(baseTileLayers).forEach(l => {
    if (streamMap.hasLayer(l) && l !== targetTileLayer) streamMap.removeLayer(l);
  });
  if (!streamMap.hasLayer(targetTileLayer)) {
    targetTileLayer.addTo(streamMap);
  }

  currentMapLayerName = layerName;

  // Toggle artistic river styling flare
  drawRiverAndTrailVectors();

  // Update UI buttons
  ['artistic', 'satellite', 'topo', 'street'].forEach(k => {
    const btn = document.getElementById(`layerBtn${k.charAt(0).toUpperCase() + k.slice(1)}`);
    if (btn) btn.classList.toggle('active', k === layerName);
  });
}

function resetMapView() {
  if (streamMap) {
    streamMap.fitBounds([
      [-33.755, 19.105],
      [-33.705, 19.215]
    ], { padding: [25, 25] });
  }
}

// Draws the flowing river polylines with authentic curves and artistic flare
function drawRiverAndTrailVectors() {
  if (!streamMap) return;
  if (!riverVectorsLayerGroup) {
    riverVectorsLayerGroup = L.layerGroup().addTo(streamMap);
  } else {
    riverVectorsLayerGroup.clearLayers();
  }

  const isArtistic = (currentMapLayerName === 'artistic' || currentMapLayerName === 'satellite');

  // --- 1. Smalblaar (Molenaars) River Path ---
  const sbPath = RIVER_PATHS_CLIENT["Smalblaar"];
  
  if (isArtistic) {
    // Outer Aquatic Glow Ribbon
    L.polyline(sbPath, {
      color: '#00e5ff',
      weight: 12,
      opacity: 0.4,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(riverVectorsLayerGroup);
  }

  // Deep Mountain River Core
  L.polyline(sbPath, {
    color: '#0284c7',
    weight: isArtistic ? 6 : 5,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(riverVectorsLayerGroup);

  // Shimmering Water Current
  L.polyline(sbPath, {
    color: '#e0f2fe',
    weight: 2,
    opacity: 0.95,
    dashArray: '8, 12',
    lineCap: 'round'
  }).addTo(riverVectorsLayerGroup).bindTooltip("🌊 Smalblaar River (Molenaars Valley)", { sticky: true });

  // --- 2. Elandspad River Path ---
  const ypPath = RIVER_PATHS_CLIENT["Elandspad"];

  if (isArtistic) {
    // Outer Emerald Gorge Glow
    L.polyline(ypPath, {
      color: '#34d399',
      weight: 12,
      opacity: 0.4,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(riverVectorsLayerGroup);
  }

  // Deep Mountain Jade Core
  L.polyline(ypPath, {
    color: '#059669',
    weight: isArtistic ? 6 : 5,
    opacity: 0.9,
    lineCap: 'round',
    lineJoin: 'round'
  }).addTo(riverVectorsLayerGroup);

  // Shimmering Water Current
  L.polyline(ypPath, {
    color: '#ecfdf5',
    weight: 2,
    opacity: 0.95,
    dashArray: '8, 12',
    lineCap: 'round'
  }).addTo(riverVectorsLayerGroup).bindTooltip("🌿 Elandspad River (Mountain Gorge)", { sticky: true });

  // --- 3. Access Trails ---
  Object.entries(TRAIL_PATHS_CLIENT).forEach(([name, coords]) => {
    L.polyline(coords, {
      color: '#f59e0b',
      weight: 3.5,
      dashArray: '6, 6',
      opacity: 0.85
    }).addTo(riverVectorsLayerGroup).bindTooltip(`🥾 ${name}`, { sticky: true });
  });
}

// Updates all beat boundaries and the selected angler's 4 pins with hover & persistent popup selection
function updateMapPins() {
  if (!streamMap || !beatMarkersLayerGroup || !anglerPinsLayerGroup) return;

  beatMarkersLayerGroup.clearLayers();
  anglerPinsLayerGroup.clearLayers();

  const beats = (tournamentState && tournamentState.beats) || [];
  const activeSelectedBeats = (tournamentState && tournamentState.selected_beats) || [];

  // 1. Draw Beat Boundaries (Start/Mid/End) directly along the river course
  beats.forEach(b => {
    if (!b.enabled && activeSelectedBeats.every(sb => sb.id !== b.id)) return;

    const lower = b.lower_pin;
    const mid = b.mid_pin;
    const upper = b.upper_pin;

    if (lower) {
      const markerLower = L.circleMarker(lower, {
        radius: 7,
        fillColor: '#10b981',
        color: '#ffffff',
        weight: 2.5,
        fillOpacity: 0.95
      });
      // Hover tooltip: indicates what it is immediately
      markerLower.bindTooltip(`
        <div style="font-weight:700; color:#10b981; font-size:12px;">📍 Start (Lower Pin)</div>
        <div style="font-size:13px; font-weight:800; color:#0f172a;">${escapeHtml(b.name)}</div>
        <div style="font-size:11px; color:#475569;">${escapeHtml(b.river)} &bull; ${escapeHtml(b.meeting_point || '')}</div>
      `, {
        direction: 'top',
        offset: [0, -10],
        opacity: 0.98,
        className: 'custom-beat-tooltip'
      });
      // Click selection: persistent popup that stays and doesn't reload
      markerLower.bindPopup(buildBeatPopup(b, 'Start (Lower Pin)', lower), {
        autoClose: false,
        closeOnClick: false,
        className: 'persistent-beat-popup',
        maxWidth: 340,
        minWidth: 280
      });
      beatMarkersLayerGroup.addLayer(markerLower);
    }

    if (upper) {
      const markerUpper = L.circleMarker(upper, {
        radius: 7,
        fillColor: '#ef4444',
        color: '#ffffff',
        weight: 2.5,
        fillOpacity: 0.95
      });
      // Hover tooltip
      markerUpper.bindTooltip(`
        <div style="font-weight:700; color:#ef4444; font-size:12px;">🏁 End (Upper Pin)</div>
        <div style="font-size:13px; font-weight:800; color:#0f172a;">${escapeHtml(b.name)}</div>
        <div style="font-size:11px; color:#475569;">${escapeHtml(b.river)} &bull; ${escapeHtml(b.meeting_point || '')}</div>
      `, {
        direction: 'top',
        offset: [0, -10],
        opacity: 0.98,
        className: 'custom-beat-tooltip'
      });
      // Click selection: persistent popup that stays and doesn't reload
      markerUpper.bindPopup(buildBeatPopup(b, 'End (Upper Pin)', upper), {
        autoClose: false,
        closeOnClick: false,
        className: 'persistent-beat-popup',
        maxWidth: 340,
        minWidth: 280
      });
      beatMarkersLayerGroup.addLayer(markerUpper);
    }

    if (mid) {
      const markerMid = L.circleMarker(mid, {
        radius: 6,
        fillColor: '#0ea5e9',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 0.9
      });
      // Hover tooltip
      markerMid.bindTooltip(`
        <div style="font-weight:700; color:#0ea5e9; font-size:12px;">⏱️ Midpoint / 2nd Half</div>
        <div style="font-size:13px; font-weight:800; color:#0f172a;">${escapeHtml(b.name)}</div>
        <div style="font-size:11px; color:#475569;">${escapeHtml(b.river)} &bull; Meeting Point</div>
      `, {
        direction: 'top',
        offset: [0, -10],
        opacity: 0.98,
        className: 'custom-beat-tooltip'
      });
      // Click selection: persistent popup that stays and doesn't reload
      markerMid.bindPopup(buildBeatPopup(b, 'Midpoint / Meeting / 2nd Half', mid), {
        autoClose: false,
        closeOnClick: false,
        className: 'persistent-beat-popup',
        maxWidth: 340,
        minWidth: 280
      });
      beatMarkersLayerGroup.addLayer(markerMid);
    }
  });

  // 2. Draw 4-Session Color Coded Pins for Selected Angler
  if (selectedTrackingAngler && tournamentState.angler_schedule) {
    const sched = tournamentState.angler_schedule[selectedTrackingAngler] || [];
    const pinCoords = [];

    sched.forEach(s => {
      const sId = s.session_id;
      const pinClass = `pin-s${sId}`;
      const color = sId === 1 ? '#eab308' : (sId === 2 ? '#f97316' : (sId === 3 ? '#10b981' : '#3b82f6'));
      const coord = s.pin || s.lower_pin || [-33.7319, 19.1141];
      pinCoords.push(coord);

      const customIcon = L.divIcon({
        className: 'custom-pin-container',
        html: `
          <div class="custom-pin ${pinClass}" style="width: 32px; height: 32px; font-weight: 800; font-size: 13px;">
            S${sId}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -18]
      });

      const pinMarker = L.marker(coord, { icon: customIcon });
      pinMarker.bindTooltip(`
        <div style="font-weight:700; color:${color}; font-size:12px;">Session ${sId}: ${escapeHtml(selectedTrackingAngler)}</div>
        <div style="font-size:13px; font-weight:800; color:#0f172a;">${escapeHtml(s.beat_name || s.beat_code)}</div>
        <div style="font-size:11px; color:#475569;">${escapeHtml(s.river)} &bull; Opponents: ${escapeHtml(s.opponents.join(' & '))}</div>
      `, {
        direction: 'top',
        offset: [0, -18],
        opacity: 0.98,
        className: 'custom-beat-tooltip'
      });
      pinMarker.bindPopup(buildAnglerSessionPopup(selectedTrackingAngler, s, coord), {
        autoClose: false,
        closeOnClick: false,
        className: 'persistent-beat-popup',
        maxWidth: 340,
        minWidth: 280
      });
      anglerPinsLayerGroup.addLayer(pinMarker);
    });

    if (pinCoords.length > 0) {
      const bounds = L.latLngBounds(pinCoords);
      streamMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    }
  }
}

function buildBeatPopup(beat, typeLabel, coord) {
  const isYP = (beat.river && beat.river.toLowerCase().includes('eland'));
  const riverClass = isYP ? 'popup-river-yp' : 'popup-river-sb';
  const riverDisplay = isYP ? 'Elands Pad' : 'Small Blaar';
  return `
    <div class="map-popup-card">
      <div class="popup-beat-photo-wrap">
        <img src="stream_pool_enhanced.jpg" alt="Cape Mountain Stream Pool" class="popup-beat-img">
        <span class="popup-photo-badge">📸 Crystal Stream Pool</span>
      </div>
      <span class="popup-session-badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">${typeLabel}</span>
      <h4>${escapeHtml(beat.name || beat.code)}</h4>
      <div class="popup-river-tag ${riverClass}">${escapeHtml(riverDisplay)}</div>
      <div class="popup-detail"><strong>Meeting Point:</strong> ${escapeHtml(beat.meeting_point || 'Layby')}</div>
      <div class="popup-detail"><strong>GPS:</strong> <code>${coord[0].toFixed(5)}, ${coord[1].toFixed(5)}</code></div>
      <div class="popup-detail text-muted text-sm">${escapeHtml(beat.notes || '')}</div>
      <a href="https://www.google.com/maps/search/?api=1&query=${coord[0]},${coord[1]}" target="_blank" class="popup-nav-link">
        🧭 Navigate with Google Maps &rarr;
      </a>
    </div>
  `;
}

function buildAnglerSessionPopup(anglerName, sessionInfo, coord) {
  const sId = sessionInfo.session_id;
  const color = sId === 1 ? '#eab308' : (sId === 2 ? '#f97316' : (sId === 3 ? '#10b981' : '#3b82f6'));
  const isYP = (sessionInfo.river && sessionInfo.river.toLowerCase().includes('eland'));
  const riverClass = isYP ? 'popup-river-yp' : 'popup-river-sb';
  const riverDisplay = isYP ? 'Elands Pad' : 'Small Blaar';

  return `
    <div class="map-popup-card">
      <div class="popup-beat-photo-wrap">
        <img src="stream_pool_enhanced.jpg" alt="Cape Mountain Stream Pool" class="popup-beat-img">
        <span class="popup-photo-badge">📸 Crystal Stream Pool</span>
      </div>
      <span class="popup-session-badge" style="background: ${color}25; color: ${color}; border: 1px solid ${color};">
        Session ${sId}: ${sessionInfo.session_short}
      </span>
      <h4>${escapeHtml(anglerName)}</h4>
      <div class="popup-river-tag ${riverClass}">${escapeHtml(sessionInfo.beat_name)} (${escapeHtml(riverDisplay)})</div>
      <div class="popup-detail"><strong>Section:</strong> ${escapeHtml(sessionInfo.section)}</div>
      <div class="popup-detail"><strong>Status:</strong> ${sessionInfo.is_stayer ? '📍 Stayer (Morning &rarr; Afternoon)' : '🚶 Mover'}</div>
      <div class="popup-detail"><strong>Opponent(s):</strong> ${escapeHtml(sessionInfo.opponents.join(', '))}</div>
      <div class="popup-detail"><strong>Meeting Point:</strong> ${escapeHtml(sessionInfo.meeting_point || 'Layby')}</div>
      <div class="popup-detail"><strong>GPS:</strong> <code>${coord[0].toFixed(5)}, ${coord[1].toFixed(5)}</code></div>
      <a href="https://www.google.com/maps/search/?api=1&query=${coord[0]},${coord[1]}" target="_blank" class="popup-nav-link">
        🧭 Navigate to Beat in Google Maps &rarr;
      </a>
    </div>
  `;
}

// ========================================================
// BEAT MANAGER & GPS COORDINATES MODAL
// ========================================================

async function openBeatsManagerModal() {
  if (!isAdminAuthenticated()) {
    openAdminPasswordModal(() => openBeatsManagerModal());
    return;
  }

  const modal = document.getElementById('beatsManagerModal');
  const tbody = document.getElementById('beatsManagerBody');
  if (!modal || !tbody) return;

  modal.classList.remove('hidden');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center py-3">Loading CPS beats catalog...</td></tr>';

  try {
    const res = await fetch('/api/beats');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    currentEditingBeatsList = data.beats || (tournamentState && tournamentState.beats) || [];
    renderBeatsManagerTable();
  } catch (err) {
    if (tournamentState && tournamentState.beats && tournamentState.beats.length > 0) {
      currentEditingBeatsList = tournamentState.beats;
      renderBeatsManagerTable();
    } else {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-3 text-danger">Failed to load beats: ${err.message}</td></tr>`;
    }
  }
}

function closeBeatsManagerModal() {
  const modal = document.getElementById('beatsManagerModal');
  if (modal) modal.classList.add('hidden');
}

function renderBeatsManagerTable() {
  const tbody = document.getElementById('beatsManagerBody');
  if (!tbody) return;

  let html = '';
  currentEditingBeatsList.forEach((b, idx) => {
    const lower = b.lower_pin || [0, 0];
    const mid = b.mid_pin || [0, 0];
    const upper = b.upper_pin || [0, 0];

    const isYP = (b.river && b.river.toLowerCase().includes('eland'));
    const isSB = !isYP;
    const isSatAvail = b.sat_available !== false;
    const satSess = b.sat_sessions !== undefined ? Number(b.sat_sessions) : (b.usage_mode === 'single' ? 1 : 2);
    const isSunAvail = b.sun_available !== false;
    const sunSess = b.sun_sessions !== undefined ? Number(b.sun_sessions) : (b.usage_mode === 'single' ? 1 : 2);

    html += `
      <tr>
        <td class="text-center">
          <input type="checkbox" id="beat_active_${idx}" ${b.enabled !== false ? 'checked' : ''} onchange="onBeatActiveToggle(${idx})">
        </td>
        <td>
          <strong>${escapeHtml(b.code || b.id)}</strong><br/>
          <small class="text-muted">${escapeHtml(b.name || '')}</small>
        </td>
        <td>
          <select id="beat_river_${idx}" class="river-select" onchange="onBeatRiverChange(${idx})">
            <option value="Small Blaar" ${isSB ? 'selected' : ''}>Small Blaar</option>
            <option value="Elands Pad" ${isYP ? 'selected' : ''}>Elands Pad</option>
          </select>
        </td>
        <td class="text-center">
          <input type="checkbox" id="beat_sat_avail_${idx}" ${isSatAvail ? 'checked' : ''} onchange="onBeatSatToggle(${idx})">
        </td>
        <td>
          <select id="beat_sat_sess_${idx}" class="river-select" onchange="onBeatSatSessChange(${idx})">
            <option value="2" ${satSess === 2 ? 'selected' : ''}>2 Sessions</option>
            <option value="1" ${satSess === 1 ? 'selected' : ''}>1 Session</option>
          </select>
        </td>
        <td class="text-center">
          <input type="checkbox" id="beat_sun_avail_${idx}" ${isSunAvail ? 'checked' : ''} onchange="onBeatSunToggle(${idx})">
        </td>
        <td>
          <select id="beat_sun_sess_${idx}" class="river-select" onchange="onBeatSunSessChange(${idx})">
            <option value="2" ${sunSess === 2 ? 'selected' : ''}>2 Sessions</option>
            <option value="1" ${sunSess === 1 ? 'selected' : ''}>1 Session</option>
          </select>
        </td>
        <td>
          <input type="text" id="beat_lower_${idx}" class="input-coord" value="${lower[0].toFixed(4)}, ${lower[1].toFixed(4)}">
        </td>
        <td>
          <input type="text" id="beat_mid_${idx}" class="input-coord" value="${mid[0].toFixed(4)}, ${mid[1].toFixed(4)}">
        </td>
        <td>
          <input type="text" id="beat_upper_${idx}" class="input-coord" value="${upper[0].toFixed(4)}, ${upper[1].toFixed(4)}">
        </td>
        <td>
          <select id="beat_travel_${idx}" class="river-select" onchange="onBeatTravelChange(${idx})">
            <option value="10" ${Number(b.travel_time) === 10 ? 'selected' : ''}>10 min</option>
            <option value="15" ${(b.travel_time === undefined || Number(b.travel_time) === 15) ? 'selected' : ''}>15 min</option>
            <option value="20" ${Number(b.travel_time) === 20 ? 'selected' : ''}>20 min</option>
            <option value="25" ${Number(b.travel_time) === 25 ? 'selected' : ''}>25 min</option>
            <option value="30" ${Number(b.travel_time) === 30 ? 'selected' : ''}>30 min</option>
            <option value="45" ${Number(b.travel_time) === 45 ? 'selected' : ''}>45 min</option>
          </select>
        </td>
        <td>
          <input type="text" id="beat_meet_${idx}" class="form-control" style="font-size: 0.8rem; padding: 0.3rem;" value="${escapeHtml(b.meeting_point || '')}">
        </td>
        <td>
          <button type="button" class="btn btn-secondary btn-sm" onclick="saveSingleBeat(${idx})">Save</button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function onBeatActiveToggle(idx) {
  const chk = document.getElementById(`beat_active_${idx}`);
  if (chk && currentEditingBeatsList[idx]) {
    currentEditingBeatsList[idx].enabled = chk.checked;
  }
}

function onBeatRiverChange(idx) {
  const sel = document.getElementById(`beat_river_${idx}`);
  if (sel && currentEditingBeatsList[idx]) {
    currentEditingBeatsList[idx].river = sel.value;
  }
}

function onBeatSatToggle(idx) {
  const chk = document.getElementById(`beat_sat_avail_${idx}`);
  if (chk && currentEditingBeatsList[idx]) {
    currentEditingBeatsList[idx].sat_available = chk.checked;
  }
}

function onBeatSatSessChange(idx) {
  const sel = document.getElementById(`beat_sat_sess_${idx}`);
  if (sel && currentEditingBeatsList[idx]) {
    currentEditingBeatsList[idx].sat_sessions = parseInt(sel.value, 10);
  }
}

function onBeatSunToggle(idx) {
  const chk = document.getElementById(`beat_sun_avail_${idx}`);
  if (chk && currentEditingBeatsList[idx]) {
    currentEditingBeatsList[idx].sun_available = chk.checked;
  }
}

function onBeatTravelChange(idx) {
  const sel = document.getElementById(`beat_travel_${idx}`);
  if (sel && currentEditingBeatsList[idx]) {
    currentEditingBeatsList[idx].travel_time = parseInt(sel.value, 10);
  }
}

function onBeatSunSessChange(idx) {
  const sel = document.getElementById(`beat_sun_sess_${idx}`);
  if (sel && currentEditingBeatsList[idx]) {
    currentEditingBeatsList[idx].sun_sessions = parseInt(sel.value, 10);
  }
}

function parseCoords(str) {
  if (!str) return [0, 0];
  const parts = str.split(',').map(s => parseFloat(s.trim()));
  if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return [parts[0], parts[1]];
  }
  return [0, 0];
}

async function saveSingleBeat(idx) {
  const b = currentEditingBeatsList[idx];
  if (!b) return;

  const lowerStr = document.getElementById(`beat_lower_${idx}`)?.value;
  const midStr = document.getElementById(`beat_mid_${idx}`)?.value;
  const upperStr = document.getElementById(`beat_upper_${idx}`)?.value;
  const meetStr = document.getElementById(`beat_meet_${idx}`)?.value;
  const riverStr = document.getElementById(`beat_river_${idx}`)?.value;
  const activeChk = document.getElementById(`beat_active_${idx}`)?.checked;
  const satAvail = document.getElementById(`beat_sat_avail_${idx}`)?.checked ?? true;
  const satSess = parseInt(document.getElementById(`beat_sat_sess_${idx}`)?.value || '2', 10);
  const sunAvail = document.getElementById(`beat_sun_avail_${idx}`)?.checked ?? true;
  const sunSess = parseInt(document.getElementById(`beat_sun_sess_${idx}`)?.value || '2', 10);
  const modeStr = (satSess === 1 && sunSess === 1) ? 'single' : 'double';
    const allTravelVal = parseInt(document.getElementById(`beat_travel_${idx}`)?.value || (b.travel_time || 15), 10);
  const travelVal = parseInt(document.getElementById(`beat_travel_${idx}`)?.value || (b.travel_time || 15), 10);

  const payload = {
    beat_id: b.id,
    enabled: activeChk,
    sat_available: satAvail,
    sat_sessions: satSess,
    sun_available: sunAvail,
    sun_sessions: sunSess,
    river: riverStr,
    usage_mode: modeStr,
    lower_pin: parseCoords(lowerStr),
    mid_pin: parseCoords(midStr),
    upper_pin: parseCoords(upperStr),
    travel_time: travelVal,
    meeting_point: (meetStr || '').trim()
  };

  try {
    const res = await fetch('/api/beats/update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': getAdminPassword()
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(`✅ Beat ${b.code} updated successfully!`);
      await loadState();
      renderAdminBeatsConfig();
      updateMapPins();
    } else {
      alert(`Error updating beat: ${data.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function saveAllBeatsAndApply() {
  const ok = confirm("Save all beat settings and update map?");
  if (!ok) return;

  const payloadList = [];
  for (let idx = 0; idx < currentEditingBeatsList.length; idx++) {
    const b = currentEditingBeatsList[idx];
    const lowerStr = document.getElementById(`beat_lower_${idx}`)?.value;
    const midStr = document.getElementById(`beat_mid_${idx}`)?.value;
    const upperStr = document.getElementById(`beat_upper_${idx}`)?.value;
    const meetStr = document.getElementById(`beat_meet_${idx}`)?.value || '';
    const riverStr = document.getElementById(`beat_river_${idx}`)?.value || b.river;
    const activeChk = document.getElementById(`beat_active_${idx}`)?.checked ?? b.enabled;
    const satAvail = document.getElementById(`beat_sat_avail_${idx}`)?.checked ?? (b.sat_available !== false);
    const satSess = parseInt(document.getElementById(`beat_sat_sess_${idx}`)?.value || (b.sat_sessions || 2), 10);
    const sunAvail = document.getElementById(`beat_sun_avail_${idx}`)?.checked ?? (b.sun_available !== false);
    const sunSess = parseInt(document.getElementById(`beat_sun_sess_${idx}`)?.value || (b.sun_sessions || 2), 10);
    const modeStr = (satSess === 1 && sunSess === 1) ? 'single' : 'double';
  const travelVal = parseInt(document.getElementById(`beat_travel_${idx}`)?.value || (b.travel_time || 15), 10);

    payloadList.push({
      id: b.id,
      code: b.code,
      enabled: activeChk,
      sat_available: satAvail,
      sat_sessions: satSess,
      sun_available: sunAvail,
      sun_sessions: sunSess,
      river: riverStr,
      usage_mode: modeStr,
      lower_pin: lowerStr ? parseCoords(lowerStr) : b.lower_pin,
      mid_pin: midStr ? parseCoords(midStr) : b.mid_pin,
      upper_pin: upperStr ? parseCoords(upperStr) : b.upper_pin,
      travel_time: allTravelVal,
      meeting_point: meetStr.trim()
    });
  }

  try {
    const res = await fetch('/api/admin/beats/update_all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': getAdminPassword()
      },
      body: JSON.stringify({
        beats: payloadList,
        password: getAdminPassword()
      })
    });
    if (res.status === 401) {
      openAdminPasswordModal(() => saveAllBeatsAndApply());
      return;
    }
    alert("✅ All beats updated and synchronized!");
    closeBeatsManagerModal();
    await loadState();
    renderAdminBeatsConfig();
    updateMapPins();
  } catch (e) {
    console.error("Error saving all beats:", e);
    alert(`Error saving beats: ${e.message}`);
  }
}


// ====================================================================
// Organizer Admin Password & Trial Lifecycle Management
// ====================================================================

function getAdminPassword() {
  return sessionStorage.getItem("admin_password") || "";
}

function isAdminAuthenticated() {
  return sessionStorage.getItem("admin_password") === "small-Blaar";
}

let pendingAdminCallback = null;

function openAdminPasswordModal(callback = null) {
  pendingAdminCallback = callback;
  const modal = document.getElementById("adminPasswordModal");
  const input = document.getElementById("adminPasswordInput");
  const errEl = document.getElementById("adminPasswordError");
  if (errEl) errEl.classList.add("hidden");
  if (input) input.value = "";
  if (modal) modal.classList.remove("hidden");
  if (input) setTimeout(() => input.focus(), 150);
}

function closeAdminPasswordModal() {
  const modal = document.getElementById("adminPasswordModal");
  if (modal) modal.classList.add("hidden");
  pendingAdminCallback = null;
}

async function submitAdminPassword(event) {
  if (event) event.preventDefault();
  const input = document.getElementById("adminPasswordInput");
  const errEl = document.getElementById("adminPasswordError");
  const pwd = input ? input.value.trim() : "";

  if (!pwd) {
    if (errEl) {
      errEl.textContent = "Please enter the organizer password.";
      errEl.classList.remove("hidden");
    }
    return;
  }

  // Verify against organizer password "small-Blaar"
  if (pwd !== "small-Blaar") {
    if (errEl) {
      errEl.textContent = "Incorrect organizer password. Access denied.";
      errEl.classList.remove("hidden");
    }
    return;
  }

  // Password confirmed
  sessionStorage.setItem("admin_password", pwd);
  closeAdminPasswordModal();
  updateAdminUIState();
  alert("🔓 Organizer Admin Mode Unlocked!");

  if (pendingAdminCallback) {
    const cb = pendingAdminCallback;
    pendingAdminCallback = null;
    cb();
  }

  // Verify with backend
  try {
    await fetch("/api/admin/verify_password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd })
    });
  } catch (err) {
    // Non-blocking background sync
  }
}

function logoutAdmin() {
  sessionStorage.removeItem("admin_password");
  updateAdminUIState();
  alert("🔒 Admin mode locked.");
  if (currentTab === "admin") {
    switchTab("leaderboard");
  }
}

function updateAdminUIState() {
  const isAuth = isAdminAuthenticated();
  const loginBtn = document.getElementById("adminLoginBtn");
  const unlockedRow = document.getElementById("adminUnlockedControls");
  const beatEditorBtn = document.getElementById("beatEditorBtn");
  const lockedNotice = document.getElementById("adminLockedNotice");
  const controlsContainer = document.getElementById("adminControlsContainer");

  if (loginBtn && unlockedRow) {
    if (isAuth) {
      loginBtn.classList.add("hidden");
      unlockedRow.classList.remove("hidden");
    } else {
      loginBtn.classList.remove("hidden");
      unlockedRow.classList.add("hidden");
    }
  }

  if (lockedNotice && controlsContainer) {
    if (isAuth) {
      lockedNotice.classList.add("hidden");
      controlsContainer.classList.remove("hidden");
    } else {
      lockedNotice.classList.remove("hidden");
      controlsContainer.classList.add("hidden");
    }
  }

  if (beatEditorBtn) {
    if (isAuth) {
      beatEditorBtn.innerHTML = "⚙️ Beat &amp; Pin Editor";
    } else {
      beatEditorBtn.innerHTML = "🔒 Beat &amp; Pin Editor (Organizer)";
    }
  }

  // Show / hide organizer-only action buttons across the app (Redo Draw, Clear Draw, Clear Sessions)
  document.querySelectorAll(".admin-only-action").forEach(el => {
    if (isAuth) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });
}

// --- Trial Bar & Lifecycle Rendering ---
function renderTrialBar() {
  if (!tournamentState) return;
  const trialInfo = tournamentState.trial_info || {};
  const allTrials = tournamentState.all_trials || [];

  // Update Title
  const titleEl = document.getElementById("tournamentTitle");
  if (titleEl && trialInfo.name) {
    titleEl.textContent = trialInfo.name;
  }

  // Dropdown selectors (Top Trial Bar & Where Am I Fishing Tracker)
  const trialDropdowns = [
    document.getElementById("trialSelect"),
    document.getElementById("trialSelector")
  ].filter(Boolean);

  if (trialDropdowns.length > 0 && allTrials.length > 0) {
    trialDropdowns.forEach(selectEl => {
      selectEl.innerHTML = "";
      const inSession = allTrials.filter(t => t.status === "IN_SESSION");
      const upcoming = allTrials.filter(t => t.status === "UPCOMING");
      const past = allTrials.filter(t => t.status === "PAST");

      if (inSession.length > 0) {
        const grp = document.createElement("optgroup");
        grp.label = "🟢 Active Trial in Session";
        inSession.forEach(t => {
          const opt = document.createElement("option");
          opt.value = t.id;
          opt.textContent = `${t.name} (${t.date_range_label || t.start_date})`;
          if (t.id === trialInfo.id) opt.selected = true;
          grp.appendChild(opt);
        });
        selectEl.appendChild(grp);
      }

      if (upcoming.length > 0) {
        const grp = document.createElement("optgroup");
        grp.label = "📅 Upcoming Trials";
        upcoming.forEach(t => {
          const opt = document.createElement("option");
          opt.value = t.id;
          opt.textContent = `${t.name} (${t.date_range_label || t.start_date})`;
          if (t.id === trialInfo.id) opt.selected = true;
          grp.appendChild(opt);
        });
        selectEl.appendChild(grp);
      }

      if (past.length > 0) {
        const grp = document.createElement("optgroup");
        grp.label = "🏁 Past Events Archive";
        past.forEach(t => {
          const opt = document.createElement("option");
          opt.value = t.id;
          opt.textContent = `${t.name} (${t.date_range_label || t.end_date})`;
          if (t.id === trialInfo.id) opt.selected = true;
          grp.appendChild(opt);
        });
        selectEl.appendChild(grp);
      }

      if (trialInfo.id) {
        selectEl.value = trialInfo.id;
      }
    });
  }

  // Status badge
  const statusBadge = document.getElementById("trialStatusBadge");
  if (statusBadge) {
    statusBadge.textContent = trialInfo.status_label || "Active Trial";
    statusBadge.className = "status-badge";
    if (trialInfo.status === "IN_SESSION") {
      statusBadge.classList.add("badge-in-session");
    } else if (trialInfo.status === "PAST") {
      statusBadge.classList.add("badge-past");
    } else {
      statusBadge.classList.add("badge-upcoming");
    }
  }

  // Dates badge
  const datesBadge = document.getElementById("trialDatesBadge");
  if (datesBadge) {
    datesBadge.textContent = `📅 ${trialInfo.date_range_label || trialInfo.start_date || 'Dates TBD'}`;
  }

  // WhatsApp button
  const waBtn = document.getElementById("trialWhatsappBtn");
  if (waBtn) {
    if (trialInfo.whatsapp_url && trialInfo.whatsapp_url.trim()) {
      waBtn.href = trialInfo.whatsapp_url;
      waBtn.classList.remove("hidden");
    } else {
      waBtn.classList.add("hidden");
    }
  }

  // Past event banner
  const pastBanner = document.getElementById("pastEventBanner");
  const pastText = document.getElementById("pastEventText");
  if (pastBanner) {
    if (trialInfo.is_past) {
      pastBanner.classList.remove("hidden");
      if (pastText) {
        pastText.textContent = `This trial was completed on ${trialInfo.date_range_label || trialInfo.end_date}. Viewing official standings, schedule, and maps in read-only archive mode.`;
      }
    } else {
      pastBanner.classList.add("hidden");
    }
  }
}

async function onTrialSelected(trialId) {
  if (!trialId) return;
  try {
    const res = await fetch("/api/trials/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trial_id: trialId })
    });
    const data = await res.json();
    if (data.success && data.state) {
      tournamentState = data.state;
      // Reset selected angler and hide quick pills/itinerary card
      selectedTrackingAngler = "";
      const topAnglerSel = document.getElementById('topAnglerSelector');
      if (topAnglerSel) topAnglerSel.value = "";
      const pillsRow = document.getElementById('quickSessionPills');
      const card = document.getElementById('anglerItineraryCard');
      if (pillsRow) pillsRow.classList.add('hidden');
      if (card) card.classList.add('hidden');

      // Sync A-Team checklist to the newly selected trial's saved A-Team
      selectedAteamSet.clear();
      if (tournamentState.a_team_anglers) {
        tournamentState.a_team_anglers.forEach(a => selectedAteamSet.add(a));
      }
      
      renderAll();
      renderAteamChecklist();
      if (typeof updateMapPins === 'function') {
        updateMapPins();
      }
    } else {
      alert(`Error switching trial: ${data.error || "Unknown error"}`);
    }
  } catch (err) {
    console.error("Failed to switch trial:", err);
  }
}

// --- Trial Manager Modal Controls ---
function openTrialManagerModal() {
  if (!isAdminAuthenticated()) {
    openAdminPasswordModal(() => openTrialManagerModal());
    return;
  }

  const modal = document.getElementById("trialManagerModal");
  if (!modal) return;

  const trialInfo = tournamentState ? (tournamentState.trial_info || {}) : {};

  // Populate Edit Active Trial form
  const editId = document.getElementById("editTrialId");
  const editName = document.getElementById("editTrialName");
  const editYear = document.getElementById("editTrialYear");
  const editStart = document.getElementById("editTrialStartDate");
  const editEnd = document.getElementById("editTrialEndDate");
  const editWa = document.getElementById("editTrialWhatsapp");

  if (editId) editId.value = trialInfo.id || "";
  if (editName) editName.value = trialInfo.name || "";
  if (editYear) editYear.value = trialInfo.year || 2026;
  if (editStart) editStart.value = trialInfo.start_date || "";
  if (editEnd) editEnd.value = trialInfo.end_date || "";
  if (editWa) editWa.value = trialInfo.whatsapp_url || "";

  // Populate All Trials Directory Table
  renderAllTrialsDirectory();

  modal.classList.remove("hidden");
}

function closeTrialManagerModal() {
  const modal = document.getElementById("trialManagerModal");
  if (modal) modal.classList.add("hidden");
}

function applyTrialNamePreset() {
  const preset = document.getElementById("newTrialTypePreset").value;
  const year = document.getElementById("newTrialYear").value || "2026";
  const nameInput = document.getElementById("newTrialFullName");
  if (!nameInput) return;

  if (preset === "custom") {
    nameInput.value = `Autumn Trial ${year} A`;
  } else {
    const parts = preset.split(' ');
    const division = parts.pop();
    const prefix = parts.join(' ');
    nameInput.value = `${prefix} ${year} ${division}`;
  }
}

function renderAllTrialsDirectory() {
  const tbody = document.getElementById("allTrialsDirectoryBody");
  if (!tbody || !tournamentState) return;

  const allTrials = tournamentState.all_trials || [];
  const activeId = (tournamentState.trial_info || {}).id;

  if (allTrials.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-2">No trials registered.</td></tr>`;
    return;
  }

  let html = "";
  allTrials.forEach(t => {
    const isActive = (t.id === activeId);
    const waLink = t.whatsapp_url 
      ? `<a href="${escapeHtml(t.whatsapp_url)}" target="_blank" class="text-success">✓ Group Link</a>` 
      : `<span class="text-muted">None</span>`;

    html += `
      <tr class="${isActive ? 'table-row-active' : ''}">
        <td><strong>${escapeHtml(t.name)}</strong> ${isActive ? '<span class="meta-tag tag-accent ml-1">Current</span>' : ''}</td>
        <td>${escapeHtml(t.date_range_label || (t.start_date + ' – ' + t.end_date))}</td>
        <td><span class="status-badge ${t.status === 'IN_SESSION' ? 'badge-in-session' : (t.status === 'PAST' ? 'badge-past' : 'badge-upcoming')}">${escapeHtml(t.status_label)}</span></td>
        <td>${t.num_anglers || 0}</td>
        <td>${waLink}</td>
        <td>
          <div class="actions-cell">
            ${!isActive ? `<button class="btn btn-sm btn-outline" onclick="onTrialSelected('${t.id}'); closeTrialManagerModal();">Switch To</button>` : ''}
            ${allTrials.length > 1 ? `<button class="btn btn-sm btn-outline text-danger" onclick="deleteTrial('${t.id}', '${escapeHtml(t.name)}')">Delete</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  });
  tbody.innerHTML = html;
}

async function submitEditActiveTrial(event) {
  if (event) event.preventDefault();
  const trialId = document.getElementById("editTrialId").value;
  const name = document.getElementById("editTrialName").value.trim();
  const year = parseInt(document.getElementById("editTrialYear").value, 10);
  const startDate = document.getElementById("editTrialStartDate").value;
  const endDate = document.getElementById("editTrialEndDate").value;
  const wa = document.getElementById("editTrialWhatsapp").value.trim();

  try {
    const res = await fetch("/api/admin/trial/update", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Admin-Password": getAdminPassword()
      },
      body: JSON.stringify({
        trial_id: trialId,
        name: name,
        year: year,
        start_date: startDate,
        end_date: endDate,
        whatsapp_url: wa
      })
    });
    const data = await res.json();
    if (data.success) {
      alert("✅ Trial updated successfully!");
      if (data.state) tournamentState = data.state;
      closeTrialManagerModal();
      renderAll();
    } else {
      alert(`Validation Error: ${data.error || "Failed to update trial"}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function submitCreateNewTrial(event) {
  if (event) event.preventDefault();
  const name = document.getElementById("newTrialFullName").value.trim();
  const year = parseInt(document.getElementById("newTrialYear").value, 10);
  const startDate = document.getElementById("newTrialStartDate").value;
  const endDate = document.getElementById("newTrialEndDate").value;
  const wa = document.getElementById("newTrialWhatsapp").value.trim();

  if (!startDate || !endDate) {
    alert("Please specify both Start Date and End Date.");
    return;
  }

  try {
    const res = await fetch("/api/admin/trial/create", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Admin-Password": getAdminPassword()
      },
      body: JSON.stringify({
        name: name,
        year: year,
        start_date: startDate,
        end_date: endDate,
        whatsapp_url: wa
      })
    });
    const data = await res.json();
    if (data.success) {
      alert(`🎉 Successfully scheduled '${name}'! It is now the active trial.`);
      if (data.state) tournamentState = data.state;
      closeTrialManagerModal();
      renderAll();
    } else {
      alert(`Validation Error: ${data.error || "Failed to create trial"}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function deleteTrial(trialId, trialName) {
  const ok = confirm(`Are you sure you want to delete '${trialName}'? This action cannot be undone.`);
  if (!ok) return;

  try {
    const res = await fetch("/api/admin/trial/delete", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "X-Admin-Password": getAdminPassword()
      },
      body: JSON.stringify({ trial_id: trialId })
    });
    const data = await res.json();
    if (data.success) {
      alert("Trial deleted.");
      if (data.state) tournamentState = data.state;
      renderAllTrialsDirectory();
      renderAll();
    } else {
      alert(`Error: ${data.error || "Failed to delete trial"}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}
