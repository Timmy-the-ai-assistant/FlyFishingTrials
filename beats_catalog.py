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
        "river": "Smalblaar",
        "enabled": True,
        "lower_pin": [-33.7319, 19.1141],   # Confluence / Junction Pool
        "upper_pin": [-33.7340, 19.1225],   # Tunnel Viaduct / Weir
        "mid_pin": [-33.7330, 19.1180],     # Midpoint / Second half
        "meeting_point": "Tunnel East Portal Parking / Junction Path",
        "notes": "Upper Smalblaar beat from Junction pool up to tunnel weir."
    },
    {
        "id": "EP1",
        "code": "EP1",
        "name": "Elandspad 1 (EP1)",
        "river": "Elandspad",
        "enabled": True,
        "lower_pin": [-33.7319, 19.1141],   # Junction Pool
        "upper_pin": [-33.7385, 19.1118],   # Fisherman's Cave
        "mid_pin": [-33.7352, 19.1129],     # River bend / 2nd half
        "meeting_point": "Junction Pool trail head",
        "notes": "Kloof canyon stream, crystal clear water with pocket pools."
    },
    {
        "id": "EP2",
        "code": "EP2",
        "name": "Elandspad 2 (EP2)",
        "river": "Elandspad",
        "enabled": True,
        "lower_pin": [-33.7385, 19.1118],   # Fisherman's Cave
        "upper_pin": [-33.7455, 19.1092],   # Narrow Gorge
        "mid_pin": [-33.7420, 19.1105],     # Pine tree clearing
        "meeting_point": "Fisherman's Cave trail",
        "notes": "Middle Elandspad through pristine mountain gorge."
    },
    {
        "id": "Star",
        "code": "Star",
        "name": "Star Beat",
        "river": "Elandspad",
        "enabled": True,
        "lower_pin": [-33.7455, 19.1092],   # Narrow Gorge
        "upper_pin": [-33.7530, 19.1065],   # Kraalstroom Confluence
        "mid_pin": [-33.7492, 19.1078],     # High cascades
        "meeting_point": "Star beat rock shelter",
        "notes": "Wild upper gorge with deep plunge pools."
    },
    {
        "id": "Transport",
        "code": "Transport",
        "name": "Transport Beat",
        "river": "Smalblaar",
        "enabled": True,
        "lower_pin": [-33.7085, 19.1895],   # Farm Boundary
        "upper_pin": [-33.7120, 19.1825],   # Transport Bridge
        "mid_pin": [-33.7100, 19.1860],     # Mid rapids
        "meeting_point": "Transport Bridge layby on N1",
        "notes": "Classic riffles and runs below Du Kloof Lodge."
    },
    {
        "id": "SB1",
        "code": "SB1",
        "name": "Smalblaar 1 (SB1)",
        "river": "Smalblaar",
        "enabled": True,
        "lower_pin": [-33.7200, 19.1670],   # Hotel boundary fence
        "upper_pin": [-33.7230, 19.1585],   # Picnic site
        "mid_pin": [-33.7215, 19.1630],     # Willow pool
        "meeting_point": "Picnic site pull-off",
        "notes": "Productive long glides and pocket water."
    },
    {
        "id": "SB2",
        "code": "SB2",
        "name": "Smalblaar 2 (SB2)",
        "river": "Smalblaar",
        "enabled": True,
        "lower_pin": [-33.7230, 19.1585],   # Picnic site
        "upper_pin": [-33.7260, 19.1495],   # Boundary fence
        "mid_pin": [-33.7245, 19.1540],     # Granite run
        "meeting_point": "Picnic site parking",
        "notes": "Fast broken water and deep corner pools."
    },
    {
        "id": "SB3",
        "code": "SB3",
        "name": "Smalblaar 3 (SB3)",
        "river": "Smalblaar",
        "enabled": True,
        "lower_pin": [-33.7260, 19.1495],   # Boundary fence
        "upper_pin": [-33.7290, 19.1405],   # Python pool
        "mid_pin": [-33.7275, 19.1450],     # Mid channel
        "meeting_point": "N1 emergency telephone layby 3",
        "notes": "Challenging technical water with overhanging vegetation."
    },
    {
        "id": "SB4",
        "code": "SB4",
        "name": "Smalblaar 4 (SB4)",
        "river": "Smalblaar",
        "enabled": True,
        "lower_pin": [-33.7290, 19.1405],   # Python pool
        "upper_pin": [-33.7320, 19.1310],   # Elandspad bridge
        "mid_pin": [-33.7305, 19.1360],     # Donkergat
        "meeting_point": "Donkergat pull-off",
        "notes": "Varied water with boulder gardens."
    },
    {
        "id": "SB5",
        "code": "SB5",
        "name": "Smalblaar 5 (SB5)",
        "river": "Smalblaar",
        "enabled": True,
        "lower_pin": [-33.7320, 19.1310],   # Elandspad bridge
        "upper_pin": [-33.7340, 19.1225],   # Viaduct weir
        "mid_pin": [-33.7330, 19.1270],     # Bridge pools
        "meeting_point": "CPS Elandspad parking lot",
        "notes": "Directly accessible from official CPS parking."
    },
    {
        "id": "Hotel Beat",
        "code": "Hotel Beat",
        "name": "Smalblaar Hotel Beat",
        "river": "Smalblaar",
        "enabled": True,
        "lower_pin": [-33.7160, 19.1750],   # Lower weir
        "upper_pin": [-33.7200, 19.1670],   # Hotel upper boundary
        "mid_pin": [-33.7180, 19.1710],     # Lodge terrace pool
        "meeting_point": "Du Kloof Lodge guest parking",
        "notes": "Historic beat opposite the old hotel."
    },
    {
        "id": "Transport Upper",
        "code": "Transport Upper",
        "name": "Transport Upper",
        "river": "Smalblaar",
        "enabled": True,
        "lower_pin": [-33.7120, 19.1825],   # Transport bridge
        "upper_pin": [-33.7160, 19.1750],   # Lower weir
        "mid_pin": [-33.7140, 19.1790],     # Island run
        "meeting_point": "Transport bridge parking",
        "notes": "Upper section of Molenaars Transport reserve."
    },
    {
        "id": "Transport Lower",
        "code": "Transport Lower",
        "name": "Transport Lower",
        "river": "Smalblaar",
        "enabled": True,
        "lower_pin": [-33.7050, 19.1960],   # Lower reserve line
        "upper_pin": [-33.7085, 19.1895],   # Farm fence
        "mid_pin": [-33.7065, 19.1930],     # S-bend pool
        "meeting_point": "Lower Farm gate layby",
        "notes": "Lower boundary beat with broad runs."
    }
]

# River vectors for artistic map rendering
RIVER_PATHS = {
    "Smalblaar": [
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
    "Elandspad": [
        [-33.7319, 19.1141],
        [-33.7352, 19.1129],
        [-33.7385, 19.1118],
        [-33.7420, 19.1105],
        [-33.7455, 19.1092],
        [-33.7492, 19.1078],
        [-33.7530, 19.1065]
    ]
}

TRAIL_PATHS = {
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
}

def get_default_beats() -> List[Dict[str, Any]]:
    import copy
    return copy.deepcopy(CPS_BEATS_DATA)
