/**
 * Smart Indoor Navigation System - Administrator Dashboard
 * Allows facility managers to update room layouts, toggle blocked corridors,
 * manage BLE beacons, and monitor indoor navigation telemetry.
 */

class AdminManager {
  constructor() {
    this.isAuthenticated = false;
    this.adminToken = null;
  }

  login(password) {
    if (password === "admin123" || password === "admin") {
      this.isAuthenticated = true;
      localStorage.setItem("smartnav_admin_auth", "true");
      return true;
    }
    return false;
  }

  logout() {
    this.isAuthenticated = false;
    localStorage.removeItem("smartnav_admin_auth");
  }

  checkAuth() {
    this.isAuthenticated = localStorage.getItem("smartnav_admin_auth") === "true";
    return this.isAuthenticated;
  }

  async toggleNodeBlockage(nodeId, currentlyBlocked) {
    const newState = !currentlyBlocked;
    try {
      const resp = await fetch("/api/admin/toggle-blocked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node_id: nodeId, is_blocked: newState })
      });
      const data = await resp.json();
      return data.success;
    } catch (e) {
      console.warn("Backend unavailable, updating local cache", e);
      return false;
    }
  }

  async addNewRoom(roomData) {
    try {
      const resp = await fetch("/api/admin/add-node", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(roomData)
      });
      return await resp.json();
    } catch (e) {
      console.error("Failed to add room", e);
      return { success: false, error: e.message };
    }
  }
}

window.adminManager = new AdminManager();
