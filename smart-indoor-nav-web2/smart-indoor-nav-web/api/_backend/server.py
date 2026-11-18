"""
Smart Indoor Navigation System - HTTP API & Application Server
Multi-threaded, zero-dependency Python server providing REST APIs and static file delivery.
"""

import http.server
import socketserver
import json
import os
import urllib.parse
from typing import Dict, Any

from database import get_connection, init_db, seed_sample_data
from graph_engine import GraphRouteEngine
from positioning import IndoorPositioningEngine

PORT = 8000
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")

import hmac, hashlib, base64, re, secrets, time, uuid

SECRET = os.environ.get("SMARTNAV_SECRET", "dev-secret-change-me").encode()
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

def _hash_pw(pw, salt=None):
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt.encode(), 120_000).hex()
    return f"pbkdf2${salt}${h}"

def _check_pw(pw, stored):
    if not stored:
        return False
    if stored.startswith("pbkdf2$"):
        return hmac.compare_digest(_hash_pw(pw, stored.split("$")[1]), stored)
    return hmac.compare_digest(pw.encode(), stored.encode())  # legacy seeded accounts

def _b64(b): return base64.urlsafe_b64encode(b).decode().rstrip("=")

def make_token(user, ttl=7 * 86400):
    body = _b64(json.dumps({**user, "exp": int(time.time()) + ttl}).encode())
    return body + "." + _b64(hmac.new(SECRET, body.encode(), hashlib.sha256).digest())

def read_token(tok):
    try:
        body, sig = tok.split(".")
        good = _b64(hmac.new(SECRET, body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            return None
        data = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        return data if data["exp"] > time.time() else None
    except Exception:
        return None

route_engine = GraphRouteEngine(get_connection)
pos_engine = IndoorPositioningEngine(path_loss_exponent=2.4)

class SmartNavRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=FRONTEND_DIR, **kwargs)

    def _send_json(self, data: Any, status: int = 200):
        response_bytes = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.end_headers()
        self.wfile.write(response_bytes)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def _read_json_body(self) -> Dict[str, Any]:
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length > 0:
                raw = self.rfile.read(content_length).decode("utf-8")
                return json.loads(raw)
        except Exception as e:
            print(f"Error parsing JSON body: {e}")
        return {}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # Health Check
        if path == "/api/health":
            self._send_json({"status": "healthy", "service": "Smart Indoor Nav API", "version": "1.0.0"})
            return

        if path == "/api/auth/me":
            data = read_token(self.headers.get("Authorization", "").replace("Bearer ", ""))
            if not data:
                self._send_json({"success": False, "error": "Session expired"}, 401)
            else:
                self._send_json({"success": True, "user": {k: data[k] for k in ("id", "name", "email", "role")}})
            return

        # List all buildings
        if path == "/api/buildings":
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM buildings ORDER BY name ASC")
            buildings = [dict(row) for row in cursor.fetchall()]
            conn.close()
            self._send_json({"success": True, "buildings": buildings})
            return

        # Get full building graph, floors, nodes, edges, beacons, facilities
        if path.startswith("/api/buildings/") and path.endswith("/full"):
            parts = path.split("/")
            building_id = parts[3]
            conn = get_connection()
            cursor = conn.cursor()

            cursor.execute("SELECT * FROM buildings WHERE id = ?", (building_id,))
            bld = cursor.fetchone()
            if not bld:
                conn.close()
                self._send_json({"success": False, "error": "Building not found"}, 404)
                return

            cursor.execute("SELECT * FROM floors WHERE building_id = ? ORDER BY floor_number ASC", (building_id,))
            floors = [dict(r) for r in cursor.fetchall()]

            cursor.execute("SELECT * FROM navigation_nodes WHERE building_id = ?", (building_id,))
            nodes = [dict(r) for r in cursor.fetchall()]

            cursor.execute("""
                SELECT e.* FROM navigation_edges e
                JOIN navigation_nodes n ON e.from_node_id = n.id
                WHERE n.building_id = ?
            """, (building_id,))
            edges = [dict(r) for r in cursor.fetchall()]

            cursor.execute("SELECT * FROM ble_beacons WHERE building_id = ?", (building_id,))
            beacons = [dict(r) for r in cursor.fetchall()]

            cursor.execute("SELECT * FROM facilities WHERE building_id = ?", (building_id,))
            facilities = [dict(r) for r in cursor.fetchall()]

            cursor.execute("SELECT * FROM emergency_exits WHERE building_id = ?", (building_id,))
            emergency_exits = [dict(r) for r in cursor.fetchall()]

            conn.close()

            self._send_json({
                "success": True,
                "building": dict(bld),
                "floors": floors,
                "nodes": nodes,
                "edges": edges,
                "beacons": beacons,
                "facilities": facilities,
                "emergency_exits": emergency_exits
            })
            return

        # Fallback to serving static files from frontend directory
        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        body = self._read_json_body()

        if path in ("/api/auth/login", "/api/auth/register"):
            email = str(body.get("email", "")).strip().lower()
            pw = str(body.get("password", ""))
            if not EMAIL_RE.match(email):
                self._send_json({"success": False, "field": "email", "error": "Enter a valid email address."}, 400)
                return
            conn = get_connection()
            cur = conn.cursor()
            cur.execute("SELECT * FROM users WHERE email = ?", (email,))
            row = cur.fetchone()
            if path.endswith("login"):
                if not row or not _check_pw(pw, row["password_hash"]):
                    conn.close()
                    self._send_json({"success": False, "error": "Email or password is incorrect."}, 401)
                    return
                user = {"id": row["id"], "name": row["name"], "email": email, "role": row["role"]}
            else:
                name = str(body.get("name", "")).strip()[:60]
                if not name:
                    conn.close()
                    self._send_json({"success": False, "field": "name", "error": "Enter your name."}, 400)
                    return
                if len(pw) < 8:
                    conn.close()
                    self._send_json({"success": False, "field": "password", "error": "Password must be at least 8 characters."}, 400)
                    return
                if row:
                    conn.close()
                    self._send_json({"success": False, "field": "email", "error": "An account with this email already exists. Sign in instead."}, 409)
                    return
                user = {"id": f"usr_{uuid.uuid4().hex[:10]}", "name": name, "email": email, "role": "user"}
                cur.execute("INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, 'user')",
                            (user["id"], name, email, _hash_pw(pw)))
                conn.commit()
            conn.close()
            self._send_json({"success": True, "token": make_token(user), "user": user})
            return

        # Calculate Route (A* / Dijkstra)
        if path == "/api/route":
            building_id = body.get("building_id")
            start_node_id = body.get("start_node_id")
            end_node_id = body.get("end_node_id")
            accessible_only = body.get("accessible_only", True)
            avoid_blocked = body.get("avoid_blocked", True)

            if not building_id or not start_node_id or not end_node_id:
                self._send_json({"success": False, "error": "Missing required parameters"}, 400)
                return

            result = route_engine.find_route(
                building_id, start_node_id, end_node_id,
                accessible_only=accessible_only,
                avoid_blocked=avoid_blocked
            )
            self._send_json(result or {"success": False, "error": "Routing failed"})
            return

        # Recalculate Route from current coordinates (Solution 12: Wrong Route Correction)
        if path == "/api/recalculate":
            building_id = body.get("building_id")
            current_x = float(body.get("current_x", 0.0))
            current_y = float(body.get("current_y", 0.0))
            current_floor_id = body.get("current_floor_id")
            end_node_id = body.get("end_node_id")
            accessible_only = body.get("accessible_only", True)

            start_node_id = route_engine.find_closest_node(building_id, current_floor_id, current_x, current_y)
            if not start_node_id:
                self._send_json({"success": False, "error": "Cannot identify nearest indoor pathway node"}, 400)
                return

            result = route_engine.find_route(
                building_id, start_node_id, end_node_id,
                accessible_only=accessible_only,
                avoid_blocked=True
            )
            self._send_json(result or {"success": False, "error": "Recalculation failed"})
            return

        # Emergency Mode Route (Solution 14)
        if path == "/api/emergency":
            building_id = body.get("building_id")
            current_floor_id = body.get("current_floor_id")
            current_x = float(body.get("current_x", 0.0))
            current_y = float(body.get("current_y", 0.0))

            emergency_route = route_engine.find_nearest_emergency_exit(
                building_id, current_floor_id, current_x, current_y
            )

            if emergency_route:
                self._send_json({
                    "success": True,
                    "emergency_mode": True,
                    "data": emergency_route,
                    "disclaimer": "Safety Advisory: This application guides toward verified building exits but does not replace trained emergency personnel or building alarms. Follow official fire and emergency instructions."
                })
            else:
                self._send_json({
                    "success": False,
                    "error": "No verified safe emergency exits reachable.",
                    "disclaimer": "Follow audible emergency building announcements immediately."
                }, 404)
            return

        # Estimate Position via Weighted Centroid Localization (Solution 1 & 2)
        if path == "/api/locate":
            readings = body.get("readings", [])
            pos_result = pos_engine.estimate_position_wcl(readings)
            self._send_json(pos_result)
            return

        # Simulate Beacon RSSI from known position (Hardware simulation suite)
        if path == "/api/simulate-beacons":
            building_id = body.get("building_id")
            x = float(body.get("x", 0.0))
            y = float(body.get("y", 0.0))
            floor_id = body.get("floor_id")

            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM ble_beacons WHERE building_id = ?", (building_id,))
            beacons = [dict(r) for r in cursor.fetchall()]
            conn.close()

            readings = pos_engine.simulate_rssi_readings(x, y, floor_id, beacons)
            pos_est = pos_engine.estimate_position_wcl(readings)

            self._send_json({
                "success": True,
                "simulated_readings": readings,
                "estimated_position": pos_est
            })
            return

        # Admin: Toggle Blocked Corridor / Node (Solution 9: Changing Building Layouts)
        if path == "/api/admin/toggle-blocked":
            node_id = body.get("node_id")
            is_blocked = 1 if body.get("is_blocked", True) else 0

            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("UPDATE navigation_nodes SET is_blocked = ? WHERE id = ?", (is_blocked, node_id))
            cursor.execute("UPDATE navigation_edges SET is_blocked = ? WHERE from_node_id = ? OR to_node_id = ?", (is_blocked, node_id, node_id))
            conn.commit()
            conn.close()

            self._send_json({
                "success": True,
                "message": f"Node {node_id} blockage state updated to {is_blocked}."
            })
            return

        # Admin: Add New Room or Node
        if path == "/api/admin/add-node":
            conn = get_connection()
            cursor = conn.cursor()
            import uuid
            new_id = f"node_{uuid.uuid4().hex[:8]}"
            cursor.execute("""
                INSERT INTO navigation_nodes (id, building_id, floor_id, node_type, name, code, x, y, is_accessible, is_blocked, audio_description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                new_id,
                body.get("building_id"),
                body.get("floor_id"),
                body.get("node_type", "room"),
                body.get("name", "New Room"),
                body.get("code", "R-NEW"),
                float(body.get("x", 50.0)),
                float(body.get("y", 50.0)),
                1 if body.get("is_accessible", True) else 0,
                0,
                body.get("audio_description", "")
            ))
            conn.commit()
            conn.close()

            self._send_json({"success": True, "node_id": new_id, "name": body.get("name")})
            return

        # Obstacle Report from AI Camera (Solution 6)
        if path == "/api/obstacles/report":
            import uuid
            rep_id = f"obs_{uuid.uuid4().hex[:8]}"
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO obstacle_reports (id, building_id, floor_id, node_id, x, y, obstacle_type, severity, reported_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                rep_id,
                body.get("building_id"),
                body.get("floor_id"),
                body.get("node_id"),
                body.get("x"),
                body.get("y"),
                body.get("obstacle_type", "hazard"),
                body.get("severity", "medium"),
                body.get("reported_by", "ai_camera")
            ))
            conn.commit()
            conn.close()
            self._send_json({"success": True, "report_id": rep_id})
            return

        # Navigation History Log
        if path == "/api/navigation/history":
            import uuid
            hist_id = f"hist_{uuid.uuid4().hex[:8]}"
            conn = get_connection()
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO navigation_history (id, user_id, building_id, from_node_name, to_node_name, distance_meters, duration_seconds, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                hist_id,
                body.get("user_id", "guest"),
                body.get("building_id"),
                body.get("from_name"),
                body.get("to_name"),
                body.get("distance_meters", 0.0),
                body.get("duration_seconds", 0.0),
                body.get("status", "completed")
            ))
            conn.commit()
            conn.close()
            self._send_json({"success": True, "history_id": hist_id})
            return

        self._send_json({"error": "Endpoint not found"}, 404)

class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

def run_server(port=PORT):
    init_db()
    seed_sample_data()
    server_address = ("127.0.0.1", port)
    httpd = ThreadedHTTPServer(server_address, SmartNavRequestHandler)
    print(f"================================================================")
    print(f"  SMART INDOOR NAV - Server running at http://localhost:{port}")
    print(f"  Accessible Mobile Interface: http://localhost:{port}/index.html")
    print(f"  Admin Dashboard & Simulation: http://localhost:{port}/#admin")
    print(f"================================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
