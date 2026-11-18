"""
Smart Indoor Navigation System - Graph Engine
Implements multi-floor A* and Dijkstra pathfinding with accessibility constraints,
turn-by-turn instruction generation, and emergency exit routing.
"""

import math
import heapq
from typing import Dict, List, Tuple, Any, Optional

class GraphRouteEngine:
    def __init__(self, db_connection_factory):
        self.get_connection = db_connection_factory

    def load_graph(self, building_id: str):
        """Loads all nodes and edges for a building into memory."""
        conn = self.get_connection()
        cursor = conn.cursor()

        # Load nodes
        cursor.execute("""
            SELECT id, building_id, floor_id, node_type, name, code, x, y, is_accessible, is_blocked, audio_description
            FROM navigation_nodes
            WHERE building_id = ?
        """, (building_id,))
        nodes = {row["id"]: dict(row) for row in cursor.fetchall()}

        # Load edges
        cursor.execute("""
            SELECT e.id, e.from_node_id, e.to_node_id, e.distance_meters, e.edge_type, e.is_blocked, e.is_accessible
            FROM navigation_edges e
            JOIN navigation_nodes n ON e.from_node_id = n.id
            WHERE n.building_id = ?
        """, (building_id,))
        edges = [dict(row) for row in cursor.fetchall()]

        # Load floors
        cursor.execute("SELECT id, floor_number, floor_name FROM floors WHERE building_id = ?", (building_id,))
        floors = {row["id"]: dict(row) for row in cursor.fetchall()}

        conn.close()

        # Adjacency list
        adj: Dict[str, List[Dict[str, Any]]] = {n_id: [] for n_id in nodes}
        for e in edges:
            if e["from_node_id"] in adj and e["to_node_id"] in nodes:
                adj[e["from_node_id"]].append({
                    "to": e["to_node_id"],
                    "distance": e["distance_meters"],
                    "edge_type": e["edge_type"],
                    "is_blocked": e["is_blocked"],
                    "is_accessible": e["is_accessible"]
                })

        return nodes, adj, floors

    def calculate_distance(self, n1: Dict[str, Any], n2: Dict[str, Any]) -> float:
        """Euclidean 2D distance heuristic for A* (penalizing floor differences)."""
        dx = n1["x"] - n2["x"]
        dy = n1["y"] - n2["y"]
        floor_penalty = 0.0
        if n1["floor_id"] != n2["floor_id"]:
            floor_penalty = 15.0 # Virtual penalty to incentivize staying on floor unless necessary
        return math.sqrt(dx * dx + dy * dy) + floor_penalty

    def find_route(self, building_id: str, start_node_id: str, end_node_id: str,
                   accessible_only: bool = True,
                   avoid_blocked: bool = True,
                   temporary_blocked_nodes: Optional[List[str]] = None) -> Optional[Dict[str, Any]]:
        """
        Calculates optimal path using A* search algorithm considering accessibility and blockage constraints.
        """
        nodes, adj, floors = self.load_graph(building_id)

        if start_node_id not in nodes or end_node_id not in nodes:
            return None

        temp_blocked = set(temporary_blocked_nodes or [])

        # Priority queue: (f_score, current_node_id)
        open_set = []
        heapq.heappush(open_set, (0.0, start_node_id))

        came_from: Dict[str, str] = {}
        edge_used: Dict[str, Dict[str, Any]] = {}

        g_score: Dict[str, float] = {n_id: float("inf") for n_id in nodes}
        g_score[start_node_id] = 0.0

        f_score: Dict[str, float] = {n_id: float("inf") for n_id in nodes}
        target_node = nodes[end_node_id]
        f_score[start_node_id] = self.calculate_distance(nodes[start_node_id], target_node)

        while open_set:
            _, current_id = heapq.heappop(open_set)

            if current_id == end_node_id:
                # Reconstruct path
                path_node_ids = [current_id]
                curr = current_id
                while curr in came_from:
                    curr = came_from[curr]
                    path_node_ids.append(curr)
                path_node_ids.reverse()

                path_nodes = [nodes[n_id] for n_id in path_node_ids]
                instructions = self.generate_instructions(path_nodes, floors)
                total_distance = g_score[end_node_id]

                return {
                    "success": True,
                    "building_id": building_id,
                    "start_node": nodes[start_node_id],
                    "end_node": nodes[end_node_id],
                    "total_distance_meters": round(total_distance, 1),
                    "estimated_time_minutes": max(1, round(total_distance / 45.0, 1)), # Average blind walking speed ~0.75 m/s (~45m/min)
                    "path_node_ids": path_node_ids,
                    "path_nodes": path_nodes,
                    "instructions": instructions,
                    "is_accessible": accessible_only
                }

            for edge in adj.get(current_id, []):
                neighbor_id = edge["to"]
                neighbor_node = nodes[neighbor_id]

                # Check constraints
                if avoid_blocked:
                    if edge["is_blocked"] == 1 or neighbor_node["is_blocked"] == 1:
                        continue
                    if neighbor_id in temp_blocked:
                        continue

                if accessible_only:
                    # Wheelchair / cane accessible path: avoid stairs!
                    if edge["edge_type"] == "stairs" or edge["is_accessible"] == 0:
                        continue
                    if neighbor_node["is_accessible"] == 0:
                        continue

                tentative_g = g_score[current_id] + edge["distance"]

                if tentative_g < g_score[neighbor_id]:
                    came_from[neighbor_id] = current_id
                    edge_used[neighbor_id] = edge
                    g_score[neighbor_id] = tentative_g
                    f_score[neighbor_id] = tentative_g + self.calculate_distance(neighbor_node, target_node)
                    heapq.heappush(open_set, (f_score[neighbor_id], neighbor_id))

        return {
            "success": False,
            "error": "No accessible and unblocked route found between selected points.",
            "path_nodes": [],
            "instructions": []
        }

    def calculate_bearing(self, p1: Dict[str, Any], p2: Dict[str, Any]) -> float:
        """Calculates 2D compass bearing (0-360 degrees) from p1 to p2."""
        dx = p2["x"] - p1["x"]
        dy = p2["y"] - p1["y"]
        angle_rad = math.atan2(dx, -dy) # Screen coordinates: y down
        degrees = math.degrees(angle_rad)
        return (degrees + 360.0) % 360.0

    def generate_instructions(self, path_nodes: List[Dict[str, Any]], floors: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Translates a sequence of nodes into accessible, clear turn-by-turn voice instructions.
        """
        if not path_nodes:
            return []

        instructions = []
        num_nodes = len(path_nodes)

        # Initial instruction
        first = path_nodes[0]
        first_floor_name = floors.get(first["floor_id"], {}).get("floor_name", "Current Floor")
        instructions.append({
            "step": 1,
            "type": "start",
            "instruction": f"Start at {first['name']} on {first_floor_name}.",
            "instruction_hi": f"{first['name']} ({first_floor_name}) se shuru karein.",
            "instruction_te": f"{first_floor_name} lo unna {first['name']} nundi modalu pettandi.",
            "distance_meters": 0.0,
            "node_id": first["id"],
            "floor_id": first["floor_id"],
            "target_x": first["x"],
            "target_y": first["y"],
            "haptic_pattern": [100]
        })

        if num_nodes == 1:
            instructions.append({
                "step": 2,
                "type": "arrival",
                "instruction": f"You are already at {first['name']}.",
                "instruction_hi": f"Aap pehle se {first['name']} par hain.",
                "instruction_te": f"Meeru ika {first['name']} daggare unnaru.",
                "distance_meters": 0.0,
                "node_id": first["id"],
                "floor_id": first["floor_id"],
                "target_x": first["x"],
                "target_y": first["y"],
                "haptic_pattern": [200, 100, 200]
            })
            return instructions

        for i in range(len(path_nodes) - 1):
            curr = path_nodes[i]
            nxt = path_nodes[i + 1]

            # Check if floor transition
            if curr["floor_id"] != nxt["floor_id"]:
                curr_fl = floors.get(curr["floor_id"], {}).get("floor_name", "Current Floor")
                nxt_fl = floors.get(nxt["floor_id"], {}).get("floor_name", "Next Floor")

                if curr["node_type"] == "elevator" or nxt["node_type"] == "elevator":
                    msg = f"Take elevator to {nxt_fl}. Doors will open automatically."
                    msg_hi = f"Lift se {nxt_fl} par jayein. Darwaza aage khulega."
                    msg_te = f"Lift dwara {nxt_fl} ki vellandi. Dwaaralu swayamchalitamga teruchukuntayi."
                    i_type = "elevator"
                else:
                    msg = f"Use stairs with handrail to reach {nxt_fl}."
                    msg_hi = f"Sidhiyon ka sahara lekar {nxt_fl} par jayein."
                    msg_te = f"Metla sahayanto {nxt_fl} ki cherukondi."
                    i_type = "stairs"

                instructions.append({
                    "step": len(instructions) + 1,
                    "type": i_type,
                    "instruction": msg,
                    "instruction_hi": msg_hi,
                    "instruction_te": msg_te,
                    "distance_meters": 4.0,
                    "node_id": nxt["id"],
                    "floor_id": nxt["floor_id"],
                    "target_x": nxt["x"],
                    "target_y": nxt["y"],
                    "haptic_pattern": [150, 150, 150]
                })
                continue

            dist = round(math.hypot(nxt["x"] - curr["x"], nxt["y"] - curr["y"]), 1)
            if dist < 1.0:
                dist = 2.0

            # Determine turn angle
            turn_text = "Walk straight"
            turn_hi = "Seedhe chalein"
            turn_te = "Neraaga nadavandi"
            turn_type = "straight"
            haptic = [50]

            if i > 0 and path_nodes[i - 1]["floor_id"] == curr["floor_id"]:
                prev = path_nodes[i - 1]
                b1 = self.calculate_bearing(prev, curr)
                b2 = self.calculate_bearing(curr, nxt)
                diff = (b2 - b1 + 180) % 360 - 180

                if -150 <= diff < -35:
                    turn_text = "Turn left"
                    turn_hi = "Baayein mudein"
                    turn_te = "Edamavaipu tiragandi"
                    turn_type = "turn_left"
                    haptic = [100, 50, 100]
                elif 35 <= diff <= 150:
                    turn_text = "Turn right"
                    turn_hi = "Daayein mudein"
                    turn_te = "Kudivaipu tiragandi"
                    turn_type = "turn_right"
                    haptic = [100, 50, 100]
                elif diff < -150 or diff > 150:
                    turn_text = "Make a U-turn"
                    turn_hi = "Wapas mudein"
                    turn_te = "Venakki tiragandi"
                    turn_type = "u_turn"
                    haptic = [150, 100, 150]

            # Detail the target
            target_desc = nxt["name"]
            if i + 1 == len(path_nodes) - 1:
                # Approaching destination
                full_msg = f"{turn_text} for {dist} meters toward your destination, {target_desc}."
                full_hi = f"{turn_hi} {dist} meter apne lakshya {target_desc} ki taraf."
                full_te = f"{target_desc} kosam {dist} meetarlu {turn_te}."
            else:
                full_msg = f"{turn_text} for {dist} meters toward {target_desc}."
                full_hi = f"{dist} meter {turn_hi} {target_desc} ki taraf."
                full_te = f"{target_desc} vaipu {dist} meetarlu {turn_te}."

            instructions.append({
                "step": len(instructions) + 1,
                "type": turn_type,
                "instruction": full_msg,
                "instruction_hi": full_hi,
                "instruction_te": full_te,
                "distance_meters": dist,
                "node_id": nxt["id"],
                "floor_id": nxt["floor_id"],
                "target_x": nxt["x"],
                "target_y": nxt["y"],
                "target_name": nxt["name"],
                "audio_description": nxt.get("audio_description", ""),
                "haptic_pattern": haptic
            })

        # Final Arrival Instruction
        last_node = path_nodes[-1]
        instructions.append({
            "step": len(instructions) + 1,
            "type": "arrival",
            "instruction": f"You have reached your destination, {last_node['name']}. {last_node.get('audio_description', '')}",
            "instruction_hi": f"Aap apne lakshya {last_node['name']} par pahunch gaye hain.",
            "instruction_te": f"Meeru mee gamyam {last_node['name']} ki cherukunnaru.",
            "distance_meters": 0.0,
            "node_id": last_node["id"],
            "floor_id": last_node["floor_id"],
            "target_x": last_node["x"],
            "target_y": last_node["y"],
            "haptic_pattern": [200, 100, 200, 100, 300]
        })

        return instructions

    def find_nearest_emergency_exit(self, building_id: str, current_floor_id: str,
                                    current_x: float, current_y: float) -> Optional[Dict[str, Any]]:
        """
        Locates the closest verified safe emergency exit from the user's position and calculates safe route.
        """
        conn = self.get_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT ee.id, ee.node_id, ee.name, ee.is_verified_safe, ee.status,
                   n.x, n.y, n.floor_id, n.is_blocked
            FROM emergency_exits ee
            JOIN navigation_nodes n ON ee.node_id = n.id
            WHERE ee.building_id = ? AND ee.is_verified_safe = 1 AND ee.status = 'open' AND n.is_blocked = 0
        """, (building_id,))
        exits = [dict(row) for row in cursor.fetchall()]
        conn.close()

        if not exits:
            return None

        # Sort by floor match first, then by distance
        def exit_distance_score(e):
            floor_penalty = 0 if e["floor_id"] == current_floor_id else 50.0
            dist = math.hypot(e["x"] - current_x, e["y"] - current_y)
            return dist + floor_penalty

        exits.sort(key=exit_distance_score)
        nearest_exit = exits[0]

        # Find closest node to user to start pathfinding
        start_node_id = self.find_closest_node(building_id, current_floor_id, current_x, current_y)
        if not start_node_id:
            start_node_id = nearest_exit["node_id"]

        route = self.find_route(building_id, start_node_id, nearest_exit["node_id"], accessible_only=False, avoid_blocked=True)

        return {
            "exit_details": nearest_exit,
            "route": route
        }

    def find_closest_node(self, building_id: str, floor_id: str, x: float, y: float) -> Optional[str]:
        """Finds closest navigation node on the same floor."""
        conn = self.get_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, x, y FROM navigation_nodes
            WHERE building_id = ? AND floor_id = ? AND is_blocked = 0
        """, (building_id, floor_id))
        nodes = cursor.fetchall()
        conn.close()

        if not nodes:
            return None

        closest_id = None
        min_dist = float("inf")
        for row in nodes:
            dist = math.hypot(row["x"] - x, row["y"] - y)
            if dist < min_dist:
                min_dist = dist
                closest_id = row["id"]

        return closest_id
