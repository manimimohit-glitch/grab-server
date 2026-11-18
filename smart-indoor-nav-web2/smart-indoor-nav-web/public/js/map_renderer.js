/**
 * Smart Indoor Navigation System - 2D Interactive Digital Map Renderer
 * Renders floor plans, navigation corridors, multi-floor transitions, BLE beacons,
 * calculated routes, user position puck, and emergency evacuation paths.
 */

class IndoorMapRenderer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement ? canvasElement.getContext("2d") : null;
    this.buildingData = null;
    this.activeFloorId = null;
    this.activeRoute = null;
    this.userPosition = { x: 10, y: 40, floor_id: "fl_college_ground", heading: 90 };
    this.scale = 1.0;
    this.originX = 0;
    this.originY = 0;
    this.onNodeClick = null;

    if (this.canvas) {
      this.attachEventListeners();
    }
  }

  setCanvas(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext("2d");
    this.attachEventListeners();
  }

  attachEventListeners() {
    if (!this.canvas) return;

    this.canvas.addEventListener("click", (evt) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = (evt.clientX - rect.left - this.originX) / this.scale;
      const clickY = (evt.clientY - rect.top - this.originY) / this.scale;

      // Find closest node within 12 meters
      if (this.buildingData && this.buildingData.nodes) {
        for (const n of this.buildingData.nodes) {
          if (n.floor_id === this.activeFloorId) {
            const d = Math.hypot(n.x - clickX, n.y - clickY);
            if (d < 6.0) {
              if (this.onNodeClick) this.onNodeClick(n);
              break;
            }
          }
        }
      }
    });
  }

  setBuildingData(data, floorId = null) {
    this.buildingData = data;
    if (floorId) {
      this.activeFloorId = floorId;
    } else if (data.floors && data.floors.length > 0) {
      this.activeFloorId = data.floors[0].id;
    }
    this.render();
  }

  setActiveFloor(floorId) {
    this.activeFloorId = floorId;
    this.render();
  }

  setActiveRoute(route) {
    this.activeRoute = route;
    if (route && route.start_node) {
      this.activeFloorId = route.start_node.floor_id;
    }
    this.render();
  }

  setUserPosition(pos) {
    this.userPosition = pos;
    if (pos.floor_id && pos.floor_id !== this.activeFloorId) {
      this.activeFloorId = pos.floor_id;
    }
    this.render();
  }

  render() {
    if (!this.canvas || !this.ctx || !this.buildingData) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    // High Contrast Dark Background
    this.ctx.fillStyle = "#061121";
    this.ctx.fillRect(0, 0, w, h);

    // Compute auto-scaling to fit floor plan in canvas with padding
    const currentFloor = (this.buildingData.floors || []).find(f => f.id === this.activeFloorId) || { map_width: 120, map_height: 80 };
    const pad = 40;
    const scaleX = (w - pad * 2) / (currentFloor.map_width || 120);
    const scaleY = (h - pad * 2) / (currentFloor.map_height || 80);
    this.scale = Math.min(scaleX, scaleY);
    this.originX = (w - currentFloor.map_width * this.scale) / 2;
    this.originY = (h - currentFloor.map_height * this.scale) / 2;

    this.ctx.save();
    this.ctx.translate(this.originX, this.originY);
    this.ctx.scale(this.scale, this.scale);

    // 1. Draw Architectural Floor Boundaries
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    this.ctx.lineWidth = 2 / this.scale;
    this.ctx.strokeRect(0, 0, currentFloor.map_width, currentFloor.map_height);

    // Grid pattern
    this.ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
    this.ctx.lineWidth = 1 / this.scale;
    for (let x = 10; x < currentFloor.map_width; x += 10) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, currentFloor.map_height);
      this.ctx.stroke();
    }
    for (let y = 10; y < currentFloor.map_height; y += 10) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(currentFloor.map_width, y);
      this.ctx.stroke();
    }

    // 2. Draw Navigation Edges / Corridors
    if (this.buildingData.edges) {
      const nodesMap = {};
      for (const n of this.buildingData.nodes) nodesMap[n.id] = n;

      for (const edge of this.buildingData.edges) {
        const n1 = nodesMap[edge.from_node_id];
        const n2 = nodesMap[edge.to_node_id];

        if (n1 && n2 && n1.floor_id === this.activeFloorId && n2.floor_id === this.activeFloorId) {
          this.ctx.beginPath();
          this.ctx.moveTo(n1.x, n1.y);
          this.ctx.lineTo(n2.x, n2.y);

          if (edge.is_blocked === 1) {
            // Blocked Pathway (Red dashed)
            this.ctx.strokeStyle = "#E63946";
            this.ctx.lineWidth = 4 / this.scale;
            this.ctx.setLineDash([4 / this.scale, 4 / this.scale]);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
          } else {
            // Normal Walkway Corridor
            this.ctx.strokeStyle = "rgba(0, 240, 255, 0.35)";
            this.ctx.lineWidth = 3 / this.scale;
            this.ctx.stroke();
          }
        }
      }
    }

    // 3. Draw Active Route Guidance Polyline (Glowing Amber/Yellow)
    if (this.activeRoute && this.activeRoute.path_nodes) {
      const pNodes = this.activeRoute.path_nodes.filter(n => n.floor_id === this.activeFloorId);
      if (pNodes.length > 1) {
        this.ctx.beginPath();
        this.ctx.moveTo(pNodes[0].x, pNodes[0].y);
        for (let i = 1; i < pNodes.length; i++) {
          this.ctx.lineTo(pNodes[i].x, pNodes[i].y);
        }

        // Outer glow
        this.ctx.strokeStyle = "rgba(255, 183, 3, 0.4)";
        this.ctx.lineWidth = 8 / this.scale;
        this.ctx.lineCap = "round";
        this.ctx.lineJoin = "round";
        this.ctx.stroke();

        // Inner core
        this.ctx.strokeStyle = "#FFB703";
        this.ctx.lineWidth = 4 / this.scale;
        this.ctx.stroke();
      }
    }

    // 4. Draw BLE Beacons
    if (this.buildingData.beacons) {
      for (const b of this.buildingData.beacons) {
        if (b.floor_id === this.activeFloorId) {
          // Beacon pulse circle
          this.ctx.beginPath();
          this.ctx.arc(b.x, b.y, 4 / this.scale, 0, Math.PI * 2);
          this.ctx.fillStyle = "rgba(0, 240, 255, 0.3)";
          this.ctx.fill();

          this.ctx.beginPath();
          this.ctx.arc(b.x, b.y, 2 / this.scale, 0, Math.PI * 2);
          this.ctx.fillStyle = "#00F0FF";
          this.ctx.fill();
        }
      }
    }

    // 5. Draw Navigation Nodes (Rooms, Elevators, Stairs, Exits)
    if (this.buildingData.nodes) {
      for (const node of this.buildingData.nodes) {
        if (node.floor_id === this.activeFloorId) {
          this.drawNode(node);
        }
      }
    }

    // 6. Draw User Real-Time Position Puck & Heading
    if (this.userPosition && this.userPosition.floor_id === this.activeFloorId) {
      this.drawUserPuck(this.userPosition.x, this.userPosition.y, this.userPosition.heading);
    }

    this.ctx.restore();
  }

  drawNode(node) {
    const s = this.scale;
    const r = (node.node_type === "room" || node.node_type === "facility") ? 3.5 / s : 2.5 / s;

    let color = "#FFFFFF";
    if (node.node_type === "room") color = "#4CC9F0";
    else if (node.node_type === "facility") color = "#F72585";
    else if (node.node_type === "elevator") color = "#7209B7";
    else if (node.node_type === "stairs") color = "#F39C12";
    else if (node.node_type === "exit") color = "#E63946";
    else if (node.node_type === "entrance") color = "#2ECC71";

    if (node.is_blocked === 1) color = "#E63946";

    this.ctx.beginPath();
    this.ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
    this.ctx.fillStyle = color;
    this.ctx.fill();
    this.ctx.strokeStyle = "#FFFFFF";
    this.ctx.lineWidth = 1 / s;
    this.ctx.stroke();

    // Node label
    if (node.node_type !== "corridor") {
      this.ctx.fillStyle = "#FFFFFF";
      this.ctx.font = `bold ${Math.max(10, Math.round(11 / s))}px sans-serif`;
      this.ctx.textAlign = "center";
      this.ctx.fillText(node.name, node.x, node.y - 5 / s);
    }
  }

  drawUserPuck(x, y, heading = 0) {
    const s = this.scale;
    const r = 5.0 / s;

    // Glowing pulse ring
    this.ctx.beginPath();
    this.ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
    this.ctx.fillStyle = "rgba(0, 240, 255, 0.25)";
    this.ctx.fill();

    // Blue core
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fillStyle = "#00F0FF";
    this.ctx.fill();
    this.ctx.strokeStyle = "#FFFFFF";
    this.ctx.lineWidth = 1.5 / s;
    this.ctx.stroke();

    // Heading pointer cone
    const rad = (heading - 90) * (Math.PI / 180);
    const px = x + Math.cos(rad) * (r * 2.5);
    const py = y + Math.sin(rad) * (r * 2.5);

    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(px, py);
    this.ctx.strokeStyle = "#FFFFFF";
    this.ctx.lineWidth = 2.5 / s;
    this.ctx.stroke();
  }
}

window.IndoorMapRenderer = IndoorMapRenderer;
