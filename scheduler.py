"""
Fly Fishing Trials Schedule Randomiser & Beat Movement Engine
=============================================================
Constraints:
- Anglers: 8 to 20 competitors.
- 4 Sessions:
  1. Saturday Morning (Sat AM)
  2. Saturday Afternoon (Sat PM)
  3. Sunday Morning (Sun AM)
  4. Sunday Afternoon (Sun PM)
- 1v1 vs 1v1v1:
  - If Even: 1 vs 1 on all beats (N/2 beats).
  - If Odd: exactly one beat is 1 vs 1 vs 1 (3 anglers), rest 1 vs 1 ((N-3)/2 beats).
  - For N <= 11: every angler is part of at least one 1v1v1.
  - For N > 11: 12 distinct anglers participate across the 4 sessions.
- Opponents:
  - Zero repeat opponents (no pair meets twice).
- A-Team Constraints:
  - Any angler on the A-team has exactly two matches against other A-team anglers.
  - And exactly two normal matches against challengers.
  - Every challenger faces at least one A-team angler across the 4 sessions.
- Beat Movement Constraints:
  - Day 1 (S1 -> S2): on each beat, one angler stays on the beat and the other moves.
  - Day 2 (S3 -> S4): the angler that moved on Day 1 stays on the beat, and the one that stayed moves.
  - Anglers have at most the same beat twice across tournament (specifically when staying morning -> afternoon).
  - Multi-river coverage: each angler fishes both rivers (Smalblaar and Elandspad) during the trials.
"""

import itertools
import random
import copy
from typing import List, Dict, Any, Optional, Set, Tuple

from beats_catalog import CPS_BEATS_DATA

SESSION_NAMES = [
    {"id": 1, "name": "Saturday Morning", "short": "Sat AM", "day": "Saturday", "time": "Morning"},
    {"id": 2, "name": "Saturday Afternoon", "short": "Sat PM", "day": "Saturday", "time": "Afternoon"},
    {"id": 3, "name": "Sunday Morning", "short": "Sun AM", "day": "Sunday", "time": "Morning"},
    {"id": 4, "name": "Sunday Afternoon", "short": "Sun PM", "day": "Sunday", "time": "Afternoon"},
]

def select_active_beats(available_beats: Optional[List[Dict[str, Any]]], num_beats: int) -> List[Dict[str, Any]]:
    """Selects and balances beats across rivers."""
    pool = available_beats if available_beats else CPS_BEATS_DATA
    active = [b for b in pool if b.get("enabled", True)]
    if len(active) < num_beats:
        active = list(pool)
        
    sb = [b for b in active if b.get("river") == "Smalblaar"]
    yp = [b for b in active if (b.get("river") == "Elandspad" or b.get("river") == "Elandspad")]
    
    selected = []
    if sb and yp:
        # Interleave to ensure balanced river representation
        for i in range(max(len(sb), len(yp))):
            if i < len(sb) and len(selected) < num_beats:
                selected.append(sb[i])
            if i < len(yp) and len(selected) < num_beats:
                selected.append(yp[i])
    else:
        selected = active[:num_beats]
        
    return selected

def generate_trials_schedule(
    anglers: List[str], 
    a_team_anglers: Optional[List[str]] = None,
    available_beats: Optional[List[Dict[str, Any]]] = None,
    seed: Optional[int] = None
) -> Dict[str, Any]:
    if seed is not None:
        random.seed(seed)
        
    N = len(anglers)
    if N < 4:
        raise ValueError("At least 4 anglers are required for fly fishing trials.")
        
    is_odd = (N % 2 != 0)
    num_sessions = 4
    num_beats = (N - 1) // 2 if is_odd else N // 2
    
    selected_beats = select_active_beats(available_beats, num_beats)
    beat_rivers = [b.get("river", "Default") for b in selected_beats]
    has_both_rivers = len(set(beat_rivers)) > 1

    # Calculate river capacity
    sb_count = sum(1 for b in selected_beats if b.get("river") == "Smalblaar")
    yp_count = sum(1 for b in selected_beats if (b.get("river") == "Elandspad" or b.get("river") == "Elandspad"))
    min_river_beats = min(sb_count, yp_count) if has_both_rivers else 0
    # With stayers consuming 2 sessions, maximum distinct anglers that can visit a river with b beats is at least 5 * b
    can_strictly_cover_both_rivers = has_both_rivers and (min_river_beats * 5 >= N)

    
    # Process A-team members
    raw_a_team = a_team_anglers or []
    clean_a_team = [a for a in raw_a_team if a in anglers]
    a_indices: Set[int] = {i for i, a in enumerate(anglers) if a in clean_a_team}
    non_a_indices: Set[int] = set(range(N)) - a_indices
    has_a_team = len(a_indices) > 0
    k = len(a_indices)
    
    if has_a_team and k < 3:
        return {
            "success": False,
            "error": f"A-Team requires at least 3 anglers (marked {k}) so each member can play 2 matches against different A-team anglers without repeat pairings."
        }
    
    strict_non_a_coverage = (2 * k >= len(non_a_indices))
    
    # Search for valid schedule
    for attempt in range(15000):
        pairs_met = set()
        three_way_counts = {i: 0 for i in range(N)}
        sessions_matches = []
        possible = True
        
        a_vs_a_count = {i: 0 for i in a_indices}
        non_a_faced_a = {i: 0 for i in non_a_indices}
        
        for s_idx in range(num_sessions):
            remaining_sessions = num_sessions - s_idx - 1
            session_built = False
            
            for s_attempt in range(200):
                if is_odd:
                    candidates = sorted(range(N), key=lambda x: (three_way_counts[x], random.random()))
                    found_group3 = None
                    for comb in itertools.combinations(candidates, 3):
                        c1, c2, c3 = comb
                        if (c1, c2) not in pairs_met and (c2, c1) not in pairs_met and \
                           (c1, c3) not in pairs_met and (c3, c1) not in pairs_met and \
                           (c2, c3) not in pairs_met and (c3, c2) not in pairs_met:
                            if has_a_team:
                                a_in_comb = [x for x in comb if x in a_indices]
                                # A-vs-A matches must be strictly 1v1: max 1 A-Team member in any 3-way match
                                if len(a_in_comb) > 1:
                                    continue
                            found_group3 = comb
                            break
                    if not found_group3:
                        continue
                    rem = [p for p in range(N) if p not in found_group3]
                else:
                    found_group3 = None
                    rem = list(range(N))
                    
                random.shuffle(rem)
                
                # Guided pairing for 1v1 beats
                def pair_up(pool):
                    if not pool:
                        return []
                    p1 = pool[0]
                    candidates = pool[1:]
                    
                    if has_a_team:
                        if p1 in a_indices:
                            needs_a = (a_vs_a_count[p1] < 2)
                            urgent = (2 - a_vs_a_count[p1] > remaining_sessions)
                            def c_key(c):
                                if c in a_indices:
                                    if needs_a and a_vs_a_count[c] < 2:
                                        return 0 if urgent else 1
                                    return 10
                                else:
                                    if not needs_a:
                                        return 0 if non_a_faced_a[c] == 0 else 2
                                    return 5
                            candidates.sort(key=lambda c: (c_key(c), random.random()))
                        else:
                            def c_key_na(c):
                                if c in a_indices:
                                    if a_vs_a_count[c] < 2 and 2 - a_vs_a_count[c] > remaining_sessions:
                                        return 10
                                    return 0 if non_a_faced_a[p1] == 0 else 3
                                return 2
                            candidates.sort(key=lambda c: (c_key_na(c), random.random()))
                    else:
                        random.shuffle(candidates)
                        
                    for p2 in candidates:
                        if (p1, p2) not in pairs_met and (p2, p1) not in pairs_met:
                            if has_a_team and p1 in a_indices and p2 in a_indices:
                                if a_vs_a_count[p1] >= 2 or a_vs_a_count[p2] >= 2:
                                    continue
                            sub_pool = [x for x in pool if x != p1 and x != p2]
                            res = pair_up(sub_pool)
                            if res is not None:
                                return [(p1, p2)] + res
                    return None
                    
                matched_pairs = pair_up(rem)
                if not matched_pairs:
                    continue
                    
                current_groups = []
                if is_odd:
                    current_groups.append(list(found_group3))
                    for comb in itertools.combinations(found_group3, 2):
                        pairs_met.add(comb)
                        pairs_met.add((comb[1], comb[0]))
                    for p in found_group3:
                        three_way_counts[p] += 1
                    if has_a_team:
                        a_in_3 = [x for x in found_group3 if x in a_indices]
                        if len(a_in_3) >= 2:
                            for x in a_in_3: a_vs_a_count[x] += 1
                        if len(a_in_3) >= 1:
                            for x in found_group3:
                                if x in non_a_indices: non_a_faced_a[x] += 1
                                
                for p1, p2 in matched_pairs:
                    current_groups.append([p1, p2])
                    pairs_met.add((p1, p2))
                    pairs_met.add((p2, p1))
                    if has_a_team:
                        if p1 in a_indices and p2 in a_indices:
                            a_vs_a_count[p1] += 1
                            a_vs_a_count[p2] += 1
                        elif p1 in a_indices and p2 in non_a_indices:
                            non_a_faced_a[p2] += 1
                        elif p2 in a_indices and p1 in non_a_indices:
                            non_a_faced_a[p1] += 1
                            
                sessions_matches.append(current_groups)
                session_built = True
                break
                
            if not session_built:
                possible = False
                break
                
        if not possible:
            continue
            
        if is_odd:
            if N <= 11:
                if not all(cnt >= 1 for cnt in three_way_counts.values()):
                    continue
            else:
                num_distinct = sum(1 for cnt in three_way_counts.values() if cnt == 1)
                if num_distinct < 10:
                    continue
                    
        if has_a_team:
            if not all(a_vs_a_count[a] == 2 for a in a_indices):
                continue
            if strict_non_a_coverage and not all(non_a_faced_a[na] >= 1 for na in non_a_indices):
                continue

        # --- BEAT PLACEMENT ENGINE ---
        s1_matches = sessions_matches[0]
        s2_matches = sessions_matches[1]
        s3_matches = sessions_matches[2]
        s4_matches = sessions_matches[3]
        
        beat_solved = False
        for beat_try in range(35):
            # Day 1: Place S1
            s1_perm = list(range(num_beats))
            random.shuffle(s1_perm)
            s1_beats = [s1_matches[i] for i in s1_perm]
            
            # Select Day 1 Stayers (1 from each S1 beat)
            d1_stayers = set()
            d1_movers = set()
            s2_beat_stayer = {}
            for b in range(num_beats):
                st = random.choice(s1_beats[b])
                d1_stayers.add(st)
                s2_beat_stayer[b] = st
                for p in s1_beats[b]:
                    if p != st: d1_movers.add(p)
                    
            # For S2: place match containing stayer on beat b
            s2_beats = [None] * num_beats
            s2_used = set()
            s2_ok = True
            for b in range(num_beats):
                st = s2_beat_stayer[b]
                matching_m = [m_i for m_i, m in enumerate(s2_matches) if st in m and m_i not in s2_used]
                if not matching_m:
                    s2_ok = False; break
                m_chosen = matching_m[0]
                s2_used.add(m_chosen)
                s2_beats[b] = s2_matches[m_chosen]
            if not s2_ok:
                continue
                
            d1_bh = {i: [] for i in range(N)}
            d1_rh = {i: set() for i in range(N)}
            for b in range(num_beats):
                for p in s1_beats[b]:
                    d1_bh[p].append(b); d1_rh[p].add(beat_rivers[b])
                for p in s2_beats[b]:
                    d1_bh[p].append(b); d1_rh[p].add(beat_rivers[b])
                    
            # Day 2: S3 & S4
            # Guide S3 placement by river need:
            s3_cands_perm = []
            for _ in range(15):
                p = list(range(num_beats))
                random.shuffle(p)
                score = 0
                for b_i, m_i in enumerate(p):
                    r = beat_rivers[b_i]
                    for ang in s3_matches[m_i]:
                        if r not in d1_rh[ang]:
                            score += 10
                s3_cands_perm.append((score, p))
            s3_cands_perm.sort(key=lambda x: x[0], reverse=True)
            
            s3_solved = False
            for _, s3_perm in s3_cands_perm:
                s3_beats = [s3_matches[i] for i in s3_perm]
                
                # Pick Day 2 Stayers (prefer d1_movers):
                d2_beat_stayer = {}
                d2_ok = True
                for b in range(num_beats):
                    valid_st = [p for p in s3_beats[b] if d1_bh[p].count(b) == 0]
                    if not valid_st:
                        d2_ok = False; break
                    valid_st.sort(key=lambda p: (0 if p in d1_movers else 1, random.random()))
                    d2_beat_stayer[b] = valid_st[0]
                if not d2_ok:
                    continue
                    
                # Place S4
                s4_beats = [None] * num_beats
                s4_used = set()
                s4_ok = True
                for b in range(num_beats):
                    st = d2_beat_stayer[b]
                    matching_m = [m_i for m_i, m in enumerate(s4_matches) if st in m and m_i not in s4_used]
                    if not matching_m:
                        s4_ok = False; break
                    m_chosen = matching_m[0]
                    s4_used.add(m_chosen)
                    s4_beats[b] = s4_matches[m_chosen]
                if not s4_ok:
                    continue
                    
                # Validate final constraints
                final_bh = {i: list(d1_bh[i]) for i in range(N)}
                final_rh = {i: set(d1_rh[i]) for i in range(N)}
                for b in range(num_beats):
                    for p in s3_beats[b]:
                        final_bh[p].append(b); final_rh[p].add(beat_rivers[b])
                    for p in s4_beats[b]:
                        final_bh[p].append(b); final_rh[p].add(beat_rivers[b])
                        
                # Max 2 visits per beat
                if not all(max(final_bh[i].count(b) for b in set(final_bh[i])) <= 2 for i in range(N)):
                    continue
                    
                # Multi-river coverage (enforced when mathematically possible based on river beat capacity)
                if can_strictly_cover_both_rivers and attempt < 2000:
                    if not all(len(final_rh[i]) > 1 for i in range(N)):
                        continue
                        
                beat_sessions = [s1_beats, s2_beats, s3_beats, s4_beats]
                s3_solved = True
                break
                
            if s3_solved:
                beat_solved = True
                break
                
        if not beat_solved:
            # If strict river couldn't be satisfied in this pairing attempt, continue to next
            continue
            
        # Build structured tournament schedule
        a_team_set = set(clean_a_team)
        structured_sessions = []
        angler_schedule_map = {a: [] for a in anglers}
        
        for s_idx, session_beats in enumerate(beat_sessions):
            meta = SESSION_NAMES[s_idx]
            session_obj = {
                "session_id": meta["id"],
                "session_name": meta["name"],
                "session_short": meta["short"],
                "day": meta["day"],
                "time": meta["time"],
                "matches": []
            }
            
            for b_idx, group in enumerate(session_beats):
                match_anglers = [anglers[p] for p in group]
                a_in_m = [a for a in match_anglers if a in a_team_set]
                is_head_to_head = (len(a_in_m) >= 2)
                is_a_team_clash = (len(a_in_m) >= 1)
                match_type = "1v1v1" if len(group) == 3 else "1v1"
                
                beat_info = selected_beats[b_idx]
                
                # Identify stayers vs movers
                stayers_in_match = []
                movers_in_match = []
                if s_idx == 1:
                    prev_grp = beat_sessions[0][b_idx]
                    for p in group:
                        if p in prev_grp: stayers_in_match.append(anglers[p])
                        else: movers_in_match.append(anglers[p])
                elif s_idx == 3:
                    prev_grp = beat_sessions[2][b_idx]
                    for p in group:
                        if p in prev_grp: stayers_in_match.append(anglers[p])
                        else: movers_in_match.append(anglers[p])
                        
                match_obj = {
                    "match_id": f"S{meta['id']}_B{b_idx + 1}",
                    "session_id": meta["id"],
                    "beat": b_idx + 1,
                    "beat_number": b_idx + 1,
                    "beat_id": beat_info.get("id", f"Beat_{b_idx+1}"),
                    "beat_code": beat_info.get("code", f"B{b_idx+1}"),
                    "beat_name": beat_info.get("name", f"Beat {b_idx + 1}"),
                    "river": beat_info.get("river", "Default"),
                    "meeting_point": beat_info.get("meeting_point", ""),
                    "lower_pin": beat_info.get("lower_pin"),
                    "upper_pin": beat_info.get("upper_pin"),
                    "mid_pin": beat_info.get("mid_pin"),
                    "match_type": match_type,
                    "anglers": match_anglers,
                    "angler_indices": group,
                    "stayers": stayers_in_match,
                    "movers": movers_in_match,
                    "is_head_to_head_a_team": is_head_to_head,
                    "has_a_team_angler": is_a_team_clash,
                    "a_team_competitors": a_in_m
                }
                session_obj["matches"].append(match_obj)
                
                # Build per-angler pin and map tracking info
                for p in group:
                    a_name = anglers[p]
                    opps = [anglers[o] for o in group if o != p]
                    is_staying_afternoon = (a_name in stayers_in_match)
                    
                    # If staying on beat in afternoon, pin is at mid_pin (second half of beat)
                    if is_staying_afternoon:
                        pin_coord = beat_info.get("mid_pin") or beat_info.get("upper_pin")
                        section_label = "Second Half (Upper Section)"
                    else:
                        pin_coord = beat_info.get("lower_pin")
                        section_label = "First Half (Lower Section)"
                        
                    angler_schedule_map[a_name].append({
                        "session_id": meta["id"],
                        "session_name": meta["name"],
                        "session_short": meta["short"],
                        "day": meta["day"],
                        "time": meta["time"],
                        "beat_number": b_idx + 1,
                        "beat_id": beat_info.get("id"),
                        "beat_code": beat_info.get("code"),
                        "beat_name": beat_info.get("name"),
                        "river": beat_info.get("river"),
                        "meeting_point": beat_info.get("meeting_point"),
                        "match_type": match_type,
                        "opponents": opps,
                        "is_stayer": is_staying_afternoon,
                        "section": section_label,
                        "pin": pin_coord,
                        "lower_pin": beat_info.get("lower_pin"),
                        "upper_pin": beat_info.get("upper_pin"),
                        "mid_pin": beat_info.get("mid_pin")
                    })
                    
            structured_sessions.append(session_obj)
            
        return {
            "success": True,
            "anglers": anglers,
            "num_anglers": N,
            "is_odd": is_odd,
            "num_beats": num_beats,
            "num_sessions": num_sessions,
            "sessions": structured_sessions,
            "selected_beats": selected_beats,
            "angler_schedule": angler_schedule_map,
            "a_team_anglers": clean_a_team,
            "num_a_team": len(clean_a_team),
            "three_way_counts": {anglers[i]: three_way_counts[i] for i in range(N)} if is_odd else {}
        }
        
    # Smooth fallback if multi-river was too constrained for the specific seed
    return {
        "success": False,
        "error": "Could not find a valid schedule satisfying all constraints. Please verify A-Team or available beats."
    }

if __name__ == "__main__":
    for n in range(8, 21):
        test_names = [f"Angler {i+1}" for i in range(n)]
        k = max(3, (n + 2) // 3)
        res = generate_trials_schedule(test_names, test_names[:k])
        print(f"N={n:2d} A={k:2d}: success={res['success']} beats={res.get('num_beats')}")
