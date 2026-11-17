"""
Fly Fishing Trials Database & Verification Engine
=================================================
Handles persistent storage of:
- Tournament metadata
- Angler list (8, 9, 10 or custom)
- Generated 4-session schedule with beats
- Dual-submission verification:
  - When both anglers report matching scores -> auto-confirms & calculates 10-point rule.
  - When scores conflict -> flags as DISCREPANCY for organizer review.
  - Admin direct entry / override.
"""

import os
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

DEFAULT_ANGLERS_8 = [
    "James Parker", "David Miller", "Michael Scott", "Robert Brown",
    "John Davis", "William Wilson", "Richard Taylor", "Thomas Anderson"
]

DEFAULT_ANGLERS_9 = [
    "James Parker", "David Miller", "Michael Scott", "Robert Brown",
    "John Davis", "William Wilson", "Richard Taylor", "Thomas Anderson",
    "Christopher Evans"
]

DEFAULT_ANGLERS_10 = [
    "James Parker", "David Miller", "Michael Scott", "Robert Brown",
    "John Davis", "William Wilson", "Richard Taylor", "Thomas Anderson",
    "Christopher Evans", "Matthew Clark"
]

class TournamentDB:
    def __init__(self, filepath: str = DB_FILE):
        self.filepath = filepath
        self.data: Dict[str, Any] = {}
        self.load()

    def get_default_data(self) -> Dict[str, Any]:
        anglers = DEFAULT_ANGLERS_9
        a_team = anglers[:3]
        beats = get_default_beats()
        schedule_res = generate_trials_schedule(anglers, a_team_anglers=a_team, available_beats=beats, seed=42)
        
        # Initialize match statuses
        sessions = schedule_res["sessions"]
        for s in sessions:
            for m in s["matches"]:
                m["status"] = "UNREPORTED" # UNREPORTED, PENDING_CONFIRMATION, CONFIRMED, DISCREPANCY, ADMIN_CONFIRMED
                m["submissions"] = {}
                m["official_scores"] = {}
                m["calculated_points"] = {}
                m["discrepancy_details"] = None
                
        return {
            "tournament_name": "Fly Fishing Trials 2026",
            "venue": "National Fly Fishing Championship Beats",
            "created_at": datetime.datetime.now().isoformat(),
            "updated_at": datetime.datetime.now().isoformat(),
            "anglers": anglers,
            "num_anglers": len(anglers),
            "a_team_anglers": a_team,
            "num_a_team": len(a_team),
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
                    "message": "Tournament initialized with 9 anglers and 3 A-Team members across 4 sessions."
                }
            ]
        }

    def load(self):
        if os.path.exists(self.filepath):
            try:
                with open(self.filepath, "r", encoding="utf-8") as f:
                    self.data = json.load(f)
                    return
            except Exception as e:
                print(f"Error loading database file: {e}. Reinitializing default data.")
        self.data = self.get_default_data()
        self.save()

    def save(self):
        self.data["updated_at"] = datetime.datetime.now().isoformat()
        with open(self.filepath, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=2)

    def log_event(self, event_type: str, message: str):
        if "activity_log" not in self.data:
            self.data["activity_log"] = []
        self.data["activity_log"].insert(0, {
            "timestamp": datetime.datetime.now().isoformat(),
            "type": event_type,
            "message": message
        })
        # Keep last 100 log events
        self.data["activity_log"] = self.data["activity_log"][:100]

    def reset_tournament(
        self, 
        anglers: List[str], 
        a_team_anglers: Optional[List[str]] = None,
        available_beats: Optional[List[Dict[str, Any]]] = None,
        tournament_name: str = "Fly Fishing Trials 2026", 
        venue: str = "Championship Beats"
    ):
        """
        Creates a new randomized schedule with the provided anglers, A-team constraints, beats, and resets scores.
        """
        clean_anglers = [a.strip() for a in anglers if a.strip()]
        if len(clean_anglers) < 4:
            raise ValueError("Must provide at least 4 anglers.")
            
        clean_a_team = [a.strip() for a in (a_team_anglers or []) if a.strip() in clean_anglers]
        
        # Use provided beats or existing database beats or defaults
        beats_to_use = available_beats or self.data.get("beats") or get_default_beats()
        
        schedule_res = generate_trials_schedule(clean_anglers, a_team_anglers=clean_a_team, available_beats=beats_to_use)
        if not schedule_res.get("success"):
            raise ValueError(schedule_res.get("error", "Schedule generation failed."))
            
        sessions = schedule_res["sessions"]
        for s in sessions:
            for m in s["matches"]:
                m["status"] = "UNREPORTED"
                m["submissions"] = {}
                m["official_scores"] = {}
                m["calculated_points"] = {}
                m["discrepancy_details"] = None
                
        self.data = {
            "tournament_name": tournament_name,
            "venue": venue,
            "created_at": datetime.datetime.now().isoformat(),
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
                    "message": f"Tournament randomized for {len(clean_anglers)} anglers with {len(clean_a_team)} A-Team members across {schedule_res['num_beats']} beats."
                }
            ]
        }
        self.save()

    def get_beats(self) -> List[Dict[str, Any]]:
        """Returns the full beats catalog."""
        if "beats" not in self.data or not self.data["beats"]:
            self.data["beats"] = get_default_beats()
            self.save()
        return self.data["beats"]

    def update_beat(self, beat_id: str, update_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Updates GPS coordinates, river, active status, or meeting point for a beat."""
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
            
        allowed_fields = ["lower_pin", "upper_pin", "mid_pin", "river", "enabled", "meeting_point", "notes", "name"]
        for f in allowed_fields:
            if f in update_dict:
                target_beat[f] = update_dict[f]
                
        # Also update in active sessions if present
        for s in self.data.get("sessions", []):
            for m in s.get("matches", []):
                if m.get("beat_id") == beat_id or m.get("beat_code") == beat_id:
                    for f in ["lower_pin", "upper_pin", "mid_pin", "river", "meeting_point", "name"]:
                        if f in update_dict:
                            m[f if f != "name" else "beat_name"] = update_dict[f]
                            
        self.log_event("BEAT_UPDATE", f"Updated beat {target_beat.get('name', beat_id)} coordinates / settings.")
        self.save()
        return {"success": True, "beat": target_beat}

    def get_angler_schedule(self, angler_name: str) -> List[Dict[str, Any]]:
        """Returns the 4 session details and map pins for an angler."""
        sched_map = self.data.get("angler_schedule", {})
        if angler_name in sched_map:
            return sched_map[angler_name]
            
        # Dynamically build if not cached
        result = []
        for s in self.data.get("sessions", []):
            for m in s.get("matches", []):
                if angler_name in m.get("anglers", []):
                    opponents = [a for a in m.get("anglers", []) if a != angler_name]
                    is_stayer = angler_name in m.get("stayers", [])
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
        for s in self.data.get("sessions", []):
            if s["session_id"] == session_id:
                for m in s["matches"]:
                    if m["match_id"] == match_id:
                        return m
        return None

    def submit_match_score(self, session_id: int, match_id: str, submitter_name: str, reported_scores: Dict[str, int], notes: str = "") -> Dict[str, Any]:
        """
        Processes a match score submission from a participant.
        Checks dual-submission match:
        - If 1st submission: status PENDING_CONFIRMATION
        - If all participants submit:
            - If matching: auto-confirm & score
            - If mismatch: set DISCREPANCY
        """
        match = self.get_match(session_id, match_id)
        if not match:
            return {"success": False, "error": f"Match {match_id} in Session {session_id} not found."}
            
        if submitter_name not in match["anglers"]:
            return {"success": False, "error": f"{submitter_name} is not a registered participant in match {match_id}."}
            
        # Validate that reported_scores covers all anglers in this match with non-negative integers
        for angler in match["anglers"]:
            if angler not in reported_scores:
                return {"success": False, "error": f"Missing score for {angler}."}
            try:
                reported_scores[angler] = max(0, int(reported_scores[angler]))
            except (ValueError, TypeError):
                return {"success": False, "error": f"Invalid fish count for {angler}."}
                
        # Record submission
        match["submissions"][submitter_name] = {
            "submitted_at": datetime.datetime.now().isoformat(),
            "reported_scores": reported_scores,
            "notes": notes.strip()
        }
        
        num_anglers_in_match = len(match["anglers"])
        num_submissions = len(match["submissions"])
        
        if num_submissions < num_anglers_in_match:
            # Need more submissions before verifying
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
            # All anglers have submitted! Compare reports
            all_reports = list(match["submissions"].values())
            first_report = all_reports[0]["reported_scores"]
            
            is_matching = True
            for other in all_reports[1:]:
                other_report = other["reported_scores"]
                for angler in match["anglers"]:
                    if first_report.get(angler) != other_report.get(angler):
                        is_matching = False
                        break
                if not is_matching:
                    break
                    
            if is_matching:
                # MATCH CONFIRMED! Auto-calculate points
                match["status"] = "CONFIRMED"
                match["official_scores"] = first_report
                match["calculated_points"] = calculate_match_points(first_report, match_type=match.get("match_type"))
                match["discrepancy_details"] = None
                
                score_str = ", ".join([f"{a}: {first_report[a]} fish ({match['calculated_points'][a]} pts)" for a in match["anglers"]])
                log_msg = f"Session {session_id}, {match['beat_name']} verified by both anglers! Result: {score_str}"
                self.log_event("VERIFIED", log_msg)
                self.save()
                return {
                    "success": True,
                    "status": "CONFIRMED",
                    "message": "Both angler reports matched perfectly! Match score verified and loaded.",
                    "match": match
                }
            else:
                # DISCREPANCY!
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
        """
        Organizer overrides or resolves a match score directly.
        """
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
        """Returns all matches currently flagged with conflicting participant reports."""
        discrepancies = []
        for s in self.data.get("sessions", []):
            for m in s.get("matches", []):
                if m.get("status") == "DISCREPANCY":
                    discrepancies.append(m)
        return discrepancies

    def get_full_state(self) -> Dict[str, Any]:
        a_team = self.data.get("a_team_anglers", [])
        leaderboard = compute_leaderboard(self.data["anglers"], self.data["sessions"], a_team_anglers=a_team)
        
        # Count discrepancies and pending
        discrepancies = []
        pending = []
        confirmed_count = 0
        total_matches = 0
        
        for s in self.data["sessions"]:
            for m in s["matches"]:
                total_matches += 1
                if m["status"] == "DISCREPANCY":
                    discrepancies.append(m)
                elif m["status"] == "PENDING_CONFIRMATION":
                    pending.append(m)
                elif m["status"] in ["CONFIRMED", "ADMIN_CONFIRMED"]:
                    confirmed_count += 1
                    
        return {
            "tournament_name": self.data["tournament_name"],
            "venue": self.data["venue"],
            "anglers": self.data["anglers"],
            "num_anglers": self.data["num_anglers"],
            "a_team_anglers": a_team,
            "num_a_team": len(a_team),
            "num_beats": self.data["num_beats"],
            "beats": self.get_beats(),
            "selected_beats": self.data.get("selected_beats", []),
            "angler_schedule": self.data.get("angler_schedule", {}),
            "three_way_counts": self.data.get("three_way_counts", {}),
            "sessions": self.data["sessions"],
            "leaderboard": leaderboard,
            "activity_log": self.data.get("activity_log", []),
            "stats": {
                "total_matches": total_matches,
                "confirmed_matches": confirmed_count,
                "discrepancies_count": len(discrepancies),
                "pending_count": len(pending)
            },
            "discrepancies": discrepancies,
            "pending": pending
        }

    def save_session_snapshot(self, session_id: Optional[int] = None, custom_name: str = "") -> Dict[str, Any]:
        """
        Saves a snapshot of the tournament and/or a specific session to disk.
        """
        if not os.path.exists(SAVES_DIR):
            os.makedirs(SAVES_DIR, exist_ok=True)
            
        now = datetime.datetime.now()
        ts_str = now.strftime("%Y%m%d_%H%M%S")
        
        # Mark specific session if requested
        if session_id is not None:
            for s in self.data.get("sessions", []):
                if s["session_id"] == session_id:
                    s["is_saved"] = True
                    s["saved_at"] = now.isoformat()
                    # Check if all matches completed
                    all_done = all(m.get("status") in ["CONFIRMED", "ADMIN_CONFIRMED"] for m in s.get("matches", []))
                    s["is_completed"] = all_done
            self.save()
            prefix = f"Session_{session_id}"
        else:
            prefix = "Tournament"
            
        safe_name = "".join(c for c in custom_name if c.isalnum() or c in (' ', '_', '-')).strip().replace(' ', '_')
        if safe_name:
            filename = f"{prefix}_{safe_name}_{ts_str}.json"
        else:
            filename = f"{prefix}_{ts_str}.json"
            
        full_path = os.path.join(SAVES_DIR, filename)
        snapshot_payload = {
            "snapshot_metadata": {
                "filename": filename,
                "saved_at": now.isoformat(),
                "session_id": session_id,
                "snapshot_name": custom_name or prefix,
                "tournament_name": self.data.get("tournament_name", "Fly Fishing Trials"),
                "num_anglers": self.data.get("num_anglers", len(self.data.get("anglers", []))),
            },
            "tournament_data": self.data
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
        """
        Lists all saved session/tournament snapshot files in SAVES_DIR.
        """
        if not os.path.exists(SAVES_DIR):
            return []
            
        saves = []
        for fn in os.listdir(SAVES_DIR):
            if fn.endswith(".json"):
                fp = os.path.join(SAVES_DIR, fn)
                try:
                    size = os.path.getsize(fp)
                    mtime = datetime.datetime.fromtimestamp(os.path.getmtime(fp)).isoformat()
                    with open(fp, "r", encoding="utf-8") as f:
                        content = json.load(f)
                    meta = content.get("snapshot_metadata", {})
                    t_data = content.get("tournament_data", content)
                    
                    # Compute completed matches
                    total_m = 0
                    conf_m = 0
                    for s in t_data.get("sessions", []):
                        for m in s.get("matches", []):
                            total_m += 1
                            if m.get("status") in ["CONFIRMED", "ADMIN_CONFIRMED"]:
                                conf_m += 1
                                
                    saves.append({
                        "filename": fn,
                        "saved_at": meta.get("saved_at", mtime),
                        "snapshot_name": meta.get("snapshot_name", fn),
                        "session_id": meta.get("session_id"),
                        "tournament_name": meta.get("tournament_name", t_data.get("tournament_name", "Trials")),
                        "num_anglers": meta.get("num_anglers", t_data.get("num_anglers", 0)),
                        "completed_matches": conf_m,
                        "total_matches": total_m,
                        "file_size": size
                    })
                except Exception as e:
                    print(f"Error reading save file {fn}: {e}")
                    
        # Sort newest first
        saves.sort(key=lambda x: x.get("saved_at", ""), reverse=True)
        return saves

    def load_saved_session(self, filename: str) -> Dict[str, Any]:
        """
        Restores a saved snapshot into the active tournament state.
        """
        safe_fn = os.path.basename(filename)
        fp = os.path.join(SAVES_DIR, safe_fn)
        if not os.path.exists(fp):
            return {"success": False, "error": f"File '{safe_fn}' not found in saved sessions."}
            
        try:
            with open(fp, "r", encoding="utf-8") as f:
                content = json.load(f)
            if "tournament_data" in content:
                self.data = content["tournament_data"]
            else:
                self.data = content
                
            self.log_event("SESSION_LOADED", f"Restored tournament state from saved snapshot '{safe_fn}'.")
            self.save()
            return {
                "success": True,
                "message": f"Successfully loaded '{safe_fn}'.",
                "state": self.get_full_state()
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to load save file: {str(e)}"}

    def delete_saved_session(self, filename: str) -> Dict[str, Any]:
        """
        Deletes a saved session file.
        """
        safe_fn = os.path.basename(filename)
        fp = os.path.join(SAVES_DIR, safe_fn)
        if not os.path.exists(fp):
            return {"success": False, "error": "File not found."}
        try:
            os.remove(fp)
            return {"success": True, "message": f"Deleted {safe_fn}."}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def import_tournament_json(self, raw_json_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Imports and validates external tournament JSON.
        """
        if "tournament_data" in raw_json_data:
            imported = raw_json_data["tournament_data"]
        else:
            imported = raw_json_data
            
        if not imported.get("anglers") or not imported.get("sessions"):
            return {"success": False, "error": "Invalid tournament file format: missing anglers or sessions."}
            
        self.data = imported
        self.log_event("IMPORT", "Imported external tournament state.")
        self.save()
        return {"success": True, "message": "Tournament imported successfully.", "state": self.get_full_state()}

if __name__ == "__main__":
    db = TournamentDB()
    state = db.get_full_state()
    print("Tournament loaded successfully!")
    print(f"Name: {state['tournament_name']}, Anglers: {state['num_anglers']}, Beats: {state['num_beats']}")
    print(f"Total Matches: {state['stats']['total_matches']}")
