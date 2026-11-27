APP_VERSION = "v2.6.2"
"""
Fly Fishing Trials Database & Verification Engine
=================================================
Handles persistent storage of:
- Trials Management (Active Trial in Session, Past Events Archive, Upcoming)
- Date validation (Single trial per set date, Maximum 10 trials per year)
- Standard Naming (Autumn Trial [Year] A/B, Spring Trial [Year] A/B, Stillwater Trial [Year] A/B)
- Organizer Admin Authentication (Password: "small-Blaar")
- WhatsApp Group Link per trial
- Angler list (8 to 20 competitors with Top 8 Anglers designation)
- Generated 4-session schedule with CPS beats
- Dual-submission verification engine ("Google Forms" style)
"""

import os
import re
import json
import datetime
from typing import Dict, List, Any, Optional
from scheduler import generate_trials_schedule
from scoring import calculate_match_points, compute_leaderboard
from beats_catalog import get_default_beats, CPS_BEATS_DATA

DB_FILE = os.path.join(os.path.dirname(__file__), "trials_data.json")
SAVES_DIR = os.path.join(os.path.dirname(__file__), "saved_sessions")
if not os.path.exists(SAVES_DIR):
    os.makedirs(SAVES_DIR, exist_ok=True)

ADMIN_PASSWORD = "small-Blaar"
MAX_TRIALS_PER_YEAR = 10

ALLOWED_TRIAL_PREFIXES = [
    "Autumn Trial",
    "Spring Trial",
    "Stillwater Trial",
    "Winter Trial",
    "River Trial"
]

DEFAULT_ANGLERS = [
    "James", "Barry", "Daniel", "Garth",
    "Dale", "Dylan", "Ian", "Malcolm",
    "Ryan", "Garrett", "Michelle"
]

def compute_trial_status(start_date_str: str, end_date_str: str) -> Dict[str, Any]:
    """
    Dynamically computes whether a trial is IN_SESSION, PAST, or UPCOMING based on today's date.
    """
    today = datetime.date.today()
    try:
        start_d = datetime.date.fromisoformat(start_date_str)
        end_d = datetime.date.fromisoformat(end_date_str)
    except Exception:
        return {
            "status": "UNKNOWN",
            "status_label": "Unknown Dates",
            "is_past": False,
            "is_in_session": False,
            "is_upcoming": False
        }

    start_formatted = start_d.strftime("%d %b %Y")
    end_formatted = end_d.strftime("%d %b %Y")
    date_range_label = f"{start_formatted} – {end_formatted}"

    if today < start_d:
        days_until = (start_d - today).days
        return {
            "status": "UPCOMING",
            "status_label": f"📅 Upcoming Trial ({days_until}d to go)",
            "date_range_label": date_range_label,
            "is_past": False,
            "is_in_session": False,
            "is_upcoming": True,
            "days_until": days_until
        }
    elif today <= end_d:
        return {
            "status": "IN_SESSION",
            "status_label": "🟢 Active Trial in Session",
            "date_range_label": date_range_label,
            "is_past": False,
            "is_in_session": True,
            "is_upcoming": False
        }
    else:
        days_ago = (today - end_d).days
        return {
            "status": "PAST",
            "status_label": f"🏁 Past Event (Ended {end_formatted})",
            "date_range_label": date_range_label,
            "is_past": True,
            "is_in_session": False,
            "is_upcoming": False,
            "days_ago": days_ago
        }

def validate_trial_name(name: str, year: int) -> bool:
    """
    Ensures name matches official convention:
    Autumn Trial [Year] A/B, Spring Trial [Year] A/B, Stillwater Trial [Year] A/B.
    """
    name_clean = name.strip()
    prefix_matched = False
    for p in ALLOWED_TRIAL_PREFIXES:
        if name_clean.startswith(p):
            prefix_matched = True
            break
    if not prefix_matched:
        return False
    # Check that it ends with A, B, or similar qualifier, or contains the year
    return str(year) in name_clean or bool(re.search(r'\b[A-Z]\b', name_clean))

class TournamentDB:
    def __init__(self, filepath: str = DB_FILE):
        self.filepath = filepath
        self.data: Dict[str, Any] = {}
        self.load()

    def verify_admin_password(self, password: str) -> bool:
        """Verifies organizer admin password."""
        return password == ADMIN_PASSWORD

    def generate_fresh_tournament_data(self, tournament_name: str, anglers: Optional[List[str]] = None, a_team_anglers: Optional[List[str]] = None) -> Dict[str, Any]:
        """Builds a fresh tournament data block for a trial."""
        use_anglers = anglers if anglers else DEFAULT_ANGLERS
        clean_anglers = [a.strip() for a in use_anglers if a.strip()]
        if len(clean_anglers) < 4:
            clean_anglers = DEFAULT_ANGLERS

        use_a_team = a_team_anglers if a_team_anglers is not None else clean_anglers[:3]
        clean_a_team = [a for a in use_a_team if a in clean_anglers]

        beats = get_default_beats()
        schedule_res = generate_trials_schedule(clean_anglers, a_team_anglers=clean_a_team, available_beats=beats, seed=42)

        sessions = schedule_res["sessions"]
        for s in sessions:
            for m in s["matches"]:
                m["status"] = "UNREPORTED"
                m["submissions"] = {}
                m["official_scores"] = {}
                m["calculated_points"] = {}
                m["discrepancy_details"] = None

        return {
            "tournament_name": tournament_name,
            "venue": "Cape Piscatorial Society - Smalblaar & Elandspad",
            "created_at": datetime.datetime.now().isoformat(),
            "updated_at": datetime.datetime.now().isoformat(),
            "anglers": clean_anglers,
            "num_anglers": len(clean_anglers),
            "a_team_anglers": clean_a_team,
            "num_a_team": len(clean_a_team),
            "num_beats": schedule_res["num_beats"],
            "beats": beats,
            "selected_beats": schedule_res.get("selected_beats", []),
            "angler_schedule": schedule_res.get("angler_schedule", {}),
            "three_way_counts": schedule_res.get("three_way_counts", {}),
            "sessions": sessions,
            "activity_log": [
                {
                    "timestamp": datetime.datetime.now().isoformat(),
                    "type": "SYSTEM",
                    "message": f"{tournament_name} initialized with {len(clean_anglers)} anglers and {len(clean_a_team)} Top 8 members across 4 sessions."
                }
            ]
        }

    def get_default_trials(self) -> List[Dict[str, Any]]:
        """Seeds initial trials with an Active In-Session trial, a Past trial, and an Upcoming trial."""
        today = datetime.date.today()
        # Active Trial in Session (starts 3 days ago, ends 1 day from now)
        active_start = (today - datetime.timedelta(days=3)).isoformat()
        active_end = (today + datetime.timedelta(days=1)).isoformat()
        active_year = today.year

        trial_1 = {
            "id": f"autumn_trial_{active_year}_a",
            "name": f"Autumn Trial {active_year} A",
            "year": active_year,
            "start_date": active_start,
            "end_date": active_end,
            "whatsapp_url": "https://chat.whatsapp.com/FlyFishingTrialsWesternCape",
            "created_at": datetime.datetime.now().isoformat(),
            "updated_at": datetime.datetime.now().isoformat(),
            "tournament_data": self.generate_fresh_tournament_data(f"Autumn Trial {active_year} A")
        }

        # Past event (ended 60 days ago)
        past_start = (today - datetime.timedelta(days=62)).isoformat()
        past_end = (today - datetime.timedelta(days=60)).isoformat()
        past_year = (today - datetime.timedelta(days=60)).year
        trial_2 = {
            "id": f"spring_trial_{past_year}_a",
            "name": f"Spring Trial {past_year} A",
            "year": past_year,
            "start_date": past_start,
            "end_date": past_end,
            "whatsapp_url": "",
            "created_at": (datetime.datetime.now() - datetime.timedelta(days=65)).isoformat(),
            "updated_at": (datetime.datetime.now() - datetime.timedelta(days=60)).isoformat(),
            "tournament_data": self.generate_fresh_tournament_data(f"Spring Trial {past_year} A")
        }

        # Upcoming event (starts in 20 days)
        upcoming_start = (today + datetime.timedelta(days=20)).isoformat()
        upcoming_end = (today + datetime.timedelta(days=22)).isoformat()
        upcoming_year = (today + datetime.timedelta(days=20)).year
        trial_3 = {
            "id": f"stillwater_trial_{upcoming_year}_a",
            "name": f"Stillwater Trial {upcoming_year} A",
            "year": upcoming_year,
            "start_date": upcoming_start,
            "end_date": upcoming_end,
            "whatsapp_url": "https://chat.whatsapp.com/StillwaterTrialsWesternCape",
            "created_at": datetime.datetime.now().isoformat(),
            "updated_at": datetime.datetime.now().isoformat(),
            "tournament_data": self.generate_fresh_tournament_data(f"Stillwater Trial {upcoming_year} A")
        }

        return [trial_1, trial_2, trial_3]

    def load(self):
        """Loads database from disk, performing automatic schema upgrade to multi-trial architecture."""
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    raw = json.load(f)
                    if isinstance(raw, dict) and "trials" in raw and raw["trials"]:
                        self.data = raw
                        self._ensure_active_trial_selected()
                        return
                    elif isinstance(raw, dict) and "sessions" in raw:
                        # Legacy single-tournament schema upgrade
                        t_name = raw.get("tournament_name", "Autumn Trial 2026 A")
                        today = datetime.date.today()
                        migrated_trial = {
                            "id": "autumn_trial_2026_a",
                            "name": t_name if "Trial" in t_name else "Autumn Trial 2026 A",
                            "year": today.year,
                            "start_date": (today - datetime.timedelta(days=3)).isoformat(),
                            "end_date": (today + datetime.timedelta(days=1)).isoformat(),
                            "whatsapp_url": "https://chat.whatsapp.com/FlyFishingTrialsWesternCape",
                            "created_at": raw.get("created_at", datetime.datetime.now().isoformat()),
                            "updated_at": datetime.datetime.now().isoformat(),
                            "tournament_data": raw
                        }
                        self.data = {
                            "active_trial_id": migrated_trial["id"],
                            "trials": [migrated_trial]
                        }
                        self.save()
                        return
            except Exception as e:
                print(f"Error loading database file: {e}. Rebuilding default multi-trial database.")

        # Default initialization
        default_trials = self.get_default_trials()
        self.data = {
            "active_trial_id": default_trials[0]["id"],
            "trials": default_trials
        }
        self.save()

    def _ensure_active_trial_selected(self):
        """Selects the in-session trial by default, or active_trial_id, or first available."""
        trials = self.data.get("trials", [])
        if not trials:
            self.data["trials"] = self.get_default_trials()
            self.data["active_trial_id"] = self.data["trials"][0]["id"]
            self._sync_active_trial_to_root()
            return

        current_active = self.get_active_trial_record()
        if not current_active:
            # Try to find a trial currently IN_SESSION
            found = False
            for t in trials:
                st = compute_trial_status(t.get("start_date", ""), t.get("end_date", ""))
                if st.get("status") == "IN_SESSION":
                    self.data["active_trial_id"] = t["id"]
                    found = True
                    break
            if not found and trials:
                self.data["active_trial_id"] = trials[0]["id"]

        self._sync_active_trial_to_root()

    def _sync_active_trial_to_root(self):
        """Mirrors active trial's data to root self.data for 100% backward-compatibility."""
        rec = self.get_active_trial_record()
        if rec and "tournament_data" in rec:
            t_data = rec["tournament_data"]
            for k, v in t_data.items():
                self.data[k] = v

    def save(self):
        """Persists database state to disk."""
        self._sync_active_trial_to_root()
        with open(self.filepath, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=2)

    # -------------------------------------------------------------
    # Trials Management & Validation API
    # -------------------------------------------------------------

    def get_trials_summary_list(self) -> List[Dict[str, Any]]:
        """Returns clean list of all trials with status metadata for UI selection."""
        result = []
        active_id = self.data.get("active_trial_id")
        for t in self.data.get("trials", []):
            st = compute_trial_status(t.get("start_date", ""), t.get("end_date", ""))
            t_data = t.get("tournament_data", {})
            result.append({
                "id": t["id"],
                "name": t["name"],
                "year": t.get("year", 2026),
                "start_date": t.get("start_date"),
                "end_date": t.get("end_date"),
                "whatsapp_url": t.get("whatsapp_url", ""),
                "status": st["status"],
                "status_label": st["status_label"],
                "date_range_label": st.get("date_range_label", ""),
                "is_past": st["is_past"],
                "is_in_session": st["is_in_session"],
                "is_upcoming": st["is_upcoming"],
                "is_active": (t["id"] == active_id),
                "num_anglers": t_data.get("num_anglers", len(t_data.get("anglers", []))),
                "num_beats": t_data.get("num_beats", len(t_data.get("beats", [])))
            })
        # Sort trials: In-Session first, then Upcoming, then Past events by end date descending
        def sort_key(item):
            if item["status"] == "IN_SESSION":
                return (0, item["start_date"])
            elif item["status"] == "UPCOMING":
                return (1, item["start_date"])
            else:
                return (2, item["end_date"])
        result.sort(key=sort_key)
        return result

    def get_active_trial_record(self) -> Optional[Dict[str, Any]]:
        active_id = self.data.get("active_trial_id")
        for t in self.data.get("trials", []):
            if t["id"] == active_id:
                return t
        if self.data.get("trials"):
            return self.data["trials"][0]
        return None

    def get_active_tournament_data(self) -> Dict[str, Any]:
        rec = self.get_active_trial_record()
        if rec and "tournament_data" in rec:
            return rec["tournament_data"]
        # Fallback if empty
        default_trials = self.get_default_trials()
        self.data["trials"] = default_trials
        self.data["active_trial_id"] = default_trials[0]["id"]
        self.save()
        return default_trials[0]["tournament_data"]

    def set_active_trial(self, trial_id: str) -> Dict[str, Any]:
        """Switches the active trial view."""
        for t in self.data.get("trials", []):
            if t["id"] == trial_id:
                self.data["active_trial_id"] = trial_id
                self.save()
                return {"success": True, "active_trial_id": trial_id, "trial_name": t["name"]}
        return {"success": False, "error": f"Trial ID '{trial_id}' not found."}

    def validate_trial_rules(self, name: str, year: int, start_date: str, end_date: str, exclude_trial_id: Optional[str] = None):
        """
        Enforces:
        1. Official naming convention
        2. Only one trial per set date (no overlapping dates)
        3. Maximum of 10 trials per year
        """
        # 1. Naming convention
        if not validate_trial_name(name, year):
            prefixes_str = ", ".join(ALLOWED_TRIAL_PREFIXES)
            raise ValueError(f"Invalid trial name '{name}'. Must begin with one of: {prefixes_str} (e.g. 'Autumn Trial {year} A' or 'Spring Trial {year} B').")

        # 2. Date format & ordering
        try:
            sd = datetime.date.fromisoformat(start_date)
            ed = datetime.date.fromisoformat(end_date)
        except Exception:
            raise ValueError("Start date and End date must be in YYYY-MM-DD format.")

        if sd > ed:
            raise ValueError("Start date cannot be after End date.")

        if sd.year != year:
            raise ValueError(f"Start date year ({sd.year}) must match the trial year ({year}).")

        # 3. Maximum 10 trials per year
        trials_in_year = [
            t for t in self.data.get("trials", [])
            if t.get("year") == year and (exclude_trial_id is None or t.get("id") != exclude_trial_id)
        ]
        if len(trials_in_year) >= MAX_TRIALS_PER_YEAR:
            raise ValueError(f"Annual limit reached: Maximum of {MAX_TRIALS_PER_YEAR} trials allowed per calendar year ({year}).")

        # 4. Only one trial per set date (no overlapping dates)
        for t in self.data.get("trials", []):
            if exclude_trial_id and t.get("id") == exclude_trial_id:
                continue
            other_sd = datetime.date.fromisoformat(t["start_date"])
            other_ed = datetime.date.fromisoformat(t["end_date"])
            
            # Check overlap: A_start <= B_end and A_end >= B_start
            if sd <= other_ed and ed >= other_sd:
                raise ValueError(
                    f"Date collision: '{t['name']}' is already scheduled from {t['start_date']} to {t['end_date']}. "
                    "Only one trial is permitted per set date range."
                )

    def create_trial(
        self,
        name: str,
        year: int,
        start_date: str,
        end_date: str,
        whatsapp_url: str = "",
        anglers: Optional[List[str]] = None,
        a_team_anglers: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """Creates a new trial with validation."""
        self.validate_trial_rules(name, year, start_date, end_date)

        # Generate unique id
        clean_name = re.sub(r'[^a-zA-Z0-9]+', '_', name.lower()).strip('_')
        trial_id = f"{clean_name}_{start_date.replace('-', '')}"

        # Ensure unique ID
        existing_ids = {t["id"] for t in self.data.get("trials", [])}
        counter = 1
        base_id = trial_id
        while trial_id in existing_ids:
            trial_id = f"{base_id}_{counter}"
            counter += 1

        t_data = self.generate_fresh_tournament_data(name, anglers=anglers, a_team_anglers=a_team_anglers)
        now_iso = datetime.datetime.now().isoformat()

        new_trial = {
            "id": trial_id,
            "name": name.strip(),
            "year": year,
            "start_date": start_date,
            "end_date": end_date,
            "whatsapp_url": whatsapp_url.strip(),
            "created_at": now_iso,
            "updated_at": now_iso,
            "tournament_data": t_data
        }

        self.data["trials"].append(new_trial)
        self.data["active_trial_id"] = trial_id
        self.save()

        return {
            "success": True,
            "message": f"Successfully created trial '{name}'.",
            "trial": new_trial
        }

    def update_trial(
        self,
        trial_id: str,
        name: Optional[str] = None,
        year: Optional[int] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        whatsapp_url: Optional[str] = None,
        venue: Optional[str] = None
    ) -> Dict[str, Any]:
        """Updates trial metadata (name, dates, WhatsApp link, venue) with rule validation."""
        trial = None
        for t in self.data.get("trials", []):
            if t["id"] == trial_id:
                trial = t
                break
        if not trial:
            return {"success": False, "error": f"Trial '{trial_id}' not found."}

        new_name = name.strip() if name is not None else trial["name"]
        new_year = year if year is not None else trial["year"]
        new_sd = start_date if start_date is not None else trial["start_date"]
        new_ed = end_date if end_date is not None else trial["end_date"]
        new_wa = whatsapp_url.strip() if whatsapp_url is not None else trial.get("whatsapp_url", "")

        self.validate_trial_rules(new_name, new_year, new_sd, new_ed, exclude_trial_id=trial_id)

        trial["name"] = new_name
        trial["year"] = new_year
        trial["start_date"] = new_sd
        trial["end_date"] = new_ed
        trial["whatsapp_url"] = new_wa
        if venue is not None:
            trial["venue"] = venue.strip()
        trial["updated_at"] = datetime.datetime.now().isoformat()
        if "tournament_data" in trial:
            trial["tournament_data"]["tournament_name"] = new_name
            if venue is not None:
                trial["tournament_data"]["venue"] = venue.strip()

        self.save()
        return {"success": True, "message": f"Trial '{new_name}' updated successfully.", "trial": trial}

    def delete_trial(self, trial_id: str) -> Dict[str, Any]:
        """Deletes a trial (must keep at least 1)."""
        trials = self.data.get("trials", [])
        if len(trials) <= 1:
            return {"success": False, "error": "Cannot delete the only remaining trial."}

        index = None
        for i, t in enumerate(trials):
            if t["id"] == trial_id:
                index = i
                break

        if index is None:
            return {"success": False, "error": f"Trial '{trial_id}' not found."}

        removed = trials.pop(index)
        if self.data.get("active_trial_id") == trial_id:
            self.data["active_trial_id"] = trials[0]["id"]

        self.save()
        return {"success": True, "message": f"Trial '{removed['name']}' deleted."}

    # -------------------------------------------------------------
    # Tournament Operations on the Active Trial
    # -------------------------------------------------------------

    def log_event(self, event_type: str, message: str):
        t_data = self.get_active_tournament_data()
        if "activity_log" not in t_data:
            t_data["activity_log"] = []
        t_data["activity_log"].insert(0, {
            "timestamp": datetime.datetime.now().isoformat(),
            "type": event_type,
            "message": message
        })
        t_data["activity_log"] = t_data["activity_log"][:100]

    def reset_tournament(
        self, 
        anglers: List[str], 
        a_team_anglers: Optional[List[str]] = None,
        available_beats: Optional[List[Dict[str, Any]]] = None,
        tournament_name: Optional[str] = None, 
        venue: str = "Cape Piscatorial Society - Smalblaar & Elandspad"
    ):
        """Randomizes the active trial's schedule."""
        clean_anglers = [a.strip() for a in anglers if a.strip()]
        if len(clean_anglers) < 4:
            raise ValueError("Must provide at least 4 anglers.")
            
        clean_a_team = []
        if a_team_anglers is not None:
            clean_a_team = [a.strip() for a in a_team_anglers if a.strip() and a.strip() in clean_anglers]
            
        beats_to_use = available_beats if available_beats is not None else self.get_beats()
        schedule_res = generate_trials_schedule(
            clean_anglers, 
            a_team_anglers=clean_a_team, 
            available_beats=beats_to_use, 
            seed=None
        )
            
        sessions = schedule_res["sessions"]
        for s in sessions:
            for m in s["matches"]:
                m["status"] = "UNREPORTED"
                m["submissions"] = {}
                m["official_scores"] = {}
                m["calculated_points"] = {}
                m["discrepancy_details"] = None
                
        rec = self.get_active_trial_record()
        t_name = tournament_name if tournament_name else (rec["name"] if rec else "Autumn Trial 2026 A")

        updated_data = {
            "tournament_name": t_name,
            "venue": venue,
            "created_at": rec["tournament_data"].get("created_at") if rec else datetime.datetime.now().isoformat(),
            "updated_at": datetime.datetime.now().isoformat(),
            "anglers": clean_anglers,
            "num_anglers": len(clean_anglers),
            "a_team_anglers": clean_a_team,
            "num_a_team": len(clean_a_team),
            "num_beats": schedule_res["num_beats"],
            "beats": beats_to_use,
            "selected_beats": schedule_res.get("selected_beats", []),
            "angler_schedule": schedule_res.get("angler_schedule", {}),
            "three_way_counts": schedule_res.get("three_way_counts", {}),
            "sessions": sessions,
            "activity_log": [
                {
                    "timestamp": datetime.datetime.now().isoformat(),
                    "type": "RESET",
                    "message": f"Tournament randomized for {len(clean_anglers)} anglers with {len(clean_a_team)} Top 8 members across {schedule_res['num_beats']} beats."
                }
            ]
        }

        if rec:
            rec["tournament_data"] = updated_data
            rec["updated_at"] = datetime.datetime.now().isoformat()
        self.save()

    def clear_draw(self):
        """Clears all matches from all sessions in the active trial, resetting the draw."""
        t_data = self.get_active_tournament_data()
        t_data["sessions"] = []
        t_data["angler_schedule"] = {}
        t_data["three_way_counts"] = {}
        for row in t_data.get("leaderboard", []):
            row["s1_pts"] = 0
            row["s2_pts"] = 0
            row["s3_pts"] = 0
            row["s4_pts"] = 0
            row["total_points"] = 0
            row["total_fish"] = 0
            row["blanks"] = 0
            row["matches_played"] = 0
        self._sync_active_trial_to_root()
        self.save()
        return {"success": True, "message": "Tournament draw cleared."}

    def clear_session_matches(self, session_id: int):
        """Resets all match scores in the given session."""
        t_data = self.get_active_tournament_data()
        for s in t_data.get("sessions", []):
            if s.get("session_id") == session_id:
                for m in s.get("matches", []):
                    m["status"] = "UNREPORTED"
                    m["submissions"] = {}
                    m["official_scores"] = {}
                    m["calculated_points"] = {}
                    m["discrepancy_details"] = None
        self.recalculate_leaderboard()
        self._sync_active_trial_to_root()
        self.save()
        return {"success": True, "message": f"Session {session_id} scores cleared and reset."}

    def get_beats(self) -> List[Dict[str, Any]]:
        t_data = self.get_active_tournament_data()
        if "beats" not in t_data or not t_data["beats"]:
            t_data["beats"] = get_default_beats()
            self.save()
        return t_data["beats"]

    def update_beat(self, beat_id: str, update_dict: Dict[str, Any]) -> Dict[str, Any]:
        beats = self.get_beats()
        found = False
        target_beat = None
        for b in beats:
            if b.get("id") == beat_id or b.get("code") == beat_id:
                target_beat = b
                found = True
                break
                
        if not found:
            return {"success": False, "error": f"Beat {beat_id} not found."}
            
        allowed_fields = ["lower_pin", "upper_pin", "mid_pin", "river", "enabled", "meeting_point", "notes", "name", "usage_mode", "sat_available", "sat_sessions", "sun_available", "sun_sessions"]
        for f in allowed_fields:
            if f in update_dict:
                target_beat[f] = update_dict[f]
                
        # Also update beat in current matches if coordinates changed
        t_data = self.get_active_tournament_data()
        for s in t_data.get("sessions", []):
            for m in s.get("matches", []):
                if m.get("beat_id") == beat_id or m.get("beat_code") == beat_id:
                    if "lower_pin" in target_beat:
                        m["lower_pin"] = target_beat["lower_pin"]
                    if "upper_pin" in target_beat:
                        m["upper_pin"] = target_beat["upper_pin"]
                    if "mid_pin" in target_beat:
                        m["mid_pin"] = target_beat["mid_pin"]
                    if "river" in target_beat:
                        m["river"] = target_beat["river"]
                    if "meeting_point" in target_beat:
                        m["meeting_point"] = target_beat["meeting_point"]
                        
        self.save()
        return {"success": True, "beat": target_beat}

    def update_all_beats(self, beats_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Batch updates beats configuration (enabled, river, usage_mode, pins, meeting_point)."""
        current_beats = self.get_beats()
        updated_count = 0
        allowed_fields = ["lower_pin", "upper_pin", "mid_pin", "river", "enabled", "meeting_point", "notes", "name", "usage_mode", "sat_available", "sat_sessions", "sun_available", "sun_sessions"]
        
        for new_b in beats_list:
            b_id = new_b.get("id") or new_b.get("code")
            if not b_id:
                continue
            for cur_b in current_beats:
                if cur_b.get("id") == b_id or cur_b.get("code") == b_id:
                    for f in allowed_fields:
                        if f in new_b:
                            cur_b[f] = new_b[f]
                    updated_count += 1
                    break

        # Also sync to current match records where applicable
        t_data = self.get_active_tournament_data()
        for s in t_data.get("sessions", []):
            for m in s.get("matches", []):
                m_beat_id = m.get("beat_id") or m.get("beat_code")
                for cur_b in current_beats:
                    if cur_b.get("id") == m_beat_id or cur_b.get("code") == m_beat_id:
                        if "river" in cur_b: m["river"] = cur_b["river"]
                        if "lower_pin" in cur_b: m["lower_pin"] = cur_b["lower_pin"]
                        if "mid_pin" in cur_b: m["mid_pin"] = cur_b["mid_pin"]
                        if "upper_pin" in cur_b: m["upper_pin"] = cur_b["upper_pin"]
                        if "meeting_point" in cur_b: m["meeting_point"] = cur_b["meeting_point"]
                        break

        self.save()
        return {"success": True, "updated": updated_count, "beats": current_beats}

    def get_angler_schedule(self, angler_name: str) -> List[Dict[str, Any]]:
        """Returns 4-session schedule with pins and match details for an angler."""
        t_data = self.get_active_tournament_data()
        result = []
        for s in t_data.get("sessions", []):
            for m in s.get("matches", []):
                if angler_name in m.get("anglers", []):
                    opponents = [a for a in m["anglers"] if a != angler_name]
                    is_stayer = m.get("stayer") == angler_name
                    pin = m.get("mid_pin") if is_stayer else m.get("lower_pin")
                    result.append({
                        "session_id": s["session_id"],
                        "session_name": s["session_name"],
                        "session_short": s["session_short"],
                        "day": s["day"],
                        "time": s["time"],
                        "beat_number": m.get("beat_number"),
                        "beat_id": m.get("beat_id"),
                        "beat_code": m.get("beat_code"),
                        "beat_name": m.get("beat_name"),
                        "river": m.get("river"),
                        "meeting_point": m.get("meeting_point"),
                        "match_type": m.get("match_type"),
                        "opponents": opponents,
                        "is_stayer": is_stayer,
                        "section": "Second Half (Upper Section)" if is_stayer else "First Half (Lower Section)",
                        "pin": pin,
                        "lower_pin": m.get("lower_pin"),
                        "upper_pin": m.get("upper_pin"),
                        "mid_pin": m.get("mid_pin")
                    })
        return result

    def get_match(self, session_id: int, match_id: str) -> Optional[Dict[str, Any]]:
        t_data = self.get_active_tournament_data()
        for s in t_data.get("sessions", []):
            if s["session_id"] == session_id:
                for m in s["matches"]:
                    if m["match_id"] == match_id:
                        return m
        return None

    def submit_match_score(self, session_id: int, match_id: str, submitter_name: str, reported_scores: Dict[str, int], notes: str = "") -> Dict[str, Any]:
        """Dual submission verification."""
        rec = self.get_active_trial_record()
        if rec:
            st = compute_trial_status(rec.get("start_date", ""), rec.get("end_date", ""))
            if st["is_past"]:
                return {
                    "success": False,
                    "error": f"This trial ({rec['name']}) is a completed past event. Scores cannot be modified."
                }

        match = self.get_match(session_id, match_id)
        if not match:
            return {"success": False, "error": f"Match {match_id} in Session {session_id} not found."}
            
        if submitter_name not in match["anglers"]:
            return {"success": False, "error": f"{submitter_name} is not a registered participant in match {match_id}."}
            
        for angler in match["anglers"]:
            if angler not in reported_scores:
                return {"success": False, "error": f"Missing score for {angler}."}
            try:
                reported_scores[angler] = max(0, int(reported_scores[angler]))
            except (ValueError, TypeError):
                return {"success": False, "error": f"Invalid fish count for {angler}."}
                
        match["submissions"][submitter_name] = {
            "submitted_at": datetime.datetime.now().isoformat(),
            "reported_scores": reported_scores,
            "notes": notes.strip()
        }
        
        num_anglers_in_match = len(match["anglers"])
        num_submissions = len(match["submissions"])
        
        if num_submissions < num_anglers_in_match:
            match["status"] = "PENDING_CONFIRMATION"
            match["discrepancy_details"] = None
            pending_from = [a for a in match["anglers"] if a not in match["submissions"]]
            msg = f"Score received from {submitter_name}. Waiting for report from: {', '.join(pending_from)}."
            self.log_event("SUBMISSION", f"Session {session_id}, {match['beat_name']}: {msg}")
            self.save()
            return {
                "success": True,
                "status": "PENDING_CONFIRMATION",
                "message": msg,
                "match": match
            }
        else:
            first_sub = list(match["submissions"].values())[0]["reported_scores"]
            all_match = True
            for other_sub in list(match["submissions"].values())[1:]:
                other_scores = other_sub["reported_scores"]
                for angler in match["anglers"]:
                    if first_sub[angler] != other_scores[angler]:
                        all_match = False
                        break
                if not all_match:
                    break
                    
            if all_match:
                match["status"] = "CONFIRMED"
                match["official_scores"] = first_sub
                match["calculated_points"] = calculate_match_points(first_sub, match_type=match.get("match_type"))
                match["discrepancy_details"] = None
                
                score_str = ", ".join([f"{a}: {first_sub[a]} fish ({match['calculated_points'][a]} pts)" for a in match["anglers"]])
                log_msg = f"AUTO-VERIFIED: Both reports matched on Session {session_id}, {match['beat_name']}: {score_str}"
                self.log_event("CONFIRMED", log_msg)
                self.save()
                return {
                    "success": True,
                    "status": "CONFIRMED",
                    "message": "Scores verified! Both participant reports matched perfectly.",
                    "match": match
                }
            else:
                match["status"] = "DISCREPANCY"
                diff_summary = []
                for sub_name, sub_data in match["submissions"].items():
                    sub_str = ", ".join([f"{a}: {sub_data['reported_scores'][a]}" for a in match["anglers"]])
                    diff_summary.append(f"{sub_name} reported: [{sub_str}]")
                discrepancy_text = " | ".join(diff_summary)
                match["discrepancy_details"] = discrepancy_text
                
                log_msg = f"DISCREPANCY on Session {session_id}, {match['beat_name']}: {discrepancy_text}. Awaiting organizer review."
                self.log_event("DISCREPANCY", log_msg)
                self.save()
                return {
                    "success": True,
                    "status": "DISCREPANCY",
                    "message": "Discrepancy detected between participant reports. The organizer has been alerted to review.",
                    "match": match
                }

    def admin_resolve_match(self, session_id: int, match_id: str, official_scores: Dict[str, int], admin_note: str = "") -> Dict[str, Any]:
        """Organizer overrides or resolves a match score directly."""
        match = self.get_match(session_id, match_id)
        if not match:
            return {"success": False, "error": "Match not found."}
            
        clean_scores = {}
        for angler in match["anglers"]:
            clean_scores[angler] = max(0, int(official_scores.get(angler, 0)))
            
        match["status"] = "ADMIN_CONFIRMED"
        match["official_scores"] = clean_scores
        match["calculated_points"] = calculate_match_points(clean_scores, match_type=match.get("match_type"))
        match["discrepancy_details"] = None
        match["admin_note"] = admin_note.strip()
        
        score_str = ", ".join([f"{a}: {clean_scores[a]} fish ({match['calculated_points'][a]} pts)" for a in match["anglers"]])
        self.log_event("ADMIN_OVERRIDE", f"Organizer confirmed Session {session_id}, {match['beat_name']}: {score_str}")
        self.save()
        
        return {
            "success": True,
            "status": "ADMIN_CONFIRMED",
            "message": "Official score confirmed by organizer.",
            "match": match
        }

    def get_discrepancies(self) -> List[Dict[str, Any]]:
        t_data = self.get_active_tournament_data()
        discrepancies = []
        for s in t_data.get("sessions", []):
            for m in s.get("matches", []):
                if m.get("status") == "DISCREPANCY":
                    discrepancies.append(m)
        return discrepancies

    def get_full_state(self) -> Dict[str, Any]:
        """Returns the full state of the active trial, including trial metadata and trials list."""
        rec = self.get_active_trial_record()
        t_data = self.get_active_tournament_data()

        a_team = t_data.get("a_team_anglers", [])
        leaderboard = compute_leaderboard(t_data["anglers"], t_data["sessions"], a_team_anglers=a_team)
        
        discrepancies = []
        pending = []
        confirmed_count = 0
        total_matches = 0
        
        for s in t_data.get("sessions", []):
            for m in s["matches"]:
                total_matches += 1
                if m["status"] == "DISCREPANCY":
                    discrepancies.append(m)
                elif m["status"] == "PENDING_CONFIRMATION":
                    pending.append(m)
                elif m["status"] in ["CONFIRMED", "ADMIN_CONFIRMED"]:
                    confirmed_count += 1

        # Trial metadata & status
        trial_status = compute_trial_status(
            rec.get("start_date", "") if rec else "",
            rec.get("end_date", "") if rec else ""
        )

        trial_info = {
            "id": rec["id"] if rec else "default_trial",
            "name": rec["name"] if rec else t_data.get("tournament_name", "Autumn Trial 2026 A"),
            "year": rec.get("year", 2026) if rec else 2026,
            "start_date": rec.get("start_date", "") if rec else "",
            "end_date": rec.get("end_date", "") if rec else "",
            "whatsapp_url": rec.get("whatsapp_url", "") if rec else "",
            "status": trial_status["status"],
            "status_label": trial_status["status_label"],
            "date_range_label": trial_status.get("date_range_label", ""),
            "is_past": trial_status["is_past"],
            "is_in_session": trial_status["is_in_session"],
            "is_upcoming": trial_status["is_upcoming"]
        }

        return {
            "tournament_name": trial_info["name"],
            "venue": t_data.get("venue", "Cape Piscatorial Society - Smalblaar & Elandspad"),
            "anglers": t_data["anglers"],
            "num_anglers": t_data["num_anglers"],
            "a_team_anglers": a_team,
            "num_a_team": len(a_team),
            "num_beats": t_data["num_beats"],
            "beats": self.get_beats(),
            "selected_beats": t_data.get("selected_beats", []),
            "angler_schedule": t_data.get("angler_schedule", {}),
            "three_way_counts": t_data.get("three_way_counts", {}),
            "sessions": t_data["sessions"],
            "leaderboard": leaderboard,
            "activity_log": t_data.get("activity_log", []),
            "stats": {
                "total_matches": total_matches,
                "confirmed_matches": confirmed_count,
                "discrepancies_count": len(discrepancies),
                "pending_count": len(pending)
            },
            "discrepancies": discrepancies,
            "pending": pending,
            "trial_info": trial_info,
            "all_trials": self.get_trials_summary_list()
        }

    def save_session_snapshot(self, session_id: Optional[int] = None, custom_name: str = "") -> Dict[str, Any]:
        """Saves a snapshot of active trial tournament data."""
        t_data = self.get_active_tournament_data()
        now = datetime.datetime.now()
        ts_str = now.strftime("%Y%m%d_%H%M%S")
        
        prefix = f"Session_{session_id}" if session_id is not None else "Tournament"
        safe_name = "".join(c for c in custom_name if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_')
        filename = f"{prefix}_{safe_name}_{ts_str}.json" if safe_name else f"{prefix}_{ts_str}.json"
            
        full_path = os.path.join(SAVES_DIR, filename)
        snapshot_payload = {
            "snapshot_metadata": {
                "filename": filename,
                "saved_at": now.isoformat(),
                "session_id": session_id,
                "snapshot_name": custom_name or prefix,
                "tournament_name": t_data.get("tournament_name", "Fly Fishing Trials"),
                "num_anglers": t_data.get("num_anglers", len(t_data.get("anglers", []))),
            },
            "tournament_data": t_data
        }
        
        with open(full_path, "w", encoding="utf-8") as f:
            json.dump(snapshot_payload, f, indent=2)
            
        self.log_event("SESSION_SAVED", f"Saved {prefix} snapshot '{filename}'.")
        self.save()
        
        return {
            "success": True,
            "filename": filename,
            "message": f"Successfully saved {prefix} snapshot: {filename}",
            "saved_at": now.isoformat()
        }

    def list_saved_sessions(self) -> List[Dict[str, Any]]:
        if not os.path.exists(SAVES_DIR):
            return []
        files = [f for f in os.listdir(SAVES_DIR) if f.endswith(".json")]
        result = []
        for fn in sorted(files, reverse=True):
            fp = os.path.join(SAVES_DIR, fn)
            try:
                with open(fp, "r", encoding="utf-8") as f:
                    content = json.load(f)
                    meta = content.get("snapshot_metadata", {})
                    meta["size_bytes"] = os.path.getsize(fp)
                    result.append(meta)
            except Exception:
                result.append({"filename": fn, "corrupted": True})
        return result

    def load_saved_session(self, filename: str) -> Dict[str, Any]:
        """Alias for restore_session_snapshot."""
        return self.restore_session_snapshot(filename)

    def delete_saved_session(self, filename: str) -> Dict[str, Any]:
        safe_fn = os.path.basename(filename)
        fp = os.path.join(SAVES_DIR, safe_fn)
        if not os.path.exists(fp):
            return {"success": False, "error": f"Snapshot file '{safe_fn}' not found."}
        try:
            os.remove(fp)
            return {"success": True, "message": f"Snapshot '{safe_fn}' deleted."}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def restore_session_snapshot(self, filename: str) -> Dict[str, Any]:
        safe_fn = os.path.basename(filename)
        fp = os.path.join(SAVES_DIR, safe_fn)
        if not os.path.exists(fp):
            return {"success": False, "error": f"Snapshot file '{safe_fn}' not found."}
            
        try:
            with open(fp, "r", encoding="utf-8") as f:
                content = json.load(f)
                if "tournament_data" not in content:
                    return {"success": False, "error": "Invalid snapshot file format."}
                    
                rec = self.get_active_trial_record()
                if rec:
                    rec["tournament_data"] = content["tournament_data"]
                    rec["updated_at"] = datetime.datetime.now().isoformat()
                self.save()
                self.log_event("SESSION_RESTORED", f"Restored tournament from snapshot '{safe_fn}'.")
                return {"success": True, "message": f"Tournament successfully restored from '{safe_fn}'."}
        except Exception as e:
            return {"success": False, "error": f"Failed to restore snapshot: {str(e)}"}
