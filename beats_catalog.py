"""
CPS Beats Catalog - Cape Piscatorial Society Du Toitskloof
==========================================================
Master catalog of beats along Smalblaar and Elandspad.
Includes GPS coordinates for Lower Pin (start), Upper Pin (end), and Mid Pin (second half / meeting point).
"""

from typing import Dict, List, Any

CPS_BEATS_DATA: List[Dict[str, Any]] = [
    {
        "id": "SB6",
        "code": "SB6",
        "name": "Smalblaar 6 (SB6)",
        "river": "Small Blaar",
        "enabled": True,
        "usage_mode": "double",
        "lower_pin": [-33.7319, 19.1141],   # Confluence / Junction Pool
        "upper_pin": [-33.7342, 19.1065],   # Tunnel Viaduct / Weir
        "mid_pin": [-33.7330, 19.1105],     # Midpoint / Second half
        "meeting_point": "Tunnel East Portal Parking / Junction Path",
        "notes": "Upper Smalblaar beat from Junction pool up to tunnel weir."
    },
    {
        "id": "EP1",
        "code": "EP1",
        "name": "Elandspad 1 (EP1)",
        "river": "Elands Pad",
        "enabled": True,
        "usage_mode": "double",
        "lower_pin": [-33.7319, 19.1141],   # Junction Pool
        "upper_pin": [-33.7405, 19.1162],   # Fisherman's Cave
        "mid_pin": [-33.7360, 19.1152],     # River bend / 2nd half
        "meeting_point": "Junction Pool trail head",
        "notes": "Kloof canyon stream, crystal clear water with pocket pools."
    },
    {
        "id": "EP2",
        "code": "EP2",
        "name": "Elandspad 2 (EP2)",
        "river": "Elands Pad",
        "enabled": True,
        "usage_mode": "double",
        "lower_pin": [-33.7405, 19.1162],   # Fisherman's Cave
        "upper_pin": [-33.7520, 19.1188],   # Pine Trees / Upper Gorge
        "mid_pin": [-33.7460, 19.1172],     # Pine tree clearing
        "meeting_point": "Fisherman's Cave trail",
        "notes": "Middle Elandspad through pristine mountain gorge."
    },
    {
        "id": "Star",
        "code": "Star",
        "name": "Star Beat",
        "river": "Elands Pad",
        "enabled": True,
        "usage_mode": "single",
        "lower_pin": [-33.7520, 19.1188],   # Pine Trees / Upper Gorge
        "upper_pin": [-33.7610, 19.1205],   # Kraalstroom Confluence
        "mid_pin": [-33.7565, 19.1195],     # High cascades
        "meeting_point": "Star beat rock shelter",
        "notes": "Wild upper gorge with deep plunge pools. Sensitive upper beat."
    },
    {
        "id": "SB5",
        "code": "SB5",
        "name": "Smalblaar 5 (SB5)",
        "river": "Small Blaar",
        "enabled": True,
        "usage_mode": "double",
        "lower_pin": [-33.7295, 19.1320],   # Elandspad Bridge & CPS Parking
        "upper_pin": [-33.7319, 19.1141],   # Junction Pool
        "mid_pin": [-33.7305, 19.1270],     # Bridge pools
        "meeting_point": "CPS Elandspad parking lot",
        "notes": "Directly accessible from official CPS parking."
    },
    {
        "id": "SB4",
        "code": "SB4",
        "name": "Smalblaar 4 (SB4)",
        "river": "Small Blaar",
        "enabled": True,
        "usage_mode": "double",
        "lower_pin": [-33.7272, 19.1415],   # Python pool
        "upper_pin": [-33.7295, 19.1320],   # Elandspad bridge
        "mid_pin": [-33.7285, 19.1370],     # Donkergat
        "meeting_point": "Donkergat pull-off",
        "notes": "Varied water with boulder gardens."
    },
    {
        "id": "SB3",
        "code": "SB3",
        "name": "Smalblaar 3 (SB3)",
        "river": "Small Blaar",
        "enabled": True,
        "usage_mode": "double",
        "lower_pin": [-33.7235, 19.1530],   # Boundary fence
        "upper_pin": [-33.7272, 19.1415],   # Python pool
        "mid_pin": [-33.7258, 19.1470],     # Mid channel
        "meeting_point": "N1 emergency telephone layby 3",
        "notes": "Challenging technical water with overhanging vegetation."
    },
    {
        "id": "SB2",
        "code": "SB2",
        "name": "Smalblaar 2 (SB2)",
        "river": "Small Blaar",
        "enabled": True,
        "usage_mode": "double",
        "lower_pin": [-33.7190, 19.1655],   # Picnic site
        "upper_pin": [-33.7235, 19.1530],   # Boundary fence
        "mid_pin": [-33.7212, 19.1590],     # Granite run
        "meeting_point": "Picnic site parking",
        "notes": "Fast broken water and deep corner pools."
    },
    {
        "id": "SB1",
        "code": "SB1",
        "name": "Smalblaar 1 (SB1)",
        "river": "Small Blaar",
        "enabled": True,
        "usage_mode": "double",
        "lower_pin": [-33.7150, 19.1740],   # Hotel boundary fence
        "upper_pin": [-33.7190, 19.1655],   # Picnic site
        "mid_pin": [-33.7170, 19.1700],     # Willow pool
        "meeting_point": "Picnic site pull-off",
        "notes": "Productive long glides and pocket water."
    },
    {
        "id": "Hotel Beat",
        "code": "Hotel Beat",
        "name": "Smalblaar Hotel Beat",
        "river": "Small Blaar",
        "enabled": True,
        "usage_mode": "single",
        "lower_pin": [-33.7125, 19.1800],   # Lower weir
        "upper_pin": [-33.7150, 19.1740],   # Hotel upper boundary
        "mid_pin": [-33.7138, 19.1770],     # Lodge terrace pool
        "meeting_point": "Du Kloof Lodge guest parking",
        "notes": "Historic beat opposite the old hotel. Single session limit per day."
    },
    {
        "id": "Transport Upper",
        "code": "Transport Upper",
        "name": "Transport Upper",
        "river": "Small Blaar",
        "enabled": True,
        "usage_mode": "double",
        "lower_pin": [-33.7085, 19.1895],   # Transport bridge
        "upper_pin": [-33.7125, 19.1800],   # Lower weir
        "mid_pin": [-33.7105, 19.1845],     # Island run
        "meeting_point": "Transport bridge parking",
        "notes": "Upper section of Molenaars Transport reserve."
    },
    {
        "id": "Transport Lower",
        "code": "Transport Lower",
        "name": "Transport Lower",
        "river": "Small Blaar",
        "enabled": True,
        "usage_mode": "double",
        "lower_pin": [-33.7040, 19.2000],   # Farm Boundary
        "upper_pin": [-33.7085, 19.1895],   # Transport Bridge
        "mid_pin": [-33.7065, 19.1945],     # Klip river confluence
        "meeting_point": "Farm gate boundary on N1",
        "notes": "Lower pastoral reach of the Molenaars."
    },
    {
        "id": "Transport",
        "code": "Transport",
        "name": "Transport Beat",
        "river": "Small Blaar",
        "enabled": True,
        "usage_mode": "double",
        "lower_pin": [-33.7040, 19.2000],   # Farm Boundary
        "upper_pin": [-33.7085, 19.1895],   # Transport Bridge
        "mid_pin": [-33.7065, 19.1945],     # Mid rapids
        "meeting_point": "Transport Bridge layby on N1",
        "notes": "Classic riffles and runs below Du Kloof Lodge."
    }
]

# River vectors for artistic map rendering following natural riverbed curves
RIVER_PATHS = {
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
}

TRAIL_PATHS = {
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
}

def get_default_beats() -> List[Dict[str, Any]]:
    import copy
    return copy.deepcopy(CPS_BEATS_DATA)
