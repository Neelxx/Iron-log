import { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";

const PRESET_EXERCISES = [
  "Hack Squat","Hip Thrust","RDL","Leg Curl","Leg Extension",
  "Hip Adductor","Hyperextension","Bench Press","Incline DB Press",
  "Cable Fly","EZ Bar Curl","Deadlift","Pull-Up","Cable Crunch","Plank"
];

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}
function getTodayISO() { return new Date().toISOString().split("T")[0]; }
function pad(n) { return String(n).padStart(2, "0"); }
function fmtTime(sec) { return `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`; }

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [sessions, setSessions] = useState([]);
  const [view, setView] = useState("log");
  const [currentSession, setCurrentSession] = useState(null);
  const [sets, setSets] = useState([]);
  const [form, setForm] = useState({ exercise: "", sets: "", reps: "", weight: "", rest: "", rpe: "", notes: "" });
  const [customExercise, setCustomExercise] = useState("");
  const [graphExercise, setGraphExercise] = useState("");
  const [graphType, setGraphType] = useState("weight");
  const [toast, setToast] = useState("");

  // Independent countdown timer only
  const [cdMinutes, setCdMinutes] = useState("");
  const [cdSeconds, setCdSeconds] = useState("");
  const [cdTotal, setCdTotal] = useState(0);
  const [cdLeft, setCdLeft] = useState(0);
  const [cdRunning, setCdRunning] = useState(false);
  const [cdStarted, setCdStarted] = useState(false);
  const cdRef = useRef(null);

  const loadSessions = async (uid) => {
    try {
      const ref = doc(db, "users", uid, "data", "sessions");
      const snap = await getDoc(ref);
      if (snap.exists()) setSessions(snap.data().list || []);
    } catch {}
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) await loadSessions(u.uid);
      else setSessions([]);
    });
    return unsub;
  }, []);

  const persist = useCallback(async (s, u) => {
    if (!u) return;
    try {
      const ref = doc(db, "users", u.uid, "data", "sessions");
      await setDoc(ref, { list: s });
    } catch {}
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  async function handleAuth() {
    setAuthError(""); setAuthBusy(true);
    try {
      if (authMode === "register") {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (e) {
      const msgs = {
        "auth/email-already-in-use": "Email already registered.",
        "auth/invalid-email": "Invalid email address.",
        "auth/weak-password": "Password must be at least 6 characters.",
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Incorrect password.",
        "auth/invalid-credential": "Incorrect email or password.",
      };
      setAuthError(msgs[e.code] || "Something went wrong. Try again.");
    }
    setAuthBusy(false);
  }

  async function handleLogout() {
    try { await signOut(auth); setSessions([]); } catch {}
  }

  // Countdown timer tick
  useEffect(() => {
    if (cdRunning && cdLeft > 0) {
      cdRef.current = setInterval(() => {
        setCdLeft(t => { if (t <= 1) { clearInterval(cdRef.current); setCdRunning(false); return 0; } return t - 1; });
      }, 1000);
    }
    return () => clearInterval(cdRef.current);
  }, [cdRunning]); // eslint-disable-line

  function cdStart() {
    const total = (parseInt(cdMinutes) || 0) * 60 + (parseInt(cdSeconds) || 0);
    if (total <= 0) return;
    clearInterval(cdRef.current);
    setCdTotal(total); setCdLeft(total); setCdRunning(true); setCdStarted(true);
  }
  function cdToggle() { if (cdLeft === 0) return; setCdRunning(r => !r); }
  function cdReset() { clearInterval(cdRef.current); setCdRunning(false); setCdLeft(cdTotal); }
  function cdClear() { clearInterval(cdRef.current); setCdRunning(false); setCdLeft(0); setCdTotal(0); setCdStarted(false); setCdMinutes(""); setCdSeconds(""); }

  const cdProgress = cdTotal > 0 ? cdLeft / cdTotal : 0;
  const cdDone = cdStarted && cdLeft === 0;
  const R_LG = 90; const CIRC_LG = 2 * Math.PI * R_LG;

  const allExercises = [...new Set([...PRESET_EXERCISES, ...sessions.flatMap(s => s.sets.map(e => e.exercise))])].sort();

  function startSession() { setCurrentSession({ id: Date.now(), date: getTodayISO(), sets: [] }); setSets([]); setView("log"); }

  function addSet() {
    const ex = form.exercise === "__custom__" ? customExercise.trim() : form.exercise;
    if (!ex || !form.reps || !form.weight) { showToast("Exercise, reps & weight are required"); return; }
    const entry = { id: Date.now(), exercise: ex, sets: form.sets || "1", reps: Number(form.reps), weight: Number(form.weight), rest: form.rest, rpe: form.rpe, notes: form.notes };
    setSets(prev => [...prev, entry]);
    setForm(f => ({ ...f, reps: "", weight: "", rpe: "", notes: "" }));
    showToast("Set logged ✓");
  }

  function removeSet(id) { setSets(s => s.filter(x => x.id !== id)); }

  function finishSession() {
    if (!currentSession || sets.length === 0) { showToast("Log at least one set first"); return; }
    const session = { ...currentSession, sets };
    const updated = [session, ...sessions];
    setSessions(updated);
    persist(updated, user);
    setCurrentSession(null); setSets([]);
    setView("history"); showToast("Session saved ✓");
  }

  const graphData = (() => {
    if (!graphExercise) return [];
    return sessions.slice().reverse().map(s => {
      const m = s.sets.filter(e => e.exercise === graphExercise);
      if (!m.length) return null;
      return { date: formatDate(s.date), maxWeight: Math.max(...m.map(e => e.weight)), volume: m.reduce((a, e) => a + e.weight * e.reps * Number(e.sets || 1), 0), totalSets: m.reduce((a, e) => a + Number(e.sets || 1), 0) };
    }).filter(Boolean);
  })();

  const weeklyFrequency = (() => {
    const counts = {};
    sessions.forEach(s => {
      const d = new Date(s.date); const jan1 = new Date(d.getFullYear(), 0, 1);
      const key = `W${Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7)} '${String(d.getFullYear()).slice(2)}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).slice(-8).map(([week, count]) => ({ week, count }));
  })();

  const prData = (() => {
    const prs = {};
    sessions.slice().reverse().forEach(s => { s.sets.forEach(e => { if (!prs[e.exercise] || e.weight > prs[e.exercise].weight) prs[e.exercise] = { exercise: e.exercise, weight: e.weight, date: formatDate(s.date) }; }); });
    return Object.values(prs).sort((a, b) => b.weight - a.weight).slice(0, 10);
  })();

  const chartColor = "#e8ff4a"; const chartColor2 = "#4af0e8";

  const RPE_COLORS = { 1:"#2a4a2a", 2:"#2a4a2a", 3:"#3a5a2a", 4:"#4a6a2a", 5:"#6a7a2a", 6:"#8a7a1a", 7:"#aa6a0a", 8:"#c85010", 9:"#e03008", 10:"#ff1010" };

  if (authLoading) return (
    <div style={{ background: "#0d0d0d", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&display=swap');`}</style>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, color: "#2a2a2a", letterSpacing: "0.1em" }}>IRON LOG</div>
    </div>
  );

  if (!user) return (
    <div style={{ fontFamily: "'DM Mono', monospace", background: "#0d0d0d", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#f0f0f0", padding: "20px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        * { box-sizing: border-box; }
        input { background: #1a1a1a; border: 1px solid #2a2a2a; color: #f0f0f0; font-family: 'DM Mono', monospace; font-size: 13px; padding: 10px 14px; border-radius: 4px; width: 100%; outline: none; transition: border 0.2s; }
        input:focus { border-color: #e8ff4a; }
      `}</style>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: "0.1em", marginBottom: 6 }}>IRON LOG</div>
      <div style={{ fontSize: 10, color: "#333", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 40 }}>Workout Tracker</div>
      <div style={{ width: "100%", maxWidth: 340 }}>
        <div style={{ display: "flex", marginBottom: 24, borderBottom: "1px solid #1e1e1e" }}>
          {["login","register"].map(m => (
            <button key={m} onClick={() => { setAuthMode(m); setAuthError(""); }} style={{ flex: 1, background: "none", border: "none", color: authMode === m ? "#e8ff4a" : "#444", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", padding: "10px", cursor: "pointer", borderBottom: authMode === m ? "1px solid #e8ff4a" : "1px solid transparent", marginBottom: "-1px" }}>
              {m === "login" ? "Sign In" : "Register"}
            </button>
          ))}
        </div>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>Email</div>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={e => e.key === "Enter" && handleAuth()} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>Password</div>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" onKeyDown={e => e.key === "Enter" && handleAuth()} />
        </div>
        {authError && <div style={{ fontSize: 11, color: "#ff4a4a", marginBottom: 14, textAlign: "center" }}>{authError}</div>}
        <button onClick={handleAuth} disabled={authBusy} style={{ width: "100%", background: "#e8ff4a", color: "#0d0d0d", border: "none", padding: "12px", fontSize: 12, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", borderRadius: "3px", cursor: "pointer", opacity: authBusy ? 0.6 : 1 }}>
          {authBusy ? "Please wait…" : authMode === "login" ? "Sign In" : "Create Account"}
        </button>
        <div style={{ fontSize: 10, color: "#222", marginTop: 20, textAlign: "center", letterSpacing: "0.08em" }}>Your data is private and encrypted</div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'DM Mono', monospace", background: "#0d0d0d", minHeight: "100vh", color: "#f0f0f0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #111; } ::-webkit-scrollbar-thumb { background: #333; }
        input, select { background: #1a1a1a; border: 1px solid #2a2a2a; color: #f0f0f0; font-family: inherit; font-size: 13px; padding: 8px 10px; border-radius: 4px; width: 100%; outline: none; transition: border 0.2s; }
        input:focus, select:focus { border-color: #e8ff4a; }
        select option { background: #1a1a1a; }
        button { cursor: pointer; font-family: inherit; transition: all 0.15s; }
        .nav-btn { background: none; border: none; color: #666; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; padding: 10px 16px; }
        .nav-btn.active { color: #e8ff4a; border-bottom: 1px solid #e8ff4a; }
        .nav-btn:hover { color: #ddd; }
        .primary-btn { background: #e8ff4a; color: #0d0d0d; border: none; padding: 10px 22px; font-size: 12px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 3px; }
        .primary-btn:hover { background: #fff566; }
        .ghost-btn { background: none; border: 1px solid #2a2a2a; color: #aaa; padding: 8px 16px; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 3px; }
        .ghost-btn:hover { border-color: #555; color: #ddd; }
        .danger-btn { background: none; border: none; color: #555; font-size: 18px; padding: 4px 8px; }
        .danger-btn:hover { color: #ff4a4a; }
        .card { background: #141414; border: 1px solid #1e1e1e; border-radius: 6px; padding: 20px; margin-bottom: 16px; }
        .label { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #555; margin-bottom: 5px; }
        .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #e8ff4a; color: #0d0d0d; padding: 10px 22px; border-radius: 3px; font-size: 12px; font-weight: 500; letter-spacing: 0.06em; z-index: 999; animation: fadeup 0.3s ease; }
        @keyframes fadeup { from { opacity:0; transform: translateX(-50%) translateY(8px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .set-row { display: flex; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid #1a1a1a; }
        .ex-name { font-size: 12px; font-weight: 500; color: #e8ff4a; }
        .set-meta { font-size: 11px; color: #666; }
        .graph-tab { background: none; border: 1px solid #222; color: #555; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 14px; border-radius: 2px; margin-right: 6px; margin-bottom: 6px; }
        .graph-tab.active { border-color: #e8ff4a; color: #e8ff4a; }
        .pr-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #161616; }
        .pr-ex { font-size: 12px; color: #ccc; }
        .pr-weight { font-size: 14px; font-family: 'Bebas Neue', sans-serif; color: #e8ff4a; letter-spacing: 0.06em; }
        .pr-date { font-size: 10px; color: #444; }
        .session-card { border-left: 2px solid #222; padding-left: 14px; margin-bottom: 14px; }
        .session-date { font-size: 11px; color: #555; letter-spacing: 0.08em; margin-bottom: 6px; }
        .session-ex { font-size: 12px; color: #ccc; margin-bottom: 2px; }
        .volume-pill { display: inline-block; background: #1a1a1a; color: #666; font-size: 10px; padding: 2px 8px; border-radius: 10px; }
        .header-title { font-family: 'Bebas Neue', sans-serif; font-size: 28px; letter-spacing: 0.08em; color: #f0f0f0; line-height: 1; }
        .ring-transition { transition: stroke-dasharray 0.9s linear; }
        .timer-ctrl { background: none; border: 1px solid #2a2a2a; color: #aaa; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; padding: 8px 18px; border-radius: 3px; }
        .timer-ctrl:hover { border-color: #555; color: #ddd; }
        .timer-ctrl.accent { border-color: #e8ff4a44; color: #e8ff4a; }
        .timer-ctrl.accent:hover { border-color: #e8ff4a; background: #e8ff4a11; }
        .quick-rest { background: #1a1a1a; border: 1px solid #2a2a2a; color: #666; font-size: 10px; padding: 4px 10px; border-radius: 2px; white-space: nowrap; }
        .quick-rest:hover { border-color: #e8ff4a; color: #e8ff4a; }
        .cd-input { background: #0d0d0d; border: 1px solid #2a2a2a; color: #f0f0f0; font-family: 'Bebas Neue', sans-serif; font-size: 52px; letter-spacing: 0.04em; text-align: center; padding: 8px 0; border-radius: 6px; width: 100%; outline: none; -moz-appearance: textfield; }
        .cd-input::-webkit-outer-spin-button, .cd-input::-webkit-inner-spin-button { -webkit-appearance: none; }
        .quick-cd { background: #141414; border: 1px solid #1e1e1e; color: #555; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; padding: 8px 0; border-radius: 3px; flex: 1; text-align: center; }
        .quick-cd:hover { border-color: #333; color: #aaa; }
        .rpe-btn { background: #1a1a1a; border: 1px solid #2a2a2a; color: #666; font-size: 11px; padding: 6px 0; border-radius: 3px; flex: 1; text-align: center; }
        .rpe-btn.selected { color: #0d0d0d; border-color: transparent; font-weight: 500; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.25; } }
        .done-pulse { animation: pulse 0.8s infinite; }
        @keyframes glow { 0%,100% { filter: drop-shadow(0 0 6px #e8ff4a66); } 50% { filter: drop-shadow(0 0 18px #e8ff4aaa); } }
        .ring-glow { animation: glow 1.6s ease-in-out infinite; }
      `}</style>

      <div style={{ borderBottom: "1px solid #1a1a1a", padding: "18px 20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
          <div>
            <div className="header-title">IRON LOG</div>
            <div style={{ fontSize: 10, color: "#444", letterSpacing: "0.1em", marginTop: 2 }}>{user.email}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {!currentSession
              ? <button className="primary-btn" onClick={startSession}>+ New Session</button>
              : <>
                  <button className="ghost-btn" onClick={() => { setCurrentSession(null); setSets([]); }}>Discard</button>
                  <button className="primary-btn" onClick={finishSession}>Save Session</button>
                </>
            }
            <button className="ghost-btn" onClick={handleLogout} style={{ fontSize: 10 }}>Sign out</button>
          </div>
        </div>
        <div>
          {["log","timer","history","graphs"].map(t => (
            <button key={t} className={`nav-btn ${view === t ? "active" : ""}`} onClick={() => setView(t)}>
              {t === "log" ? "Log" : t === "timer" ? "Timer" : t === "history" ? "History" : "Graphs"}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "20px", maxWidth: 680, margin: "0 auto" }}>

        {/* LOG */}
        {view === "log" && (
          <>
            {!currentSession ? (
              <div style={{ textAlign: "center", padding: "60px 20px", color: "#333" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>◈</div>
                <div style={{ fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase" }}>No active session</div>
                <div style={{ fontSize: 11, color: "#222", marginTop: 6 }}>Press + New Session to begin</div>
              </div>
            ) : (
              <>
                <div className="card">
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 14, letterSpacing: "0.08em" }}>
                    SESSION · {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" }).toUpperCase()}
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <div className="label">Exercise</div>
                    <select value={form.exercise} onChange={e => setForm(f => ({ ...f, exercise: e.target.value }))}>
                      <option value="">— Select —</option>
                      {allExercises.map(ex => <option key={ex} value={ex}>{ex}</option>)}
                      <option value="__custom__">+ Custom exercise…</option>
                    </select>
                  </div>
                  {form.exercise === "__custom__" && (
                    <div style={{ marginBottom: 10 }}>
                      <div className="label">Custom Exercise Name</div>
                      <input value={customExercise} onChange={e => setCustomExercise(e.target.value)} placeholder="e.g. Romanian Split Squat" />
                    </div>
                  )}
                  <div className="grid3" style={{ marginBottom: 10 }}>
                    <div><div className="label">Sets</div><input type="number" min="1" value={form.sets} onChange={e => setForm(f => ({ ...f, sets: e.target.value }))} placeholder="3" /></div>
                    <div><div className="label">Reps</div><input type="number" min="1" value={form.reps} onChange={e => setForm(f => ({ ...f, reps: e.target.value }))} placeholder="8" /></div>
                    <div><div className="label">Weight (kg/lbs)</div><input type="number" min="0" step="0.5" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} placeholder="60" /></div>
                  </div>
                  <div className="grid2" style={{ marginBottom: 10 }}>
                    <div>
                      <div className="label">Rest (sec)</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <input type="number" min="0" value={form.rest} onChange={e => setForm(f => ({ ...f, rest: e.target.value }))} placeholder="120" style={{ flex: "1 1 60px" }} />
                        {[60, 90, 120, 180].map(s => <button key={s} className="quick-rest" onClick={() => setForm(f => ({ ...f, rest: String(s) }))}>{s}s</button>)}
                      </div>
                    </div>
                    <div>
                      <div className="label">RPE (1–10)</div>
                      <input type="number" min="1" max="10" step="0.5" value={form.rpe} onChange={e => setForm(f => ({ ...f, rpe: e.target.value }))} placeholder="7" />
                    </div>
                  </div>

                  {/* RPE visual selector */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {[1,2,3,4,5,6,7,8,9,10].map(n => (
                        <button key={n} className={`rpe-btn ${form.rpe == n ? "selected" : ""}`}
                          style={{ background: form.rpe == n ? RPE_COLORS[n] : "#1a1a1a", borderColor: form.rpe == n ? RPE_COLORS[n] : "#2a2a2a", color: form.rpe == n ? "#fff" : "#555" }}
                          onClick={() => setForm(f => ({ ...f, rpe: form.rpe == n ? "" : String(n) }))}>
                          {n}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 9, color: "#333", marginTop: 4, letterSpacing: "0.08em" }}>
                      {form.rpe ? ["","Very Easy","Easy","Moderate","Somewhat Hard","Hard","Hard","Very Hard","Very Hard","Max Effort","Absolute Max"][Math.round(Number(form.rpe))] : "Tap to set RPE"}
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div className="label">Notes</div>
                    <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. slight lower back tightness" />
                  </div>
                  <button className="primary-btn" style={{ width: "100%" }} onClick={addSet}>Log Set</button>
                </div>

                {sets.length > 0 && (
                  <div className="card">
                    <div className="label" style={{ marginBottom: 10 }}>This Session ({sets.length} entries)</div>
                    {sets.map((s, i) => (
                      <div key={s.id} className="set-row">
                        <div style={{ fontSize: 10, color: "#333", width: 18 }}>{i + 1}</div>
                        <div style={{ flex: 1 }}>
                          <div className="ex-name">{s.exercise}</div>
                          <div className="set-meta">
                            {s.sets}×{s.reps} @ {s.weight}
                            {s.rest ? ` · ${s.rest}s rest` : ""}
                            {s.rpe ? <span style={{ marginLeft: 6, background: RPE_COLORS[Math.round(Number(s.rpe))], color: "#fff", fontSize: 9, padding: "1px 6px", borderRadius: 2 }}>RPE {s.rpe}</span> : ""}
                          </div>
                          {s.notes && <div style={{ fontSize: 10, color: "#444", marginTop: 2 }}>{s.notes}</div>}
                        </div>
                        <button className="danger-btn" onClick={() => removeSet(s.id)}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* TIMER */}
        {view === "timer" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 32 }}>
            <div style={{ position: "relative", width: 220, height: 220, marginBottom: 32 }}>
              <svg width="220" height="220" style={{ transform: "rotate(-90deg)" }} className={cdRunning ? "ring-glow" : ""}>
                <circle cx="110" cy="110" r={R_LG} fill="none" stroke="#1a1a1a" strokeWidth="8" />
                <circle cx="110" cy="110" r={R_LG} fill="none"
                  stroke={cdDone ? "#ff4a4a" : cdStarted ? "#e8ff4a" : "#2a2a2a"}
                  strokeWidth="8"
                  strokeDasharray={cdStarted ? `${cdProgress * CIRC_LG} ${CIRC_LG}` : `0 ${CIRC_LG}`}
                  strokeLinecap="round" className="ring-transition"
                />
              </svg>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                {!cdStarted ? (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#333", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>Set duration</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <input className="cd-input" type="number" min="0" max="99" value={cdMinutes} onChange={e => setCdMinutes(e.target.value)} placeholder="00" style={{ width: 90 }} />
                      <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 40, color: "#333" }}>:</span>
                      <input className="cd-input" type="number" min="0" max="59" value={cdSeconds} onChange={e => setCdSeconds(e.target.value)} placeholder="00" style={{ width: 90 }} />
                    </div>
                    <div style={{ fontSize: 9, color: "#2a2a2a", letterSpacing: "0.1em", marginTop: 6 }}>MM : SS</div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 52, letterSpacing: "0.04em", color: cdDone ? "#ff4a4a" : "#f0f0f0", lineHeight: 1 }} className={cdDone ? "done-pulse" : ""}>
                      {cdDone ? "DONE" : fmtTime(cdLeft)}
                    </div>
                    {!cdDone && <div style={{ fontSize: 10, color: "#333", letterSpacing: "0.1em", marginTop: 4 }}>of {fmtTime(cdTotal)}</div>}
                  </div>
                )}
              </div>
            </div>
            {!cdStarted && (
              <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 360, marginBottom: 20 }}>
                {[1,2,3,5,10].map(m => (
                  <button key={m} className="quick-cd" onClick={() => { setCdMinutes(String(m)); setCdSeconds("0"); }}>{m}m</button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
              {!cdStarted
                ? <button className="timer-ctrl accent" onClick={cdStart} style={{ padding: "10px 40px", fontSize: 12 }}>▶ Start</button>
                : <>
                    {!cdDone && <button className="timer-ctrl accent" onClick={cdToggle}>{cdRunning ? "⏸ Pause" : "▶ Resume"}</button>}
                    <button className="timer-ctrl" onClick={cdReset}>↺ Reset</button>
                    <button className="timer-ctrl" onClick={cdClear}>✕ Clear</button>
                  </>
              }
            </div>
          </div>
        )}

        {/* HISTORY */}
        {view === "history" && (
          sessions.length === 0
            ? <div style={{ textAlign: "center", padding: "60px 20px", color: "#333", fontSize: 13, letterSpacing: "0.1em", textTransform: "uppercase" }}>No sessions yet</div>
            : sessions.map(s => {
                const vol = s.sets.reduce((a, e) => a + e.weight * e.reps * Number(e.sets || 1), 0);
                const exList = [...new Set(s.sets.map(e => e.exercise))];
                return (
                  <div key={s.id} className="session-card">
                    <div className="session-date">{new Date(s.date).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).toUpperCase()}</div>
                    {exList.map(ex => {
                      const exSets = s.sets.filter(e => e.exercise === ex);
                      return (
                        <div key={ex} className="session-ex">
                          <span style={{ color: "#e8ff4a" }}>{ex}</span>
                          <span style={{ color: "#444", fontSize: 11 }}> · {exSets.length} entr{exSets.length === 1 ? "y" : "ies"} · top {Math.max(...exSets.map(e => e.weight))}</span>
                        </div>
                      );
                    })}
                    <div style={{ marginTop: 6 }}><span className="volume-pill">Total volume: {vol.toLocaleString()}</span></div>
                  </div>
                );
              })
        )}

        {/* GRAPHS */}
        {view === "graphs" && (
          <>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="label" style={{ marginBottom: 10 }}>Personal Records</div>
              {prData.length === 0
                ? <div style={{ color: "#333", fontSize: 12 }}>Log sessions to see PRs</div>
                : prData.map(p => (
                  <div key={p.exercise} className="pr-row">
                    <div className="pr-ex">{p.exercise}</div>
                    <div style={{ textAlign: "right" }}>
                      <div className="pr-weight">{p.weight}</div>
                      <div className="pr-date">{p.date}</div>
                    </div>
                  </div>
                ))
              }
            </div>
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="label" style={{ marginBottom: 10 }}>Weekly Session Frequency</div>
              {weeklyFrequency.length < 2
                ? <div style={{ color: "#333", fontSize: 12 }}>Log more sessions to see trend</div>
                : <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={weeklyFrequency}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                      <XAxis dataKey="week" tick={{ fill: "#444", fontSize: 10 }} />
                      <YAxis tick={{ fill: "#444", fontSize: 10 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#f0f0f0", fontSize: 11 }} />
                      <Bar dataKey="count" fill={chartColor} radius={[2, 2, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
              }
            </div>
            <div className="card">
              <div className="label" style={{ marginBottom: 10 }}>Exercise Progress</div>
              <div style={{ marginBottom: 12 }}>
                <select value={graphExercise} onChange={e => setGraphExercise(e.target.value)}>
                  <option value="">— Select exercise —</option>
                  {allExercises.filter(ex => sessions.some(s => s.sets.some(e => e.exercise === ex))).map(ex => (
                    <option key={ex} value={ex}>{ex}</option>
                  ))}
                </select>
              </div>
              {graphExercise && (
                <>
                  <div style={{ marginBottom: 14 }}>
                    {["weight","volume","sets"].map(t => (
                      <button key={t} className={`graph-tab ${graphType === t ? "active" : ""}`} onClick={() => setGraphType(t)}>
                        {t === "weight" ? "Max Weight" : t === "volume" ? "Volume" : "Total Sets"}
                      </button>
                    ))}
                  </div>
                  {graphData.length < 2
                    ? <div style={{ color: "#333", fontSize: 12 }}>Log {graphExercise} in more sessions to see trend</div>
                    : <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={graphData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e1e1e" />
                          <XAxis dataKey="date" tick={{ fill: "#444", fontSize: 10 }} />
                          <YAxis tick={{ fill: "#444", fontSize: 10 }} />
                          <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #2a2a2a", color: "#f0f0f0", fontSize: 11 }} />
                          <Line type="monotone"
                            dataKey={graphType === "weight" ? "maxWeight" : graphType === "volume" ? "volume" : "totalSets"}
                            stroke={graphType === "volume" ? chartColor2 : chartColor}
                            strokeWidth={2} dot={{ fill: graphType === "volume" ? chartColor2 : chartColor, r: 3 }} activeDot={{ r: 5 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                  }
                </>
              )}
            </div>
          </>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default App;