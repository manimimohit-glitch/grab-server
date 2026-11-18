/**
 * Smart Indoor Navigation System - Offline Storage & Local Route Solver
 * Caches building maps, nodes, edges, beacons, and calculates routes locally
 * when internet or backend connectivity is unavailable.
 */

class OfflineStorageManager {
  constructor() {
    this.storageKeyPrefix = "smartnav_offline_bld_";
  }

  isBuildingCached(buildingId) {
    return !!localStorage.getItem(`${this.storageKeyPrefix}${buildingId}`);
  }

  saveBuildingData(buildingId, data) {
    try {
      localStorage.setItem(`${this.storageKeyPrefix}${buildingId}`, JSON.stringify({
        cachedAt: new Date().toISOString(),
        data: data
      }));
      return true;
    } catch (e) {
      console.warn("Storage quota exceeded or failed", e);
      return false;
    }
  }

  getBuildingData(buildingId) {
    const raw = localStorage.getItem(`${this.storageKeyPrefix}${buildingId}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        return parsed.data;
      } catch (e) {
        console.error("Failed to parse cached building", e);
      }
    }
    return null;
  }

  listCachedBuildings() {
    const keys = Object.keys(localStorage);
    const cached = [];
    for (const k of keys) {
      if (k.startsWith(this.storageKeyPrefix)) {
        const bId = k.replace(this.storageKeyPrefix, "");
        const raw = localStorage.getItem(k);
        try {
          const parsed = JSON.parse(raw);
          cached.push({
            id: bId,
            name: parsed.data.building ? parsed.data.building.name : bId,
            cachedAt: parsed.cachedAt
          });
        } catch (e) {}
      }
    }
    return cached;
  }

  deleteBuildingData(buildingId) {
    localStorage.removeItem(`${this.storageKeyPrefix}${buildingId}`);
  }

  /**
   * Local Client-Side A* Pathfinding for 100% Offline Route Calculation
   */
  calculateLocalRoute(buildingId, startNodeId, endNodeId, accessibleOnly = true) {
    const bldData = this.getBuildingData(buildingId);
    if (!bldData) return null;

    const nodes = {};
    for (const n of bldData.nodes) {
      nodes[n.id] = n;
    }

    if (!nodes[startNodeId] || !nodes[endNodeId]) return null;

    // Build adjacency list
    const adj = {};
    for (const nId of Object.keys(nodes)) {
      adj[nId] = [];
    }

    for (const e of bldData.edges) {
      if (adj[e.from_node_id]) {
        adj[e.from_node_id].push({
          to: e.to_node_id,
          distance: e.distance_meters,
          edge_type: e.edge_type,
          is_blocked: e.is_blocked,
          is_accessible: e.is_accessible
        });
      }
    }

    // A* algorithm
    const openSet = [startNodeId];
    const cameFrom = {};
    const gScore = { [startNodeId]: 0 };
    const target = nodes[endNodeId];

    const distHeuristic = (n1, n2) => {
      const dx = n1.x - n2.x;
      const dy = n1.y - n2.y;
      const fPenalty = (n1.floor_id !== n2.floor_id) ? 15.0 : 0.0;
      return Math.hypot(dx, dy) + fPenalty;
    };

    const fScore = { [startNodeId]: distHeuristic(nodes[startNodeId], target) };

    while (openSet.length > 0) {
      // Find node with lowest fScore
      let current = openSet[0];
      let lowestF = fScore[current] || Infinity;
      let currIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        const sc = fScore[openSet[i]] || Infinity;
        if (sc < lowestF) {
          lowestF = sc;
          current = openSet[i];
          currIdx = i;
        }
      }

      if (current === endNodeId) {
        // Reconstruct path
        const pathIds = [current];
        let curr = current;
        while (cameFrom[curr]) {
          curr = cameFrom[curr];
          pathIds.push(curr);
        }
        pathIds.reverse();

        const pathNodes = pathIds.map(id => nodes[id]);
        const instructions = this.generateLocalInstructions(pathNodes, bldData.floors);

        return {
          success: true,
          building_id: buildingId,
          start_node: nodes[startNodeId],
          end_node: nodes[endNodeId],
          total_distance_meters: Math.round(gScore[endNodeId] * 10) / 10,
          estimated_time_minutes: Math.max(1, Math.round((gScore[endNodeId] / 45.0) * 10) / 10),
          path_node_ids: pathIds,
          path_nodes: pathNodes,
          instructions: instructions,
          is_offline: true
        };
      }

      openSet.splice(currIdx, 1);

      for (const edge of (adj[current] || [])) {
        if (edge.is_blocked === 1 || nodes[edge.to].is_blocked === 1) continue;
        if (accessibleOnly && (edge.edge_type === "stairs" || edge.is_accessible === 0 || nodes[edge.to].is_accessible === 0)) continue;

        const tentativeG = (gScore[current] || 0) + edge.distance;
        if (tentativeG < (gScore[edge.to] !== undefined ? gScore[edge.to] : Infinity)) {
          cameFrom[edge.to] = current;
          gScore[edge.to] = tentativeG;
          fScore[edge.to] = tentativeG + distHeuristic(nodes[edge.to], target);
          if (!openSet.includes(edge.to)) {
            openSet.push(edge.to);
          }
        }
      }
    }

    return { success: false, error: "No offline route found" };
  }

  generateLocalInstructions(pathNodes, floorsList) {
    const floors = {};
    for (const f of floorsList) floors[f.id] = f;

    const instructions = [];
    const first = pathNodes[0];
    instructions.push({
      step: 1,
      type: "start",
      instruction: `Start at ${first.name}.`,
      distance_meters: 0,
      node_id: first.id,
      floor_id: first.floor_id,
      target_x: first.x,
      target_y: first.y
    });

    for (let i = 0; i < pathNodes.length - 1; i++) {
      const curr = pathNodes[i];
      const nxt = pathNodes[i + 1];

      if (curr.floor_id !== nxt.floor_id) {
        const nxtFlName = floors[nxt.floor_id] ? floors[nxt.floor_id].floor_name : "Next Floor";
        const isElevator = curr.node_type === "elevator" || nxt.node_type === "elevator";
        instructions.push({
          step: instructions.length + 1,
          type: isElevator ? "elevator" : "stairs",
          instruction: isElevator ? `Take elevator to ${nxtFlName}.` : `Use stairs to ${nxtFlName}.`,
          distance_meters: 4.0,
          node_id: nxt.id,
          floor_id: nxt.floor_id,
          target_x: nxt.x,
          target_y: nxt.y
        });
        continue;
      }

      const dist = Math.max(2, Math.round(Math.hypot(nxt.x - curr.x, nxt.y - curr.y)));
      let turnType = "straight";
      let turnText = "Walk straight";

      if (i > 0 && pathNodes[i - 1].floor_id === curr.floor_id) {
        const prev = pathNodes[i - 1];
        const b1 = Math.atan2(curr.x - prev.x, -(curr.y - prev.y)) * (180 / Math.PI);
        const b2 = Math.atan2(nxt.x - curr.x, -(nxt.y - curr.y)) * (180 / Math.PI);
        const diff = (b2 - b1 + 180 + 360) % 360 - 180;
        if (diff < -35) { turnType = "turn_left"; turnText = "Turn left"; }
        else if (diff > 35) { turnType = "turn_right"; turnText = "Turn right"; }
      }

      instructions.push({
        step: instructions.length + 1,
        type: turnType,
        instruction: `${turnText} for ${dist} meters toward ${nxt.name}.`,
        distance_meters: dist,
        node_id: nxt.id,
        floor_id: nxt.floor_id,
        target_x: nxt.x,
        target_y: nxt.y
      });
    }

    const last = pathNodes[pathNodes.length - 1];
    instructions.push({
      step: instructions.length + 1,
      type: "arrival",
      instruction: `You have reached your destination, ${last.name}.`,
      distance_meters: 0,
      node_id: last.id,
      floor_id: last.floor_id,
      target_x: last.x,
      target_y: last.y
    });

    return instructions;
  }
}

window.offlineStore = new OfflineStorageManager();
