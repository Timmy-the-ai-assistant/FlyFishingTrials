"""
Fly Fishing Trials Web Application Server
=========================================
Runs a multi-threaded HTTP server on port 8080 (or configurable).
Provides:
- Complete REST API for schedule, live scoring, conflict resolution, angler management
- Dual-submission verification engine ("Google Forms" style)
- Live Leaderboard with 10-point proportional scoring & blanks rule
- Dynamic PDF generator download
- Automatic Local IP detection for mobile device access on Wi-Fi
- Built-in online tunneling integration
"""

import os
import sys
import json
import socket
import urllib.parse
import webbrowser
from typing import Any, Dict, List
from http.server import HTTPServer, SimpleHTTPRequestHandler
from socketserver import ThreadingMixIn

from database import TournamentDB
from pdf_generator import generate_tournament_pdf

PORT = 8585
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

db = TournamentDB()

def get_local_ip() -> str:
    """Detects local LAN IP address so smartphones can connect over Wi-Fi."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        # Doesn't need to actually reach external internet
        s.connect(('10.254.254.254', 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

class TrialsRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def log_message(self, format, *args):
        # Clean console logging
        sys.stdout.write(f"[{self.log_date_time_string()}] {args[0]} {args[1]}\n")

    def send_json_response(self, data: Any, status_code: int = 200):
        body = json.dumps(data, indent=2).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/state":
            state = db.get_full_state()
            self.send_json_response(state)
            return

        elif path == "/api/beats":
            beats = db.get_beats()
            self.send_json_response({"success": True, "beats": beats})
            return

        elif path == "/api/angler_schedule":
            query = urllib.parse.parse_qs(parsed.query)
            angler = query.get("angler", [""])[0]
            if not angler:
                self.send_json_response({"success": False, "error": "Missing 'angler' parameter."}, status_code=400)
                return
            sched = db.get_angler_schedule(angler)
            self.send_json_response({"success": True, "angler": angler, "schedule": sched})
            return

        elif path == "/api/network_info":
            local_ip = get_local_ip()
            info = {
                "local_ip": local_ip,
                "port": PORT,
                "local_url": f"http://localhost:{PORT}",
                "network_url": f"http://{local_ip}:{PORT}"
            }
            self.send_json_response(info)
            return

        elif path == "/api/session/saves":
            saves = db.list_saved_sessions()
            self.send_json_response(saves)
            return

        elif path == "/api/session/export":
            body = json.dumps(db.data, indent=2).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Disposition", 'attachment; filename="Fly_Fishing_Trials_Backup.json"')
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        elif path == "/api/pdf":
            # Generate fresh PDF
            pdf_path = os.path.join(os.path.dirname(__file__), "Fly_Fishing_Trials_Official_Schedule_Scores.pdf")
            try:
                generate_tournament_pdf(db.get_full_state(), pdf_path)
                with open(pdf_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "application/pdf")
                self.send_header("Content-Disposition", 'attachment; filename="Fly_Fishing_Trials_Schedule_and_Scores.pdf"')
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
                return
            except Exception as e:
                self.send_json_response({"error": str(e)}, status_code=500)
                return

        # Fallback to static files
        if path == "/" or path == "":
            self.path = "/index.html"
            return super().do_GET()
            
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_length = int(self.headers.get("Content-Length", 0))
        raw_body = self.rfile.read(content_length)
        
        try:
            body_json = json.loads(raw_body.decode("utf-8")) if raw_body else {}
        except json.JSONDecodeError:
            self.send_json_response({"error": "Invalid JSON body"}, status_code=400)
            return

        if path == "/api/submit":
            session_id = body_json.get("session_id")
            match_id = body_json.get("match_id")
            submitter_name = body_json.get("submitter_name")
            reported_scores = body_json.get("reported_scores", {})
            notes = body_json.get("notes", "")

            if not session_id or not match_id or not submitter_name or not reported_scores:
                self.send_json_response({
                    "success": False,
                    "error": "Missing required fields (session_id, match_id, submitter_name, reported_scores)"
                }, status_code=400)
                return

            res = db.submit_match_score(
                session_id=int(session_id),
                match_id=match_id,
                submitter_name=submitter_name,
                reported_scores=reported_scores,
                notes=notes
            )
            self.send_json_response(res, status_code=200 if res.get("success") else 400)
            return

        elif path == "/api/admin/resolve":
            session_id = body_json.get("session_id")
            match_id = body_json.get("match_id")
            official_scores = body_json.get("official_scores", {})
            admin_note = body_json.get("admin_note", "")

            if not session_id or not match_id or not official_scores:
                self.send_json_response({
                    "success": False,
                    "error": "Missing required fields (session_id, match_id, official_scores)"
                }, status_code=400)
                return

            res = db.admin_resolve_match(
                session_id=int(session_id),
                match_id=match_id,
                official_scores=official_scores,
                admin_note=admin_note
            )
            self.send_json_response(res, status_code=200 if res.get("success") else 400)
            return

        elif path == "/api/beats/update":
            beat_id = body_json.get("beat_id") or body_json.get("id") or body_json.get("code")
            if not beat_id:
                self.send_json_response({"success": False, "error": "Missing beat 'id' or 'code'."}, status_code=400)
                return
            res = db.update_beat(beat_id, body_json)
            self.send_json_response(res, status_code=200 if res.get("success") else 400)
            return

        elif path == "/api/admin/reset":
            anglers = body_json.get("anglers", [])
            a_team_anglers = body_json.get("a_team_anglers", [])
            available_beats = body_json.get("available_beats", None)
            t_name = body_json.get("tournament_name", "Fly Fishing Trials 2026")
            venue = body_json.get("venue", "Championship Beats")

            if len(anglers) < 4:
                self.send_json_response({
                    "success": False,
                    "error": "At least 4 angler names must be provided."
                }, status_code=400)
                return

            try:
                db.reset_tournament(
                    anglers, 
                    a_team_anglers=a_team_anglers, 
                    available_beats=available_beats,
                    tournament_name=t_name, 
                    venue=venue
                )
                self.send_json_response({
                    "success": True,
                    "message": f"Tournament reset successfully for {len(anglers)} anglers with {len(a_team_anglers)} A-Team members.",
                    "state": db.get_full_state()
                })
            except Exception as e:
                self.send_json_response({"success": False, "error": str(e)}, status_code=500)
            return

        elif path == "/api/session/save":
            session_id = body_json.get("session_id")
            if session_id is not None:
                try:
                    session_id = int(session_id)
                except ValueError:
                    session_id = None
            custom_name = body_json.get("snapshot_name", "")
            res = db.save_session_snapshot(session_id=session_id, custom_name=custom_name)
            self.send_json_response(res, status_code=200 if res.get("success") else 400)
            return

        elif path == "/api/session/load":
            filename = body_json.get("filename", "")
            if not filename:
                self.send_json_response({"success": False, "error": "Filename is required."}, status_code=400)
                return
            res = db.load_saved_session(filename)
            self.send_json_response(res, status_code=200 if res.get("success") else 400)
            return

        elif path == "/api/session/delete":
            filename = body_json.get("filename", "")
            if not filename:
                self.send_json_response({"success": False, "error": "Filename is required."}, status_code=400)
                return
            res = db.delete_saved_session(filename)
            self.send_json_response(res, status_code=200 if res.get("success") else 400)
            return

        elif path == "/api/session/import":
            res = db.import_tournament_json(body_json)
            self.send_json_response(res, status_code=200 if res.get("success") else 400)
            return

        self.send_json_response({"error": "Endpoint not found"}, status_code=404)

def run_server(port: int = PORT, open_browser: bool = True):
    local_ip = get_local_ip()
    local_url = f"http://localhost:{port}"
    network_url = f"http://{local_ip}:{port}"

    server = ThreadedHTTPServer(("0.0.0.0", port), TrialsRequestHandler)
    
    print("=" * 72)
    print(" 🎣 FLY FISHING TRIALS APP & RANDOMISER IS LIVE!")
    print("=" * 72)
    print(f" ▶ Local Web Access:    {local_url}")
    print(f" ▶ Mobile / Wi-Fi URL:  {network_url}")
    print("=" * 72)
    print(" Features Active:")
    print("   • Randomiser (8 to 20 anglers; even=1v1, odd=1v1v1 + 1v1s)")
    print("   • 1v1v1 Rotation (every angler participates in odd field <=11)")
    print("   • Unique opponents each session (no pair meets twice)")
    print("   • 10-Point Proportional Scoring (blank = 0.00 pts)")
    print("   • Dual-Submission Verification (Google Forms style)")
    print("   • Discrepancy Alert & Admin Intervention System")
    print("   • Session & Tournament Save / Snapshot / Export / Import")
    print("   • Instant PDF Download of Schedule & Scores")
    print("=" * 72)
    print(" Press Ctrl+C in terminal to stop server.\n")

    if open_browser:
        webbrowser.open(local_url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Fly Fishing Trials server...")
        server.server_close()

if __name__ == "__main__":
    port_to_use = PORT
    no_browse = "--no-browser" in sys.argv
    for arg in sys.argv[1:]:
        if arg.isdigit():
            port_to_use = int(arg)
            break
    run_server(port_to_use, open_browser=not no_browse)
