"""
Smart Indoor Navigation System - Indoor Positioning Engine
Implements BLE Beacon RSSI-to-distance conversion, Weighted Centroid Localization,
Trilateration, Signal Confidence calculation, and Realistic Beacon Simulation.
"""

import math
import random
from typing import List, Dict, Any, Tuple, Optional

class IndoorPositioningEngine:
    def __init__(self, path_loss_exponent: float = 2.4):
        """
        path_loss_exponent (n): Typically 2.0 (free space) to 2.4 - 3.0 (indoor office with obstacles)
        """
        self.n = path_loss_exponent

    def rssi_to_distance(self, rssi: float, tx_power: int = -59) -> float:
        """
        Calculates distance in meters from RSSI using log-distance path loss formula:
        distance = 10 ^ ((tx_power - rssi) / (10 * n))
        """
        if rssi >= 0:
            return 0.1
        ratio = (tx_power - rssi) / (10.0 * self.n)
        dist = math.pow(10.0, ratio)
        return max(0.2, round(dist, 2))

    def estimate_position_wcl(self, beacon_readings: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Estimates 2D position (x, y) using Weighted Centroid Localization (WCL).
        beacon_readings: List of dicts with keys: {'x': float, 'y': float, 'rssi': float, 'tx_power': int, 'floor_id': str}
        """
        if not beacon_readings:
            return {
                "success": False,
                "error": "No beacon signals detected",
                "confidence": 0.0,
                "is_reliable": False
            }

        # Filter beacons for the floor with highest signal power
        floor_counts: Dict[str, float] = {}
        for b in beacon_readings:
            f_id = b.get("floor_id", "default")
            weight = math.pow(10.0, b.get("rssi", -100) / 20.0)
            floor_counts[f_id] = floor_counts.get(f_id, 0.0) + weight

        best_floor_id = max(floor_counts.items(), key=lambda item: item[1])[0]
        active_readings = [b for b in beacon_readings if b.get("floor_id") == best_floor_id]

        if not active_readings:
            return {
                "success": False,
                "error": "Unable to resolve floor",
                "confidence": 0.0,
                "is_reliable": False
            }

        # If only 1 beacon is visible
        if len(active_readings) == 1:
            b = active_readings[0]
            dist = self.rssi_to_distance(b.get("rssi", -80), b.get("tx_power", -59))
            return {
                "success": True,
                "x": round(b["x"], 2),
                "y": round(b["y"], 2),
                "floor_id": best_floor_id,
                "estimated_distance_to_nearest": dist,
                "beacon_count": 1,
                "confidence": 0.35, # Low confidence from single beacon
                "is_reliable": False,
                "warning": "Single beacon detected. Location accuracy approximate."
            }

        total_weight = 0.0
        weighted_x = 0.0
        weighted_y = 0.0

        for b in active_readings:
            dist = self.rssi_to_distance(b.get("rssi", -80), b.get("tx_power", -59))
            # Weight is inverse square of estimated distance
            weight = 1.0 / (dist * dist + 0.01)
            total_weight += weight
            weighted_x += b["x"] * weight
            weighted_y += b["y"] * weight

        est_x = round(weighted_x / total_weight, 2)
        est_y = round(weighted_y / total_weight, 2)

        # Estimate confidence score
        # Factors: beacon count (3+ is good), strongest RSSI (better than -75dBm is strong)
        strongest_rssi = max(b.get("rssi", -100) for b in active_readings)
        count_factor = min(1.0, len(active_readings) / 4.0) # max out at 4 beacons
        signal_factor = max(0.1, min(1.0, (strongest_rssi + 95.0) / 40.0)) # -95dBm -> 0.0, -55dBm -> 1.0
        confidence = round(0.5 * count_factor + 0.5 * signal_factor, 2)

        is_reliable = confidence >= 0.5

        return {
            "success": True,
            "x": est_x,
            "y": est_y,
            "floor_id": best_floor_id,
            "beacon_count": len(active_readings),
            "strongest_rssi": strongest_rssi,
            "confidence": confidence,
            "is_reliable": is_reliable,
            "warning": "" if is_reliable else "Position accuracy is low. Rely on cane/guide cues."
        }

    def simulate_rssi_readings(self, user_x: float, user_y: float, floor_id: str,
                               all_beacons: List[Dict[str, Any]], noise_std_dev: float = 2.0) -> List[Dict[str, Any]]:
        """
        Generates simulated RSSI readings for all beacons within range of (user_x, user_y, floor_id).
        Adds Gaussian noise to mimic real-world multipath interference.
        """
        readings = []
        for b in all_beacons:
            if b.get("floor_id") != floor_id:
                continue

            dx = b["x"] - user_x
            dy = b["y"] - user_y
            actual_dist = math.hypot(dx, dy)

            # Max detection radius for typical BLE beacon is ~25 meters indoors
            if actual_dist > 28.0:
                continue

            tx_power = b.get("tx_power", -59)
            # RSSI = TxPower - 10 * n * log10(d) + noise
            clean_rssi = tx_power - (10.0 * self.n * math.log10(max(0.5, actual_dist)))
            noise = random.gauss(0, noise_std_dev)
            sim_rssi = round(clean_rssi + noise, 1)

            readings.append({
                "id": b["id"],
                "uuid": b.get("uuid"),
                "major": b.get("major"),
                "minor": b.get("minor"),
                "x": b["x"],
                "y": b["y"],
                "floor_id": floor_id,
                "tx_power": tx_power,
                "rssi": min(-30.0, max(-98.0, sim_rssi)),
                "actual_dist": round(actual_dist, 2)
            })

        readings.sort(key=lambda r: r["rssi"], reverse=True)
        return readings
