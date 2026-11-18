/* Sign in, account creation, guest mode and session handling. Also exposes icon(). */
(function () {
  window.icon = (n, c = "") => `<svg class="ic${c ? " " + c : ""}" aria-hidden="true"><use href="#i-${n}"/></svg>`;

  const KEY = "smartnav_session";
  const auth = { user: null, token: null, mode: "login" };
  window.auth = auth;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && s.token && s.user) { auth.user = s.user; auth.token = s.token; }
  } catch (e) {}

  const $ = (id) => document.getElementById(id);
  const say = (m) => { const l = $("screen-reader-live"); if (l) l.textContent = m; };

  function apply() {
    const u = auth.user;
    document.body.classList.toggle("is-admin", !!u && u.role === "admin");
    const line = $("account-line");
    if (line) line.textContent = !u || u.role === "guest" ? "Guest session" : `${u.name} (${u.email})`;
    if (window.app && u) window.app.userRole = u.role;
  }

  function save(user, token) {
    auth.user = user; auth.token = token;
    if (token) localStorage.setItem(KEY, JSON.stringify({ user, token }));
    else localStorage.removeItem(KEY);
    apply();
  }

  function showError(msg, field) {
    const box = $("auth-error");
    box.textContent = msg; box.hidden = false;
    say(msg);
    const el = $({ email: "auth-email", password: "auth-pass", name: "auth-name" }[field]);
    if (el) el.focus();
  }

  function setMode(mode) {
    auth.mode = mode;
    document.querySelectorAll("[data-auth-tab]").forEach((b) => {
      const on = b.dataset.authTab === mode;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on);
    });
    $("auth-name-row").hidden = mode !== "register";
    $("auth-submit-label").textContent = mode === "register" ? "Create account" : "Sign in";
    $("auth-pass").autocomplete = mode === "register" ? "new-password" : "current-password";
    $("auth-error").hidden = true;
  }

  async function submit(e) {
    e.preventDefault();
    const name = $("auth-name").value.trim(), email = $("auth-email").value.trim(), pw = $("auth-pass").value;
    if (auth.mode === "register" && !name) return showError("Enter your name.", "name");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showError("Enter a valid email address.", "email");
    if (!pw) return showError("Enter your password.", "password");
    if (auth.mode === "register" && pw.length < 8) return showError("Password must be at least 8 characters.", "password");

    const btn = $("auth-submit");
    btn.disabled = true; btn.setAttribute("aria-busy", "true");
    $("auth-error").hidden = true;
    try {
      const res = await fetch(`/api/auth/${auth.mode}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password: pw }),
      });
      const data = await res.json();
      if (!data.success) return showError(data.error || "Could not sign in. Try again.", data.field);
      save(data.user, data.token);
      $("auth-pass").value = "";
      const first = data.user.name.split(" ")[0];
      say(`Signed in as ${first}`);
      window.voiceEngine && window.voiceEngine.speak(`Welcome, ${first}.`);
      window.app.showScreen(auth.mode === "register" ? "screen-accessibility-setup" : "screen-home");
    } catch (err) {
      showError("Can't reach the server. Check your connection, or continue as a guest.");
    } finally {
      btn.disabled = false; btn.removeAttribute("aria-busy");
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-auth-tab]").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.authTab)));
    $("auth-form").addEventListener("submit", submit);
    $("auth-toggle-pw").addEventListener("click", (e) => {
      const input = $("auth-pass"), show = input.type === "password";
      input.type = show ? "text" : "password";
      e.currentTarget.innerHTML = icon(show ? "eye-off" : "eye");
      e.currentTarget.setAttribute("aria-pressed", show);
      e.currentTarget.setAttribute("aria-label", show ? "Hide password" : "Show password");
    });
    $("btn-guest").addEventListener("click", () => {
      save({ id: "guest", name: "Guest", email: "", role: "guest" }, null);
      window.app.showScreen("screen-accessibility-setup");
    });
    $("btn-signout").addEventListener("click", () => {
      save(null, null);
      document.body.classList.remove("is-admin");
      window.app.showScreen("screen-auth");
    });
    apply();
    // Re-check a stored session with the server; drop it if it has expired.
    if (auth.token) {
      fetch("/api/auth/me", { headers: { Authorization: "Bearer " + auth.token } })
        .then((r) => (r.status === 401 ? save(null, null) : null)).catch(() => {});
    }
  });
})();
