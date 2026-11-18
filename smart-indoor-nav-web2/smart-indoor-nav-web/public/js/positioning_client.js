/**
 * Smart Indoor Navigation System - Positioning Client & Simulation Engine
 * Handles BLE beacon signal processing, trilateration, confidence estimation,
 * step-by-step walking simulation, and off-route deviation detection.
 */

class PositioningClient {
  constructor() {
    this.currentPosition = {
      x: 10.0,
      y: 40.0,
      floor_id: "fl_college_ground",
      heading: 90.0, // Degrees (East)
      confidence: 0.85,
      is_reliable: true,
      lastUpdated: new Date()
    };
    
    this.beaconSignals = [];
    this.simulationActive = false;
    this.simulationTimer = null;
    this.onPositionUpdate = null;
    this.onOffRouteDetected = null;
    this.currentPlannedRoute = null;
    this.simStepIndex = 0;
  }

  setPosition(x, y, floor_id, heading = 90.0) {
    this.currentPosition.x = x;
    this.currentPosition.y = y;
    this.currentPosition.floor_id = floor_id;
    this.currentPosition.heading = heading;
    this.currentPosition.lastUpdated = new Date();

    if (this.onPositionUpdate) {
      this.onPositionUpdate(this.currentPosition);
    }

    // Check for off-route deviation
    if (this.currentPlannedRoute && this.currentPlannedRoute.path_nodes) {
      this.checkOffRoute();
    }
  }

  setBeaconSignals(signals) {
    this.beaconSignals = signals;
    // Calculate client-side WCL positioning
    if (signals && signals.length > 0) {
      let totalW = 0;
      let wx = 0;
      let wy = 0;
      for (const s of signals) {
        const d = Math.pow(10, (-59 - s.rssi) / (10 * 2.4));
        const w = 1.0 / (d * d + 0.05);
        totalW += w;
        wx += s.x * w;
        wy += s.y * w;
      }
      if (totalW > 0) {
        const estX = wx / totalW;
        const estY = wy / totalW;
        const count = signals.length;
        this.currentPosition.confidence = Math.min(0.95, 0.4 + count * 0.15);
        this.currentPosition.is_reliable = this.currentPosition.confidence >= 0.5;
        this.setPosition(estX, estY, signals[0].floor_id);
      }
    }
  }

  checkOffRoute() {
    if (!this.currentPlannedRoute || !this.currentPlannedRoute.path_nodes) return;
    
    const nodes = this.currentPlannedRoute.path_nodes;
    let minDistanceToPath = Infinity;

    for (let i = 0; i < nodes.length - 1; i++) {
      const n1 = nodes[i];
      const n2 = nodes[i + 1];
      if (n1.floor_id === this.currentPosition.floor_id) {
        const distToSegment = this.distanceToSegment(
          this.currentPosition.x, this.currentPosition.y,
          n1.x, n1.y, n2.x, n2.y
        );
        if (distToSegment < minDistanceToPath) {
          minDistanceToPath = distToSegment;
        }
      }
    }

    // Solution 12: If user is more than 8 meters away from the route, trigger recalculation
    if (minDistanceToPath > 8.0 && minDistanceToPath < 200) {
      console.warn("User has deviated from route! Deviation:", minDistanceToPath, "meters");
      if (this.onOffRouteDetected) {
        this.onOffRouteDetected(this.currentPosition, minDistanceToPath);
      }
    }
  }

  distanceToSegment(px, py, x1, y1, x2, y2) {
    const l2 = Math.hypot(x2 - x1, y2 - y1) ** 2;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  /**
   * Hardware Simulation Suite:
   * Smoothly steps the simulated user forward along the path.
   */
  startWalkingSimulation(route, onStepCallback, onArrivalCallback) {
    this.stopWalkingSimulation();
    if (!route || !route.path_nodes || route.path_nodes.length === 0) return;

    this.currentPlannedRoute = route;
    this.simulationActive = true;
    this.simStepIndex = 0;

    const nodes = route.path_nodes;
    let currNodeIdx = 0;
    let progressBetween = 0.0;

    this.simulationTimer = setInterval(() => {
      if (!this.simulationActive) return;

      if (currNodeIdx >= nodes.length - 1) {
        // Reached destination!
        this.stopWalkingSimulation();
        if (onArrivalCallback) onArrivalCallback(nodes[nodes.length - 1]);
        return;
      }

      const fromNode = nodes[currNodeIdx];
      const toNode = nodes[currNodeIdx + 1];

      // Handle floor jump (elevator or stairs)
      if (fromNode.floor_id !== toNode.floor_id) {
        progressBetween += 0.5;
        if (progressBetween >= 1.0) {
          currNodeIdx++;
          progressBetween = 0.0;
          this.setPosition(toNode.x, toNode.y, toNode.floor_id);
          if (onStepCallback) onStepCallback(currNodeIdx, toNode);
        }
        return;
      }

      progressBetween += 0.25; // 4 ticks per segment (~2 seconds)
      const curX = fromNode.x + (toNode.x - fromNode.x) * progressBetween;
      const curY = fromNode.y + (toNode.y - fromNode.y) * progressBetween;
      const heading = Math.atan2(toNode.x - fromNode.x, -(toNode.y - fromNode.y)) * (180 / Math.PI);

      this.setPosition(curX, curY, fromNode.floor_id, heading);

      if (progressBetween >= 1.0) {
        currNodeIdx++;
        progressBetween = 0.0;
        if (onStepCallback) onStepCallback(currNodeIdx, toNode);
      }
    }, 600);
  }

  stopWalkingSimulation() {
    this.simulationActive = false;
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
  }

  /**
   * Forces a simulated deviation to verify Solution 12
   */
  triggerSimulatedWrongTurn() {
    console.log("Simulating wrong turn: moving 15 meters off route!");
    this.currentPosition.x += 12.0;
    this.currentPosition.y += 12.0;
    this.setPosition(this.currentPosition.x, this.currentPosition.y, this.currentPosition.floor_id);
  }
}

window.positioningClient = new PositioningClient();
