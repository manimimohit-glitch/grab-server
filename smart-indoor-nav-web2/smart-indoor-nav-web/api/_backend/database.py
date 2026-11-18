"""
Smart Indoor Navigation System - Database Layer
SQLite schema and data access methods for buildings, floors, nodes, paths, beacons, and facilities.
"""

import sqlite3
import json
import os
import uuid
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "smart_nav.db")

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Users Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE,
        password_hash TEXT,
        role TEXT DEFAULT 'user',
        preferred_language TEXT DEFAULT 'en',
        accessibility_prefs TEXT DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 2. Buildings Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS buildings (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT,
        address TEXT,
        total_floors INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 3. Floors Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS floors (
        id TEXT PRIMARY KEY,
        building_id TEXT NOT NULL,
        floor_number INTEGER NOT NULL,
        floor_name TEXT NOT NULL,
        map_width REAL DEFAULT 100.0,
        map_height REAL DEFAULT 100.0,
        FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
    )
    """)

    # 4. Navigation Nodes Table (Rooms, corridor junctions, elevators, stairs, exits)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS navigation_nodes (
        id TEXT PRIMARY KEY,
        building_id TEXT NOT NULL,
        floor_id TEXT NOT NULL,
        node_type TEXT NOT NULL, -- 'room', 'corridor', 'elevator', 'stairs', 'exit', 'facility', 'entrance'
        name TEXT NOT NULL,
        code TEXT,
        x REAL NOT NULL,
        y REAL NOT NULL,
        is_accessible INTEGER DEFAULT 1,
        is_blocked INTEGER DEFAULT 0,
        audio_description TEXT,
        FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
        FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE
    )
    """)

    # 5. Navigation Edges Table (Paths between nodes)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS navigation_edges (
        id TEXT PRIMARY KEY,
        from_node_id TEXT NOT NULL,
        to_node_id TEXT NOT NULL,
        distance_meters REAL NOT NULL,
        edge_type TEXT DEFAULT 'hallway', -- 'hallway', 'ramp', 'stairs', 'elevator'
        is_blocked INTEGER DEFAULT 0,
        is_accessible INTEGER DEFAULT 1,
        FOREIGN KEY (from_node_id) REFERENCES navigation_nodes(id) ON DELETE CASCADE,
        FOREIGN KEY (to_node_id) REFERENCES navigation_nodes(id) ON DELETE CASCADE
    )
    """)

    # 6. BLE Beacons Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS ble_beacons (
        id TEXT PRIMARY KEY,
        building_id TEXT NOT NULL,
        floor_id TEXT NOT NULL,
        uuid TEXT NOT NULL,
        major INTEGER NOT NULL,
        minor INTEGER NOT NULL,
        tx_power INTEGER DEFAULT -59,
        x REAL NOT NULL,
        y REAL NOT NULL,
        mac_address TEXT,
        status TEXT DEFAULT 'active',
        FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
        FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE
    )
    """)

    # 7. Facilities Table (Restrooms, water, reception, etc.)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS facilities (
        id TEXT PRIMARY KEY,
        building_id TEXT NOT NULL,
        floor_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        category TEXT NOT NULL, -- 'restroom_male', 'restroom_female', 'restroom_accessible', 'water', 'reception', 'canteen'
        name TEXT NOT NULL,
        details TEXT,
        FOREIGN KEY (node_id) REFERENCES navigation_nodes(id) ON DELETE CASCADE
    )
    """)

    # 8. Emergency Exits Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS emergency_exits (
        id TEXT PRIMARY KEY,
        building_id TEXT NOT NULL,
        floor_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        name TEXT NOT NULL,
        is_verified_safe INTEGER DEFAULT 1,
        status TEXT DEFAULT 'open',
        FOREIGN KEY (node_id) REFERENCES navigation_nodes(id) ON DELETE CASCADE
    )
    """)

    # 9. Obstacle Reports Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS obstacle_reports (
        id TEXT PRIMARY KEY,
        building_id TEXT NOT NULL,
        floor_id TEXT NOT NULL,
        node_id TEXT,
        x REAL,
        y REAL,
        obstacle_type TEXT NOT NULL, -- 'chair', 'box', 'person', 'wet_floor', 'construction'
        severity TEXT DEFAULT 'medium',
        reported_by TEXT DEFAULT 'ai_camera',
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 10. Navigation History Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS navigation_history (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        building_id TEXT,
        from_node_name TEXT,
        to_node_name TEXT,
        distance_meters REAL,
        duration_seconds REAL,
        status TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 11. System Logs Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS system_logs (
        id TEXT PRIMARY KEY,
        event_type TEXT,
        message TEXT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    conn.close()

def seed_sample_data():
    """Seeds the database with rich indoor building data for testing."""
    conn = get_connection()
    cursor = conn.cursor()

    # Check if data already exists
    cursor.execute("SELECT COUNT(*) FROM buildings")
    if cursor.fetchone()[0] > 0:
        conn.close()
        return

    # Seed Building 1: Engineering College Campus
    b1_id = "bld_college_01"
    cursor.execute("""
    INSERT INTO buildings (id, name, type, description, address, total_floors)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (b1_id, "Apex Engineering College - Main Academic Block", "College", "4-story educational building equipped with accessibility ramps, dual elevators, computer labs, and tactile floor guidance paths.", "Campus Road, Tech District", 2))

    # Floors for Building 1
    f1_id = "fl_college_ground"
    f2_id = "fl_college_first"
    cursor.execute("INSERT INTO floors (id, building_id, floor_number, floor_name, map_width, map_height) VALUES (?, ?, ?, ?, ?, ?)",
                   (f1_id, b1_id, 0, "Ground Floor", 120.0, 80.0))
    cursor.execute("INSERT INTO floors (id, building_id, floor_number, floor_name, map_width, map_height) VALUES (?, ?, ?, ?, ?, ?)",
                   (f2_id, b1_id, 1, "First Floor", 120.0, 80.0))

    # Ground Floor Nodes: Entrance, Reception, Corridors, Restrooms, Stairs, Elevator, Principal Office, Exits
    ground_nodes = [
        # id, building_id, floor_id, node_type, name, code, x, y, is_accessible, is_blocked, audio_description
        ("n_c_main_gate", b1_id, f1_id, "entrance", "Main Entrance", "ENT-01", 10.0, 40.0, 1, 0, "Main entrance gate with double sliding doors and tactile ramp."),
        ("n_c_lobby", b1_id, f1_id, "corridor", "Central Reception Lobby", "LOBBY", 25.0, 40.0, 1, 0, "Spacious central lobby. Help desk directly on right."),
        ("n_c_reception", b1_id, f1_id, "facility", "Visitor Information & Helpdesk", "REC-01", 25.0, 30.0, 1, 0, "Information counter with braille maps and audio directory."),
        ("n_c_corridor_west_1", b1_id, f1_id, "corridor", "West Corridor Junction 1", "COR-W1", 45.0, 40.0, 1, 0, "Corridor junction leading to Admin Wing and Elevators."),
        ("n_c_principal", b1_id, f1_id, "room", "Principal's Office", "ADM-101", 45.0, 20.0, 1, 0, "Principal's administrative chamber with tactile entrance signage."),
        ("n_c_admin_office", b1_id, f1_id, "room", "Student Affairs & Accounts", "ADM-102", 65.0, 20.0, 1, 0, "Student affairs office and fee counter."),
        ("n_c_corridor_center", b1_id, f1_id, "corridor", "Central Corridor Crossway", "COR-C1", 65.0, 40.0, 1, 0, "Central crossway. Restrooms to south, Labs to east."),
        ("n_c_elevator_gf", b1_id, f1_id, "elevator", "Accessible Elevator A (Ground)", "LIFT-A", 55.0, 50.0, 1, 0, "Dual-opening audio-announced elevator with braille buttons."),
        ("n_c_stairs_gf", b1_id, f1_id, "stairs", "North Staircase A (Ground)", "STAIR-A", 45.0, 60.0, 0, 0, "Flight of 18 steps with double handrails leading to Floor 1."),
        ("n_c_water_gf", b1_id, f1_id, "facility", "Purified Drinking Water Station", "WTR-01", 65.0, 50.0, 1, 0, "Sensor-activated drinking water cooler with bottle refill."),
        ("n_c_restroom_m_gf", b1_id, f1_id, "facility", "Men's Restroom (Ground)", "RR-M-GF", 75.0, 55.0, 1, 0, "Men's restroom equipped with tactile door marker."),
        ("n_c_restroom_f_gf", b1_id, f1_id, "facility", "Women's Restroom (Ground)", "RR-F-GF", 85.0, 55.0, 1, 0, "Women's restroom equipped with tactile door marker."),
        ("n_c_restroom_acc_gf", b1_id, f1_id, "facility", "Accessible Unisex Restroom", "RR-ACC-GF", 75.0, 40.0, 1, 0, "Fully accessible wide restroom with safety grab rails and emergency buzzer."),
        ("n_c_auditorium", b1_id, f1_id, "room", "Dr. Kalam Auditorium", "AUD-100", 95.0, 40.0, 1, 0, "Main college auditorium seating 500 people with ramp access."),
        ("n_c_emergency_exit_gf1", b1_id, f1_id, "exit", "North Emergency Fire Exit", "EXIT-N1", 10.0, 65.0, 1, 0, "North fire safety exit opening onto open campus ground."),
        ("n_c_emergency_exit_gf2", b1_id, f1_id, "exit", "South Emergency Fire Exit", "EXIT-S1", 110.0, 40.0, 1, 0, "East fire exit with crash bar opening to evacuation staging zone.")
    ]

    for n in ground_nodes:
        cursor.execute("""
        INSERT INTO navigation_nodes (id, building_id, floor_id, node_type, name, code, x, y, is_accessible, is_blocked, audio_description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, n)

    # First Floor Nodes: Labs, Classrooms, Stairs, Elevator, Emergency Exit
    first_floor_nodes = [
        ("n_c_elevator_ff", b1_id, f2_id, "elevator", "Accessible Elevator A (Floor 1)", "LIFT-A-F1", 55.0, 50.0, 1, 0, "Elevator lobby on first floor."),
        ("n_c_stairs_ff", b1_id, f2_id, "stairs", "North Staircase A (Floor 1)", "STAIR-A-F1", 45.0, 60.0, 0, 0, "First floor staircase landing."),
        ("n_c_corridor_f1_center", b1_id, f2_id, "corridor", "First Floor Main Corridor Center", "COR-F1-C", 55.0, 40.0, 1, 0, "Central first floor corridor."),
        ("n_c_corridor_f1_west", b1_id, f2_id, "corridor", "First Floor West Corridor", "COR-F1-W", 30.0, 40.0, 1, 0, "Corridor approaching Computer Laboratories."),
        ("n_c_corridor_f1_east", b1_id, f2_id, "corridor", "First Floor East Corridor", "COR-F1-E", 80.0, 40.0, 1, 0, "Corridor approaching Lecture Halls and Library."),
        ("n_c_complab_205", b1_id, f2_id, "room", "Computer Lab 205 (AI & Systems)", "LAB-205", 25.0, 25.0, 1, 0, "Advanced Computer Science Laboratory 205. Door opens inward with push pad."),
        ("n_c_complab_204", b1_id, f2_id, "room", "Computer Lab 204 (Data Science)", "LAB-204", 40.0, 25.0, 1, 0, "Data Science Laboratory 204."),
        ("n_c_room_201", b1_id, f2_id, "room", "Lecture Hall 201", "CR-201", 75.0, 25.0, 1, 0, "Classroom 201 equipped with assistive audio loop."),
        ("n_c_room_202", b1_id, f2_id, "room", "Lecture Hall 202", "CR-202", 90.0, 25.0, 1, 0, "Classroom 202."),
        ("n_c_library", b1_id, f2_id, "room", "Digital Central Library", "LIB-200", 100.0, 40.0, 1, 0, "Central library with braille section, audio books, and quiet reading areas."),
        ("n_c_restroom_f1", b1_id, f2_id, "facility", "Restroom Block Floor 1", "RR-F1", 55.0, 25.0, 1, 0, "Restroom facilities including accessible stall."),
        ("n_c_emergency_exit_ff", b1_id, f2_id, "exit", "First Floor Fire Escape Stairway", "EXIT-F1", 110.0, 40.0, 0, 0, "External metal fire escape stairs leading directly to ground level.")
    ]

    for n in first_floor_nodes:
        cursor.execute("""
        INSERT INTO navigation_nodes (id, building_id, floor_id, node_type, name, code, x, y, is_accessible, is_blocked, audio_description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, n)

    # Navigation Edges (Bidirectional corridors, ramps, elevator, stairs)
    edges = [
        # Ground Floor Edges
        ("e_01", "n_c_main_gate", "n_c_lobby", 15.0, "hallway", 0, 1),
        ("e_02", "n_c_lobby", "n_c_reception", 10.0, "hallway", 0, 1),
        ("e_03", "n_c_lobby", "n_c_corridor_west_1", 20.0, "hallway", 0, 1),
        ("e_04", "n_c_lobby", "n_c_emergency_exit_gf1", 28.0, "hallway", 0, 1),
        ("e_05", "n_c_corridor_west_1", "n_c_principal", 20.0, "hallway", 0, 1),
        ("e_06", "n_c_corridor_west_1", "n_c_elevator_gf", 14.0, "hallway", 0, 1),
        ("e_07", "n_c_corridor_west_1", "n_c_stairs_gf", 20.0, "hallway", 0, 0),
        ("e_08", "n_c_corridor_west_1", "n_c_corridor_center", 20.0, "hallway", 0, 1),
        ("e_09", "n_c_corridor_center", "n_c_admin_office", 20.0, "hallway", 0, 1),
        ("e_10", "n_c_corridor_center", "n_c_water_gf", 10.0, "hallway", 0, 1),
        ("e_11", "n_c_corridor_center", "n_c_restroom_acc_gf", 10.0, "hallway", 0, 1),
        ("e_12", "n_c_corridor_center", "n_c_restroom_m_gf", 18.0, "hallway", 0, 1),
        ("e_13", "n_c_restroom_m_gf", "n_c_restroom_f_gf", 10.0, "hallway", 0, 1),
        ("e_14", "n_c_corridor_center", "n_c_auditorium", 30.0, "hallway", 0, 1),
        ("e_15", "n_c_auditorium", "n_c_emergency_exit_gf2", 15.0, "hallway", 0, 1),

        # Vertical floor connectors (Elevator & Stairs connecting GF and FF)
        ("e_v_elevator", "n_c_elevator_gf", "n_c_elevator_ff", 4.0, "elevator", 0, 1),
        ("e_v_stairs", "n_c_stairs_gf", "n_c_stairs_ff", 6.0, "stairs", 0, 0),

        # First Floor Edges
        ("e_f_01", "n_c_elevator_ff", "n_c_corridor_f1_center", 10.0, "hallway", 0, 1),
        ("e_f_02", "n_c_stairs_ff", "n_c_corridor_f1_center", 22.0, "hallway", 0, 0),
        ("e_f_03", "n_c_corridor_f1_center", "n_c_restroom_f1", 15.0, "hallway", 0, 1),
        ("e_f_04", "n_c_corridor_f1_center", "n_c_corridor_f1_west", 25.0, "hallway", 0, 1),
        ("e_f_05", "n_c_corridor_f1_center", "n_c_corridor_f1_east", 25.0, "hallway", 0, 1),
        ("e_f_06", "n_c_corridor_f1_west", "n_c_complab_205", 16.0, "hallway", 0, 1),
        ("e_f_07", "n_c_corridor_f1_west", "n_c_complab_204", 18.0, "hallway", 0, 1),
        ("e_f_08", "n_c_corridor_f1_east", "n_c_room_201", 16.0, "hallway", 0, 1),
        ("e_f_09", "n_c_corridor_f1_east", "n_c_room_202", 18.0, "hallway", 0, 1),
        ("e_f_10", "n_c_corridor_f1_east", "n_c_library", 20.0, "hallway", 0, 1),
        ("e_f_11", "n_c_library", "n_c_emergency_exit_ff", 10.0, "hallway", 0, 0),
    ]

    for edge in edges:
        cursor.execute("""
        INSERT INTO navigation_edges (id, from_node_id, to_node_id, distance_meters, edge_type, is_blocked, is_accessible)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, edge)
        # Insert reverse edge for bidirectional corridors
        cursor.execute("""
        INSERT INTO navigation_edges (id, from_node_id, to_node_id, distance_meters, edge_type, is_blocked, is_accessible)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (f"{edge[0]}_rev", edge[2], edge[1], edge[3], edge[4], edge[5], edge[6]))

    # BLE Beacons for College Building
    beacons = [
        ("b_gf_01", b1_id, f1_id, "fda50693-a4e2-4fb1-afcf-c6eb07647825", 1, 101, -59, 10.0, 40.0, "E4:5F:01:23:AA:01", "active"), # Entrance
        ("b_gf_02", b1_id, f1_id, "fda50693-a4e2-4fb1-afcf-c6eb07647825", 1, 102, -59, 25.0, 40.0, "E4:5F:01:23:AA:02", "active"), # Lobby
        ("b_gf_03", b1_id, f1_id, "fda50693-a4e2-4fb1-afcf-c6eb07647825", 1, 103, -59, 45.0, 40.0, "E4:5F:01:23:AA:03", "active"), # West corridor
        ("b_gf_04", b1_id, f1_id, "fda50693-a4e2-4fb1-afcf-c6eb07647825", 1, 104, -59, 55.0, 50.0, "E4:5F:01:23:AA:04", "active"), # Elevator GF
        ("b_gf_05", b1_id, f1_id, "fda50693-a4e2-4fb1-afcf-c6eb07647825", 1, 105, -59, 65.0, 40.0, "E4:5F:01:23:AA:05", "active"), # Center corridor
        ("b_gf_06", b1_id, f1_id, "fda50693-a4e2-4fb1-afcf-c6eb07647825", 1, 106, -59, 95.0, 40.0, "E4:5F:01:23:AA:06", "active"), # Auditorium
        ("b_ff_01", b1_id, f2_id, "fda50693-a4e2-4fb1-afcf-c6eb07647825", 2, 201, -59, 55.0, 50.0, "E4:5F:01:23:BB:01", "active"), # Elevator FF
        ("b_ff_02", b1_id, f2_id, "fda50693-a4e2-4fb1-afcf-c6eb07647825", 2, 202, -59, 30.0, 40.0, "E4:5F:01:23:BB:02", "active"), # FF West
        ("b_ff_03", b1_id, f2_id, "fda50693-a4e2-4fb1-afcf-c6eb07647825", 2, 203, -59, 25.0, 25.0, "E4:5F:01:23:BB:03", "active"), # Lab 205
        ("b_ff_04", b1_id, f2_id, "fda50693-a4e2-4fb1-afcf-c6eb07647825", 2, 204, -59, 80.0, 40.0, "E4:5F:01:23:BB:04", "active"), # FF East
        ("b_ff_05", b1_id, f2_id, "fda50693-a4e2-4fb1-afcf-c6eb07647825", 2, 205, -59, 100.0, 40.0, "E4:5F:01:23:BB:05", "active"), # Library
    ]

    for b in beacons:
        cursor.execute("""
        INSERT INTO ble_beacons (id, building_id, floor_id, uuid, major, minor, tx_power, x, y, mac_address, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, b)

    # Facilities mapping
    facilities = [
        ("fac_1", b1_id, f1_id, "n_c_reception", "reception", "Main Reception Desk", "Staffed 8am-6pm. Braille assistance available."),
        ("fac_2", b1_id, f1_id, "n_c_restroom_m_gf", "restroom_male", "Men's Restroom Ground Floor", "3 cubicles, standard sinks."),
        ("fac_3", b1_id, f1_id, "n_c_restroom_f_gf", "restroom_female", "Women's Restroom Ground Floor", "4 cubicles, standard sinks."),
        ("fac_4", b1_id, f1_id, "n_c_restroom_acc_gf", "restroom_accessible", "Accessible Restroom (Unisex)", "Full wheelchair turning radius, tactile switches, emergency pull-cord."),
        ("fac_5", b1_id, f1_id, "n_c_water_gf", "water", "Drinking Water Station", "Filtered cold and ambient water dispenser."),
        ("fac_6", b1_id, f2_id, "n_c_restroom_f1", "restroom_accessible", "Floor 1 Accessible Restrooms", "Located opposite elevators.")
    ]

    for f in facilities:
        cursor.execute("""
        INSERT INTO facilities (id, building_id, floor_id, node_id, category, name, details)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, f)

    # Emergency Exits mapping
    emergencies = [
        ("em_1", b1_id, f1_id, "n_c_emergency_exit_gf1", "North Ground Fire Exit", 1, "open"),
        ("em_2", b1_id, f1_id, "n_c_emergency_exit_gf2", "East Ground Evacuation Exit", 1, "open"),
        ("em_3", b1_id, f2_id, "n_c_emergency_exit_ff", "First Floor Fire Stairs Exit", 1, "open")
    ]

    for em in emergencies:
        cursor.execute("""
        INSERT INTO emergency_exits (id, building_id, floor_id, node_id, name, is_verified_safe, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, em)

    # Seed Building 2: City General Hospital
    b2_id = "bld_hospital_02"
    cursor.execute("""
    INSERT INTO buildings (id, name, type, description, address, total_floors)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (b2_id, "CareCity Multi-Speciality Hospital", "Hospital", "Accredited medical centre with OPD clinics, diagnostic labs, emergency trauma ward, and pharmacy.", "Health Boulevard, Sector 4", 1))

    f_hosp_id = "fl_hosp_ground"
    cursor.execute("INSERT INTO floors (id, building_id, floor_number, floor_name, map_width, map_height) VALUES (?, ?, ?, ?, ?, ?)",
                   (f_hosp_id, b2_id, 0, "Ground Floor OPD & Emergency", 100.0, 70.0))

    hosp_nodes = [
        ("n_h_ent", b2_id, f_hosp_id, "entrance", "Ambulance & Main Entrance", "ENT-H", 10.0, 35.0, 1, 0, "Hospital main entrance with level threshold and automatic glass doors."),
        ("n_h_triage", b2_id, f_hosp_id, "corridor", "Triage & Reception Hall", "TRIAGE", 25.0, 35.0, 1, 0, "Patient check-in and emergency triage counter."),
        ("n_h_er", b2_id, f_hosp_id, "room", "Emergency Trauma Care", "ER-01", 25.0, 15.0, 1, 0, "Emergency and trauma treatment unit."),
        ("n_h_pharmacy", b2_id, f_hosp_id, "facility", "24/7 Outpatient Pharmacy", "PHARM", 45.0, 15.0, 1, 0, "Prescription dispensing counter with priority queue for visually impaired."),
        ("n_h_corridor_mid", b2_id, f_hosp_id, "corridor", "Central Clinical Hallway", "COR-H1", 50.0, 35.0, 1, 0, "Hallway connecting OPD consultation suites."),
        ("n_h_radiology", b2_id, f_hosp_id, "room", "Radiology, X-Ray & MRI", "RAD-01", 70.0, 15.0, 1, 0, "Imaging diagnostics department."),
        ("n_h_opd_clinic", b2_id, f_hosp_id, "room", "General Physician OPD Suite", "OPD-10", 70.0, 50.0, 1, 0, "Outpatient consultation cabins 1 through 6."),
        ("n_h_water", b2_id, f_hosp_id, "facility", "Sanitized Drinking Water", "WTR-H", 50.0, 45.0, 1, 0, "Accessible drinking water station."),
        ("n_h_wc_acc", b2_id, f_hosp_id, "facility", "Hospital Accessible Restroom", "RR-H-ACC", 35.0, 50.0, 1, 0, "Universal accessible restroom with pull cord alarm."),
        ("n_h_exit", b2_id, f_hosp_id, "exit", "Emergency Green Corridor Exit", "EXIT-H1", 90.0, 35.0, 1, 0, "Wide emergency exit leading to parking bay.")
    ]

    for n in hosp_nodes:
        cursor.execute("""
        INSERT INTO navigation_nodes (id, building_id, floor_id, node_type, name, code, x, y, is_accessible, is_blocked, audio_description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, n)

    hosp_edges = [
        ("eh_1", "n_h_ent", "n_h_triage", 15.0, "hallway", 0, 1),
        ("eh_2", "n_h_triage", "n_h_er", 20.0, "hallway", 0, 1),
        ("eh_3", "n_h_triage", "n_h_corridor_mid", 25.0, "hallway", 0, 1),
        ("eh_4", "n_h_corridor_mid", "n_h_pharmacy", 20.0, "hallway", 0, 1),
        ("eh_5", "n_h_corridor_mid", "n_h_radiology", 28.0, "hallway", 0, 1),
        ("eh_6", "n_h_corridor_mid", "n_h_opd_clinic", 25.0, "hallway", 0, 1),
        ("eh_7", "n_h_corridor_mid", "n_h_water", 10.0, "hallway", 0, 1),
        ("eh_8", "n_h_triage", "n_h_wc_acc", 18.0, "hallway", 0, 1),
        ("eh_9", "n_h_corridor_mid", "n_h_exit", 40.0, "hallway", 0, 1),
    ]

    for edge in hosp_edges:
        cursor.execute("""
        INSERT INTO navigation_edges (id, from_node_id, to_node_id, distance_meters, edge_type, is_blocked, is_accessible)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, edge)
        cursor.execute("""
        INSERT INTO navigation_edges (id, from_node_id, to_node_id, distance_meters, edge_type, is_blocked, is_accessible)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (f"{edge[0]}_rev", edge[2], edge[1], edge[3], edge[4], edge[5], edge[6]))

    # Seed Admin User
    cursor.execute("""
    INSERT INTO users (id, name, email, password_hash, role, preferred_language, accessibility_prefs)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, ("usr_admin_01", "System Administrator", "admin@smartnav.org", "admin123", "admin", "en", json.dumps({
        "voice_speed": 1.0,
        "voice_volume": 1.0,
        "vibration_enabled": True,
        "high_contrast": True,
        "avoid_stairs": False
    })))

    # Seed Guest User
    cursor.execute("""
    INSERT INTO users (id, name, email, password_hash, role, preferred_language, accessibility_prefs)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, ("usr_guest_01", "Guest Navigator", "guest@smartnav.local", "guest", "user", "en", json.dumps({
        "voice_speed": 0.9,
        "voice_volume": 1.0,
        "vibration_enabled": True,
        "high_contrast": True,
        "avoid_stairs": True
    })))

    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    seed_sample_data()
    print("Smart Indoor Nav database initialized and seeded successfully.")
