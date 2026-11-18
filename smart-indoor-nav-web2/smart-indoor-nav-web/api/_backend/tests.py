"""
Unit & Integration Tests for Smart Indoor Nav Backend
Validates routing, accessibility constraints, positioning algorithms, and emergency exits.
"""

import unittest
import math
from database import get_connection, init_db, seed_sample_data
from graph_engine import GraphRouteEngine
from positioning import IndoorPositioningEngine

class TestSmartNavBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        seed_sample_data()
        cls.engine = GraphRouteEngine(get_connection)
        cls.pos_engine = IndoorPositioningEngine(path_loss_exponent=2.4)

    def test_database_seeded(self):
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM buildings")
        bld_count = cursor.fetchone()[0]
        self.assertGreaterEqual(bld_count, 2)

        cursor.execute("SELECT COUNT(*) FROM navigation_nodes")
        node_count = cursor.fetchone()[0]
        self.assertGreaterEqual(node_count, 15)
        conn.close()

    def test_accessible_route_uses_elevator_to_first_floor(self):
        """Testing user going from Main Entrance to Computer Lab 205 (First Floor) in accessible mode."""
        res = self.engine.find_route(
            building_id="bld_college_01",
            start_node_id="n_c_main_gate",
            end_node_id="n_c_complab_205",
            accessible_only=True
        )
        self.assertTrue(res["success"], f"Routing failed: {res}")
        path_ids = res["path_node_ids"]
        # Must include the elevator, and must NOT include stairs
        self.assertIn("n_c_elevator_gf", path_ids)
        self.assertIn("n_c_elevator_ff", path_ids)
        self.assertNotIn("n_c_stairs_gf", path_ids)
        self.assertNotIn("n_c_stairs_ff", path_ids)
        self.assertGreater(len(res["instructions"]), 3)

    def test_avoid_blocked_pathways(self):
        """Test routing when a pathway is blocked."""
        # Block the lobby to West Corridor path
        res_normal = self.engine.find_route(
            building_id="bld_college_01",
            start_node_id="n_c_lobby",
            end_node_id="n_c_principal",
            accessible_only=True,
            avoid_blocked=True
        )
        self.assertTrue(res_normal["success"])

        # With temporary blocked corridor
        res_blocked = self.engine.find_route(
            building_id="bld_college_01",
            start_node_id="n_c_lobby",
            end_node_id="n_c_principal",
            accessible_only=True,
            avoid_blocked=True,
            temporary_blocked_nodes=["n_c_corridor_west_1"]
        )
        # Cannot reach principal because west corridor junction is blocked
        self.assertFalse(res_blocked["success"])

    def test_emergency_exit_finder(self):
        """Test emergency navigation finding the nearest verified safe exit."""
        res = self.engine.find_nearest_emergency_exit(
            building_id="bld_college_01",
            current_floor_id="fl_college_ground",
            current_x=20.0,
            current_y=40.0
        )
        self.assertIsNotNone(res)
        self.assertEqual(res["exit_details"]["is_verified_safe"], 1)
        self.assertTrue(res["route"]["success"])

    def test_ble_rssi_distance_and_wcl_positioning(self):
        """Test RSSI to distance conversion and Weighted Centroid Localization."""
        # At 1 meter with txPower -59, RSSI should be approximately -59
        d1 = self.pos_engine.rssi_to_distance(-59, -59)
        self.assertAlmostEqual(d1, 1.0, delta=0.1)

        # Three beacon test
        readings = [
            {"x": 10.0, "y": 40.0, "rssi": -62, "tx_power": -59, "floor_id": "fl_college_ground"},
            {"x": 25.0, "y": 40.0, "rssi": -61, "tx_power": -59, "floor_id": "fl_college_ground"},
            {"x": 20.0, "y": 45.0, "rssi": -63, "tx_power": -59, "floor_id": "fl_college_ground"}
        ]
        pos = self.pos_engine.estimate_position_wcl(readings)
        self.assertTrue(pos["success"])
        self.assertTrue(pos["is_reliable"])
        self.assertGreaterEqual(pos["confidence"], 0.5)
        # Estimated x should be between 10 and 25
        self.assertGreaterEqual(pos["x"], 10.0)
        self.assertLessEqual(pos["x"], 25.0)

if __name__ == "__main__":
    unittest.main()
