"""
Fly Fishing Trials Scoring Engine
=================================
Rules:
- Scoring is 10 points divided by total fish caught in the match times fish caught by each person.
- If an angler catches 0 fish (a blank), their score is 0.0 points.
- If all anglers on a beat blank (total fish == 0), all receive 0.0 points.
- Each person's tournament total is the sum of points across all sessions.
- Tie-breakers:
  1. Total Points (descending)
  2. Total Fish Caught (descending)
  3. Fewest Blanks (ascending)
"""

from typing import Dict, List, Any, Optional

def calculate_match_points(fish_counts: Dict[str, int], match_type: Optional[str] = None) -> Dict[str, float]:
    """
    Computes points for each angler in a match given a dict: {angler_name: fish_count}.
    Rules:
      1v1 match:
        - Pool = 10.0 points
        - Points = (10.0 / Total) * fish_count
        - Blank (0 fish) = 0.00 points
      3-way (1v1v1) match:
        - Pool = 15.0 points (fair representation for 3 competitors)
        - Raw Points = (15.0 / Total) * fish_count
        - Cap: Maximum an angler can score is 10.0 points (points = min(10.0, raw_points))
        - Blank (0 fish) = 0.00 points
      If all anglers blank (Total == 0): all receive 0.00 points.
    """
    total_fish = sum(fish_counts.values())
    if total_fish == 0:
        return {angler: 0.0 for angler in fish_counts}

    is_three_way = (match_type == "1v1v1" or len(fish_counts) == 3)
    pool = 15.0 if is_three_way else 10.0
    max_score = 10.0

    points = {}
    for angler, count in fish_counts.items():
        if count <= 0:
            points[angler] = 0.0
        else:
            raw_pts = (pool / total_fish) * count
            # Capped at 10.0 points max
            capped_pts = min(max_score, round(raw_pts, 2))
            points[angler] = round(capped_pts, 2)

    return points

def compute_leaderboard(
    anglers: List[str], 
    sessions: List[Dict[str, Any]], 
    a_team_anglers: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Calculates the live tournament leaderboard across all sessions.
    """
    a_team_set = set(a_team_anglers or [])
    stats = {
        angler: {
            "name": angler,
            "is_a_team": angler in a_team_set,
            "session_points": {1: 0.0, 2: 0.0, 3: 0.0, 4: 0.0},
            "session_fish": {1: 0, 2: 0, 3: 0, 4: 0},
            "session_blanks": {1: False, 2: False, 3: False, 4: False},
            "total_points": 0.0,
            "total_fish": 0,
            "blanks_count": 0,
            "matches_played": 0
        }
        for angler in anglers
    }
    
    for session in sessions:
        s_id = session["session_id"]
        for match in session.get("matches", []):
            # Only count if the match has been verified/confirmed
            if match.get("status") in ["CONFIRMED", "ADMIN_CONFIRMED"] and "official_scores" in match:
                scores = match["official_scores"]
                points = match.get("calculated_points", {})
                
                for angler, fish_count in scores.items():
                    if angler in stats:
                        pts = points.get(angler, 0.0)
                        stats[angler]["session_points"][s_id] = pts
                        stats[angler]["session_fish"][s_id] = fish_count
                        is_blank = (fish_count == 0)
                        stats[angler]["session_blanks"][s_id] = is_blank
                        if is_blank:
                            stats[angler]["blanks_count"] += 1
                        stats[angler]["total_fish"] += fish_count
                        stats[angler]["total_points"] = round(stats[angler]["total_points"] + pts, 2)
                        stats[angler]["matches_played"] += 1

    leaderboard = list(stats.values())
    
    # Sort leaderboard: Total Points DESC, Total Fish DESC, Blanks Count ASC, Name ASC
    leaderboard.sort(key=lambda x: (
        -round(x["total_points"], 2),
        -x["total_fish"],
        x["blanks_count"],
        x["name"]
    ))
    
    # Assign ranks (with tie display)
    for idx, entry in enumerate(leaderboard):
        entry["rank"] = idx + 1
        entry["total_points"] = round(entry["total_points"], 2)
        
    return leaderboard

if __name__ == "__main__":
    test_1v1 = {"Alice": 3, "Bob": 1}
    print("1v1 (3 vs 1):", calculate_match_points(test_1v1))
    
    test_blank = {"Alice": 0, "Bob": 2}
    print("1v1 (0 vs 2):", calculate_match_points(test_blank))
    
    test_both_blank = {"Alice": 0, "Bob": 0}
    print("1v1 (0 vs 0):", calculate_match_points(test_both_blank))
    
    test_3way = {"Alice": 4, "Bob": 3, "Charlie": 3}
    print("3-way (4 vs 3 vs 3):", calculate_match_points(test_3way))
    
    test_3way_blank = {"Alice": 3, "Bob": 1, "Charlie": 0}
    print("3-way (3 vs 1 vs 0):", calculate_match_points(test_3way_blank))
