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
    renderAll();
  } catch (err) {
    console.error("Failed to load tournament state:", err);
  }
}

// --- Main Render Dispatcher ---
function renderAll() {
  if (!tournamentState) return;

  renderTrialBar();
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
      aTeamTag.textContent = `⭐ ${aTeamAnglers.length} A-Team`;
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
    const isA = row.is_a_team || aTeamList.includes(row.name);
    const aTeamBadge = isA 
      ? `<span class="ateam-badge-mini" title="A-Team Seeded Angler">⭐ A-Team</span>` 
      : '';

    html += `
      <tr>
        <td><span class="rank-badge ${rankBadgeClass}">${rank}</span></td>
        <td>
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <strong>${escapeHtml(row.name)}</strong>
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
            <button class="btn btn-sm btn-secondary" onclick="quickSaveSession(${session.session_id})" title="Save snapshot of Session ${session.session_id}">
              💾 Save Session ${session.session_id}
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

      const is3Way = match.match_type === '1v1v1' || match.anglers.length === 3;
      const typeBadge = is3Way ? `<span class="three-way-badge">3-Way Match (1v1v1)</span>` : '';

      let aTeamClashBadge = '';
      if (match.is_head_to_head_a_team) {
        aTeamClashBadge = `<span class="clash-badge">⚔️ A-Team Clash</span>`;
      } else if (match.has_a_team_angler) {
        aTeamClashBadge = `<span class="clash-badge" style="color:#93c5fd; background:rgba(56,189,248,0.15); border-color:rgba(56,189,248,0.3);">⭐ A-Team vs Challenger</span>`;
      }

      html += `
        <div class="match-card">
          <div>
            <div class="match-card-top">
              <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap;">
                <span class="beat-tag">Beat ${match.beat || match.beat_number}</span>
                ${aTeamClashBadge}
              </div>
              <span class="match-status-badge ${statusClass}">${statusLabel}</span>
            </div>

            <div class="competitors-list">
      `;

      match.anglers.forEach(angler => {
        const fish = match.official_scores ? match.official_scores[angler] : null;
        const pts = match.calculated_points ? match.calculated_points[angler] : (match.points_awarded ? match.points_awarded[angler] : null);

        let resultStr = '';
        if ((match.status === 'CONFIRMED' || match.status === 'ADMIN_CONFIRMED') && fish !== null && pts !== null) {
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
        const aTag = isAnglerA ? `<span class="ateam-badge-mini">A-Team</span>` : '';

        html += `
          <div class="competitor-row">
            <div style="display:flex; align-items:center; gap:0.4rem;">
              <span class="competitor-name">${escapeHtml(angler)}</span>
              ${aTag}
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
            <button class="btn btn-sm btn-outline" onclick="prefillSubmitForm(${session.session_id}, '${escapeHtml(match.match_id)}')">
              Submit Score
            </button>
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        match_id: matchId,
        official_scores: officialScores,
        admin_note: adminNote
      })
    });

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
    container.innerHTML = `<div class="text-muted text-sm py-2">Enter angler names above to configure A-Team members.</div>`;
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
        ${isA ? '<span class="ateam-badge-mini">⭐ A-Team</span>' : ''}
      </label>
    `;
  });
  container.innerHTML = html;

  // Validation Summary
  const k = selectedAteamSet.size;
  const N = anglers.length;
  if (summaryEl) {
    if (k === 0) {
      summaryEl.innerHTML = `<span class="text-muted">ℹ️ No A-Team selected. All competitors will participate in standard random draw.</span>`;
    } else if (k < 3) {
      summaryEl.innerHTML = `<span style="color: var(--danger)">⚠️ A-Team currently has ${k} member(s). Minimum 3 required so each A-Team member can face 2 different A-Team opponents without repeat pairings.</span>`;
    } else {
      const challengerCount = N - k;
      const challengerCoverage = (2 * k >= challengerCount) 
        ? `<span style="color:var(--primary);">✓ Every challenger is guaranteed to face at least one A-Team member.</span>`
        : `<span style="color:var(--accent-gold);">Note: With ${k} A-Team members, ${2*k} challenger matches are available for ${challengerCount} challengers.</span>`;

      summaryEl.innerHTML = `
        <span style="color: var(--primary)">✓ <strong>${k} A-Team Anglers Selected:</strong></span> 
        Each will play <strong>2 matches</strong> against fellow A-Team members and <strong>2 normal matches</strong>. ${challengerCoverage}
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
    alert(`A-Team requires at least 3 members (currently selected ${aTeamList.length}). Please select at least 3 or clear A-Team selection.`);
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        anglers: anglers,
        a_team_anglers: aTeamList,
        tournament_name: tName,
        venue: venue
      })
    });

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

// --- Navigation & UI Utilities ---
function switchTab(tabId) {
  if (tabId === 'admin' && !isAdminAuthenticated()) {
    openAdminPasswordModal(() => switchTab('admin'));
    return;
  }

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
    loadSavedSessionsList();
    if (tournamentState && tournamentState.anglers) {
      const listEl = document.getElementById('adminAnglerList');
      if (!listEl.value.trim()) {
        listEl.value = tournamentState.anglers.join('\n');
      }
      if (selectedAteamSet.size === 0 && tournamentState.a_team_anglers) {
        tournamentState.a_team_anglers.forEach(a => selectedAteamSet.add(a));
      }
      updateAnglerCountHint();
      renderAteamChecklist();
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

// River centerline coordinates for artistic view
const RIVER_PATHS_CLIENT = {
  "Small Brook (Smalblaar)": [
    [-33.7340, 19.1225],
    [-33.7319, 19.1141],
    [-33.7320, 19.1310],
    [-33.7290, 19.1405],
    [-33.7260, 19.1495],
    [-33.7230, 19.1585],
    [-33.7200, 19.1670],
    [-33.7160, 19.1750],
    [-33.7120, 19.1825],
    [-33.7085, 19.1895],
    [-33.7050, 19.1960]
  ],
  "Yellands Part (Elandspad)": [
    [-33.7319, 19.1141],
    [-33.7352, 19.1129],
    [-33.7385, 19.1118],
    [-33.7420, 19.1105],
    [-33.7455, 19.1092],
    [-33.7492, 19.1078],
    [-33.7530, 19.1065]
  ]
};

const TRAIL_PATHS_CLIENT = {
  "Elandspad River Path": [
    [-33.7320, 19.1310],
    [-33.7325, 19.1220],
    [-33.7319, 19.1141],
    [-33.7350, 19.1132],
    [-33.7385, 19.1120],
    [-33.7450, 19.1095],
    [-33.7525, 19.1068]
  ],
  "Smalblaar Angler Trail": [
    [-33.7320, 19.1310],
    [-33.7292, 19.1400],
    [-33.7262, 19.1490],
    [-33.7232, 19.1580],
    [-33.7202, 19.1665],
    [-33.7162, 19.1745],
    [-33.7122, 19.1820],
    [-33.7086, 19.1890]
  ]
};

// Render Top Angler Dropdown
function renderTopAnglerDropdown() {
  const sel = document.getElementById('topAnglerSelector');
  if (!sel || !tournamentState || !tournamentState.anglers) return;

  const currentVal = sel.value;
  let html = '<option value="">Select your name to track 4 sessions with color-coded pins...</option>';

  const aTeamSet = new Set(tournamentState.a_team_anglers || []);
  tournamentState.anglers.forEach(a => {
    const isA = aTeamSet.has(a);
    html += `<option value="${escapeHtml(a)}" ${a === currentVal ? 'selected' : ''}>${escapeHtml(a)} ${isA ? '[A-Team]' : ''}</option>`;
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
  title.textContent = `${anglerName} ${isA ? '⭐ [A-Team Competitor]' : ''}`;

  let html = '';
  sched.forEach(s => {
    const isSat = s.session_id <= 2;
    const isStay = s.is_stayer;
    const riverClass = s.river === 'Yellands Part' ? 'popup-river-yp' : 'popup-river-sb';
    const cardClass = `card-s${s.session_id}`;
    const pin = s.pin || s.lower_pin || [-33.7319, 19.1141];

    html += `
      <div class="itinerary-card ${cardClass}">
        <div class="d-flex justify-content-between align-items-center">
          <span class="sess-pill pill-s${s.session_id}">${s.session_name}</span>
          <span class="itinerary-status-tag ${isStay ? 'tag-stay' : 'tag-move'}">${isStay ? '📍 Stay on Beat' : '🚶 Move Beat'}</span>
        </div>
        <div class="itinerary-beat-title">${escapeHtml(s.beat_name || s.beat_code)}</div>
        <div class="popup-river-tag ${riverClass}">${escapeHtml(s.river || 'Du Toitskloof')} &bull; ${escapeHtml(s.section || 'First Half')}</div>
        <div class="popup-detail"><strong>Opponent(s):</strong> ${escapeHtml(s.opponents.join(' & ') || 'TBD')}</div>
        <div class="popup-detail"><strong>Meeting Point:</strong> ${escapeHtml(s.meeting_point || 'Bridge Layby')}</div>
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

function initOrUpdateMap() {
  const mapContainer = document.getElementById('streamMap');
  if (!mapContainer || typeof L === 'undefined') return;

  if (!streamMap) {
    // Initial center on Du Toitskloof valley / Junction pool
    streamMap = L.map('streamMap', {
      center: [-33.727, 19.145],
      zoom: 13,
      zoomControl: true,
      attributionControl: true
    });

    // 1. Satellite (Esri World Imagery)
    baseTileLayers['satellite'] = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Esri, Maxar, Earthstar'
    });

    // 2. Topographic (OpenTopoMap)
    baseTileLayers['topo'] = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      attribution: 'OpenTopoMap &bull; Contours'
    });

    // 3. Street Map (OpenStreetMap)
    baseTileLayers['street'] = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: 'OpenStreetMap'
    });

    // 4. Artistic River & Trail Map (Minimalist CartoDB Voyager Nolabels as base + bold custom stream vector art)
    baseTileLayers['artistic'] = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: 'CartoDB &bull; CPS Artistic Stream &amp; Trail Map'
    });

    // Default layer: Artistic
    baseTileLayers['artistic'].addTo(streamMap);

    // Layer groups for vectors and pins
    beatMarkersLayerGroup = L.layerGroup().addTo(streamMap);
    anglerPinsLayerGroup = L.layerGroup().addTo(streamMap);

    // Render river centerlines and trails
    drawRiverAndTrailVectors();
  }

  updateMapPins();
}

function switchMapLayer(layerName) {
  if (!streamMap || !baseTileLayers[layerName]) return;

  // Remove current base tile layers
  Object.values(baseTileLayers).forEach(l => {
    if (streamMap.hasLayer(l)) streamMap.removeLayer(l);
  });

  // Add selected layer
  baseTileLayers[layerName].addTo(streamMap);
  currentMapLayerName = layerName;

  // Update UI buttons
  ['artistic', 'satellite', 'topo', 'street'].forEach(k => {
    const btn = document.getElementById(`layerBtn${k.charAt(0).toUpperCase() + k.slice(1)}`);
    if (btn) btn.classList.toggle('active', k === layerName);
  });
}

function resetMapView() {
  if (streamMap) {
    streamMap.setView([-33.727, 19.145], 13);
  }
}

// Draws the flowing river polylines and trails
function drawRiverAndTrailVectors() {
  if (!streamMap) return;

  // Smalblaar (Small Brook)
  const sbPath = RIVER_PATHS_CLIENT["Small Brook (Smalblaar)"];
  L.polyline(sbPath, {
    color: '#0284c7',
    weight: 6,
    opacity: 0.85,
    lineJoin: 'round'
  }).addTo(streamMap).bindTooltip("🌊 Small Brook (Smalblaar River)", { sticky: true });

  // Elandspad (Yellands Part)
  const ypPath = RIVER_PATHS_CLIENT["Yellands Part (Elandspad)"];
  L.polyline(ypPath, {
    color: '#059669',
    weight: 6,
    opacity: 0.85,
    lineJoin: 'round'
  }).addTo(streamMap).bindTooltip("🌿 Yellands Part (Elandspad River)", { sticky: true });

  // Trails
  Object.entries(TRAIL_PATHS_CLIENT).forEach(([name, coords]) => {
    L.polyline(coords, {
      color: '#d97706',
      weight: 3,
      dashArray: '6, 6',
      opacity: 0.8
    }).addTo(streamMap).bindTooltip(`🥾 ${name}`, { sticky: true });
  });
}

// Updates all beat boundaries and the selected angler's 4 pins
function updateMapPins() {
  if (!streamMap || !beatMarkersLayerGroup || !anglerPinsLayerGroup) return;

  beatMarkersLayerGroup.clearLayers();
  anglerPinsLayerGroup.clearLayers();

  const beats = (tournamentState && tournamentState.beats) || [];
  const activeSelectedBeats = (tournamentState && tournamentState.selected_beats) || [];

  // 1. Draw Beat Boundaries (Start/Mid/End)
  beats.forEach(b => {
    if (!b.enabled && activeSelectedBeats.every(sb => sb.id !== b.id)) return;

    const lower = b.lower_pin;
    const mid = b.mid_pin;
    const upper = b.upper_pin;

    if (lower) {
      const markerLower = L.circleMarker(lower, {
        radius: 6,
        fillColor: '#10b981',
        color: '#fff',
        weight: 1.5,
        fillOpacity: 0.9
      });
      markerLower.bindPopup(buildBeatPopup(b, 'Start (Lower Pin)', lower));
      beatMarkersLayerGroup.addLayer(markerLower);
    }

    if (upper) {
      const markerUpper = L.circleMarker(upper, {
        radius: 6,
        fillColor: '#ef4444',
        color: '#fff',
        weight: 1.5,
        fillOpacity: 0.9
      });
      markerUpper.bindPopup(buildBeatPopup(b, 'End (Upper Pin)', upper));
      beatMarkersLayerGroup.addLayer(markerUpper);
    }

    if (mid) {
      const markerMid = L.circleMarker(mid, {
        radius: 5,
        fillColor: '#38bdf8',
        color: '#fff',
        weight: 1.5,
        fillOpacity: 0.85
      });
      markerMid.bindPopup(buildBeatPopup(b, 'Midpoint / Meeting / 2nd Half', mid));
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
      pinMarker.bindPopup(buildAnglerSessionPopup(selectedTrackingAngler, s, coord));
      anglerPinsLayerGroup.addLayer(pinMarker);
    });

    if (pinCoords.length > 0) {
      const bounds = L.latLngBounds(pinCoords);
      streamMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    }
  }
}

function buildBeatPopup(beat, typeLabel, coord) {
  const riverClass = beat.river === 'Yellands Part' ? 'popup-river-yp' : 'popup-river-sb';
  return `
    <div class="map-popup-card">
      <span class="popup-session-badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8;">${typeLabel}</span>
      <h4>${escapeHtml(beat.name || beat.code)}</h4>
      <div class="popup-river-tag ${riverClass}">${escapeHtml(beat.river)}</div>
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
  const riverClass = sessionInfo.river === 'Yellands Part' ? 'popup-river-yp' : 'popup-river-sb';

  return `
    <div class="map-popup-card">
      <span class="popup-session-badge" style="background: ${color}25; color: ${color}; border: 1px solid ${color};">
        Session ${sId}: ${sessionInfo.session_short}
      </span>
      <h4>${escapeHtml(anglerName)}</h4>
      <div class="popup-river-tag ${riverClass}">${escapeHtml(sessionInfo.beat_name)} (${escapeHtml(sessionInfo.river)})</div>
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
  const modal = document.getElementById('beatsManagerModal');
  const tbody = document.getElementById('beatsManagerBody');
  if (!modal || !tbody) return;

  modal.classList.remove('hidden');
  tbody.innerHTML = '<tr><td colspan="8" class="text-center py-3">Loading CPS beats catalog...</td></tr>';

  try {
    const res = await fetch('/api/beats');
    const data = await res.json();
    currentEditingBeatsList = data.beats || [];
    renderBeatsManagerTable();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-3 text-danger">Failed to load beats: ${err.message}</td></tr>`;
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

    html += `
      <tr>
        <td class="text-center">
          <input type="checkbox" id="beat_active_${idx}" ${b.enabled ? 'checked' : ''} onchange="onBeatActiveToggle(${idx})">
        </td>
        <td>
          <strong>${escapeHtml(b.code)}</strong><br/>
          <small class="text-muted">${escapeHtml(b.name)}</small>
        </td>
        <td>
          <select id="beat_river_${idx}" class="river-select" onchange="onBeatRiverChange(${idx})">
            <option value="Small Brook" ${b.river === 'Small Brook' ? 'selected' : ''}>Small Brook</option>
            <option value="Yellands Part" ${b.river === 'Yellands Part' ? 'selected' : ''}>Yellands Part</option>
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

  const lowerStr = document.getElementById(`beat_lower_${idx}`).value;
  const midStr = document.getElementById(`beat_mid_${idx}`).value;
  const upperStr = document.getElementById(`beat_upper_${idx}`).value;
  const meetStr = document.getElementById(`beat_meet_${idx}`).value;
  const riverStr = document.getElementById(`beat_river_${idx}`).value;
  const activeChk = document.getElementById(`beat_active_${idx}`).checked;

  const payload = {
    beat_id: b.id,
    enabled: activeChk,
    river: riverStr,
    lower_pin: parseCoords(lowerStr),
    mid_pin: parseCoords(midStr),
    upper_pin: parseCoords(upperStr),
    meeting_point: meetStr.trim()
  };

  try {
    const res = await fetch('/api/beats/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      alert(`✅ Beat ${b.code} updated successfully!`);
      await loadState();
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

  for (let idx = 0; idx < currentEditingBeatsList.length; idx++) {
    const b = currentEditingBeatsList[idx];
    const lowerStr = document.getElementById(`beat_lower_${idx}`).value;
    const midStr = document.getElementById(`beat_mid_${idx}`).value;
    const upperStr = document.getElementById(`beat_upper_${idx}`).value;
    const meetStr = document.getElementById(`beat_meet_${idx}`).value;
    const riverStr = document.getElementById(`beat_river_${idx}`).value;
    const activeChk = document.getElementById(`beat_active_${idx}`).checked;

    const payload = {
      beat_id: b.id,
      enabled: activeChk,
      river: riverStr,
      lower_pin: parseCoords(lowerStr),
      mid_pin: parseCoords(midStr),
      upper_pin: parseCoords(upperStr),
      meeting_point: meetStr.trim()
    };

    try {
      await fetch('/api/beats/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error("Error saving beat:", b.id, e);
    }
  }

  alert("✅ All beats updated and synchronized!");
  closeBeatsManagerModal();
  await loadState();
  updateMapPins();
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

  try {
    const res = await fetch("/api/admin/verify_password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd })
    });
    const data = await res.json();
    if (data.success) {
      sessionStorage.setItem("admin_password", pwd);
      closeAdminPasswordModal();
      updateAdminUIState();
      alert("🔓 Organizer Admin Mode Unlocked!");
      if (pendingAdminCallback) {
        const cb = pendingAdminCallback;
        pendingAdminCallback = null;
        cb();
      }
    } else {
      if (errEl) {
        errEl.textContent = data.error || "Incorrect organizer password.";
        errEl.classList.remove("hidden");
      }
    }
  } catch (err) {
    if (errEl) {
      errEl.textContent = "Error contacting server.";
      errEl.classList.remove("hidden");
    }
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

  if (loginBtn && unlockedRow) {
    if (isAuth) {
      loginBtn.classList.add("hidden");
      unlockedRow.classList.remove("hidden");
    } else {
      loginBtn.classList.remove("hidden");
      unlockedRow.classList.add("hidden");
    }
  }
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

  // Dropdown selector
  const selectEl = document.getElementById("trialSelect");
  if (selectEl && allTrials.length > 0) {
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
      renderAll();
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
