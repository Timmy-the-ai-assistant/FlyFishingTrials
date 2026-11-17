# 🎣 Fly Fishing Trials - Randomiser & Tournament Manager

A specialized tournament randomiser, live scoring engine, dual-submission verification app, session snapshot manager, and PDF generator built for competitive fly fishing trials.

---

## 🌟 Key Features

### 1. Tournament Randomiser (8 to 20 Anglers)
- **4 Sessions**:
  1. Session 1: Saturday Morning
  2. Session 2: Saturday Afternoon
  3. Session 3: Sunday Morning
  4. Session 4: Sunday Afternoon
- **Even Field Sizes (8, 10, 12, 14, 16, 18, 20 Anglers)**:
  - Beats = $N / 2$ (from 4 beats up to 10 beats).
  - All matches are 1 vs 1.
- **Odd Field Sizes (9, 11, 13, 15, 17, 19 Anglers)**:
  - Beats = $(N - 1) / 2$ beats.
  - Exactly one beat is **1 vs 1 vs 1** (3 anglers), and the remaining beats are **1 vs 1**.
  - **Fairness Guarantee**:
    - For $N \le 11$ ($N=9, 11$): **every single angler participates in at least one 1 vs 1 vs 1 match**.
    - For $N > 11$ ($N=13, 15, 17, 19$): across 4 sessions there are 12 total 3-way slots, which are distributed across 12 distinct anglers with zero repeat 3-way matches.
- **Unique Opponents Constraint**: Each angler faces a **new competitor each session** (no repeat pairings).

---

### 2. Session Saving & Snapshots Manager
- **Session-by-Session Saving**: In the **Schedule & Beats** tab, each session features a **💾 Save Session** button that captures a snapshot and displays a `Saved ✓` badge.
- **Tournament Snapshots**: In the **Admin Panel**, create named snapshots (e.g. `After_Round_2` or `Day1_Final`).
- **One-Click Restore**: View all saved snapshots with date, angler count, matches completed, and restore or delete them at any time.
- **Export & Import JSON**: Download the full tournament file as a `.json` backup or upload a previous file to resume.

---

### 3. Official 10-Point Proportional Scoring Engine
For every beat match:
$$\text{Points} = \frac{10}{\text{Total Fish Caught on Beat}} \times \text{Angler's Fish Caught}$$

- **Blank Rule**: Any angler who catches **0 fish** receives **0.00 points**.
- **All Blank Rule**: If all anglers on a beat catch 0 fish, everyone receives **0.00 points**.
- **Standings**: Cumulative total points across all 4 sessions.
- **Tie-breakers**:
  1. Total Points (descending)
  2. Total Fish Caught (descending)
  3. Fewest Blanks (ascending)

---

### 4. "Google Forms" Dual-Submission & Verification
- Anglers submit their catch via the mobile-friendly web form.
- **Automatic Auto-Match**: When both competitors submit identical fish counts, the score is **automatically confirmed** and the live leaderboard updates immediately.
- **Discrepancy Alert System**: If competitor reports differ, the match is flagged as **DISCREPANCY** with an instant alert banner. The tournament organizer can review both submissions side-by-side in the Admin Panel and enter the official verified catch.

---

### 5. Live PDF Schedule & Standings Generator
- Dynamic download button (`/api/pdf`) producing an official landscape tournament sheet formatted with:
  - Header & rules overview
  - Master Session & Beat Schedule Matrix (adaptive sizing up to 10 beats)
  - Live Standings & points breakdown by session (auto-paginated for 12–20 anglers)

---

### 6. Riverbank & Mobile Wi-Fi Access
- Automatically detects your local network IP: **`http://192.168.0.6:8585`**.
- Built-in **client-side QR code**: competitors can scan the QR code on the organizer's screen to open the app on their smartphones.
- Includes `share_online.bat` using `localtunnel` (`npx localtunnel --port 8585`) to publish a public HTTPS URL accessible from anywhere.

---

## 🚀 Quick Start Guide

### Option A: 1-Click Launch (Windows)
Double-click `start_app.bat` inside `C:\Repos\FlyFishingTrials`.

### Option B: Terminal
```powershell
cd C:\Repos\FlyFishingTrials
python app.py 8585
```
Then open: **`http://localhost:8585`**
