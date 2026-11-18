"""
Vercel serverless entrypoint for the Smart Indoor Nav API.

Reuses the original backend (server.py, database.py, graph_engine.py, positioning.py).
Vercel's filesystem is read-only except /tmp, so the bundled SQLite DB is copied to /tmp
on cold start. Reads are always consistent with the shipped data; admin writes
(block corridor, add node, reports, history) live only as long as the warm instance.
"""
import os
import shutil
import sys

BACKEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_backend")
sys.path.insert(0, BACKEND_DIR)

import database  # noqa: E402

_TMP_DB = "/tmp/smart_nav.db"
if not os.path.exists(_TMP_DB):
    shutil.copyfile(os.path.join(BACKEND_DIR, "smart_nav.db"), _TMP_DB)
database.DB_PATH = _TMP_DB
database.init_db()
database.seed_sample_data()

import server  # noqa: E402  (imports after DB_PATH is patched)


class handler(server.SmartNavRequestHandler):
    """Vercel looks for a `handler` class. Static files are served by Vercel from /public."""

    def do_GET(self):
        if not self.path.startswith("/api/"):
            self._send_json({"error": "Not found"}, 404)
            return
        super().do_GET()
