import React, { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertCircle, ArrowDownToLine, Bell, Check, CheckCircle2, ChevronDown,
  CircleHelp, Clock3, Database, FileUp, Filter, LayoutDashboard, LogOut, Menu,
  MessageCircle, Plus, RefreshCw, Search, Send, ShieldCheck, Smartphone, Trash2,
  Users, X
} from "lucide-react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp,
  updateDoc, writeBatch
} from "firebase/firestore";

const NUMBERS = "number_operations_numbers";
const EVENTS = "number_operations_activity";
const statuses = [
  { value: "queued", label: "Queued" },
  { value: "owner_confirmed", label: "Owner confirmed" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" }
];
const statusLabel = v => statuses.find(s => s.value === v)?.label || v;
const stamp = v => v?.toDate ? v.toDate().toLocaleString() : "Just now";
const cleanPhone = v => String(v || "").trim().replace(/[\\s().-]/g, "");
const validPhone = v => /^\\+[1-9]\\d{7,14}$/.test(v);
const initials = email => (email || "A").slice(0, 1).toUpperCase();

function App() {
  const [user, setUser] = useState(undefined);
  const [rows, setRows] = useState([]);
  const [events, setEvents] = useState([]);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [busy, setBusy] = useState(false);
  const [queryText, setQueryText] = useState("");
  const [filter, setFilter] = useState("all");
  const [showImport, setShowImport] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [toast, setToast] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newNote, setNewNote] = useState("");
  const [importText, setImportText] = useState("");
  const [importReport, setImportReport] = useState(null);
  const [telegramState, setTelegramState] = useState("idle");

  useEffect(() => onAuthStateChanged(auth, setUser), []);
  useEffect(() => {
    if (!user) { setRows([]); setEvents([]); return; }
    const q1 = query(collection(db, NUMBERS), orderBy("createdAt", "desc"));
    const q2 = query(collection(db, EVENTS), orderBy("createdAt", "desc"));
    const unsub1 = onSnapshot(q1, snap => setRows(snap.docs.map(d => ({ id: d.id, ...d.data() }))), e => flash(e.message));
    const unsub2 = onSnapshot(q2, snap => setEvents(snap.docs.slice(0, 40).map(d => ({ id: d.id, ...d.data() }))), e => flash(e.message));
    return () => { unsub1(); unsub2(); };
  }, [user]);

  function flash(message) { setToast(message); setTimeout(() => setToast(""), 4200); }
  async function audit(event, details, phone = "") {
    await addDoc(collection(db, EVENTS), { event, details, phone, actor: user?.email || "", createdAt: serverTimestamp() });
  }
  async function telegramNotice(message) {
    try {
      setTelegramState("sending");
      const idToken = await user.getIdToken();
      const r = await fetch("/api/telegram/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ message })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Telegram notification failed");
      setTelegramState(data.sent ? "sent" : "not-configured");
    } catch (e) { setTelegramState("error"); console.warn(e); }
  }
  async function submitAuth(e) {
    e.preventDefault(); setBusy(true); setAuthError("");
    try {
      if (authMode === "signup") await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    } catch (e) { setAuthError(e.message.replace("Firebase:", "").trim()); }
    finally { setBusy(false); }
  }
  async function addNumber(e) {
    e.preventDefault(); const phone = cleanPhone(newPhone);
    if (!validPhone(phone)) return flash("Enter a valid international number, e.g. +2348012345678.");
    setBusy(true);
    try {
      await addDoc(collection(db, NUMBERS), { phone, status: "queued", note: newNote.trim(), createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ownerConsentConfirmed: false });
      await audit("number_added", "Number added to tracking queue", phone);
      await telegramNotice(`NumberOps: a number was added to the owner-consented onboarding tracker (${phone}).`);
      setNewPhone(""); setNewNote(""); setShowAdd(false); flash("Number added.");
    } catch (e) { flash(e.message); } finally { setBusy(false); }
  }
  function parseImport(raw) {
    return [...new Set(raw.split(/\\r?\\n/).map(line => cleanPhone(line.split(/[;,\\t]/)[0])).filter(validPhone))];
  }
  async function doImport() {
    const phones = parseImport(importText);
    if (!phones.length) return flash("No valid E.164 phone numbers found.");
    setBusy(true); let added = 0; let skipped = 0;
    try {
      // Firestore write batches are capped at 500 operations; use 400 to leave room.
      for (let i = 0; i < phones.length; i += 400) {
        const batch = writeBatch(db);
        for (const phone of phones.slice(i, i + 400)) {
          const ref = doc(collection(db, NUMBERS));
          batch.set(ref, { phone, status: "queued", note: "Bulk imported; owner confirmation pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ownerConsentConfirmed: false });
        }
        await batch.commit(); added += phones.slice(i, i + 400).length;
      }
      await audit("bulk_import", `${added} valid unique numbers imported`);
      await telegramNotice(`NumberOps: ${added} phone number records were bulk imported. Owner confirmation is pending.`);
      setImportReport({ added, invalidOrDuplicate: importText.split(/\\r?\\n/).filter(Boolean).length - phones.length });
      setImportText(""); flash(`${added} records imported.`);
    } catch (e) { flash(e.message); }
    finally { setBusy(false); }
  }
  async function changeStatus(row, status, note = row.note || "") {
    try {
      await updateDoc(doc(db, NUMBERS, row.id), { status, note, updatedAt: serverTimestamp() });
      await audit("status_updated", `${statusLabel(status)} · ${note}`.trim(), row.phone);
      await telegramNotice(`NumberOps update: ${row.phone} status is now ${statusLabel(status)}.`);
      flash("Record updated.");
    } catch (e) { flash(e.message); }
  }
  async function removeRow(row) {
    if (!confirm(`Delete record ${row.phone}?`)) return;
    try { await deleteDoc(doc(db, NUMBERS, row.id)); await audit("record_deleted", "Number record deleted", row.phone); flash("Record deleted."); }
    catch (e) { flash(e.message); }
  }
  const filtered = useMemo(() => rows.filter(r => {
    const matchesText = `${r.phone} ${r.note || ""}`.toLowerCase().includes(queryText.toLowerCase());
    return matchesText && (filter === "all" || r.status === filter);
  }), [rows, queryText, filter]);
  const stats = useMemo(() => ({
    total: rows.length, queued: rows.filter(r => r.status === "queued").length,
    owner_confirmed: rows.filter(r => r.status === "owner_confirmed").length,
    completed: rows.filter(r => r.status === "completed").length,
    failed: rows.filter(r => r.status === "failed").length
  }), [rows]);
  function exportCsv() {
    const esc = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = ["phone,status,note,created_at", ...filtered.map(r => [r.phone,r.status,r.note,stamp(r.createdAt)].map(esc).join(","))].join("\\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], {type:"text/csv"})); a.download = "numberops-export.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  if (user === undefined) return <div className="loading-screen"><div className="brand-mark">N</div><p>Initializing secure workspace…</p></div>;
  if (!user) return <div className="auth-page"><div className="auth-glow"/><div className="auth-card">
    <div className="brand-mark">N</div><div className="eyebrow">NUMBER OPERATIONS PLATFORM</div><h1>{authMode === "login" ? "Welcome back." : "Create admin access."}</h1>
    <p className="muted">Secure, owner-consented number onboarding tracker.</p>
    <form onSubmit={submitAuth}><label>Email address</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="admin@example.com" required/><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength="6" placeholder="At least 6 characters" required/><button className="primary full" disabled={busy}>{busy ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"}</button></form>
    {authError && <div className="error-line"><AlertCircle size={15}/>{authError}</div>}
    <button className="text-button" onClick={()=>{setAuthMode(authMode==="login"?"signup":"login");setAuthError("");}}>{authMode==="login"?"Need an admin account? Create one":"Already registered? Sign in"}</button>
    <div className="auth-foot"><ShieldCheck size={14}/> Protected by Firebase Authentication</div>
  </div></div>;

  return <div className="app-shell">
    <aside className={`sidebar ${showMobileNav?"open":""}`}>
      <div className="side-brand"><div className="brand-mark small">N</div><div><b>NumberOps</b><span>CONTROL CENTER</span></div><button className="icon-btn mobile-close" onClick={()=>setShowMobileNav(false)}><X/></button></div>
      <div className="nav-label">WORKSPACE</div><div className="nav-item active"><LayoutDashboard size={17}/> Overview</div>
      <div className="nav-item"><Smartphone size={17}/> Number records <span className="nav-count">{rows.length}</span></div>
      <div className="nav-item"><Activity size={17}/> Activity log</div>
      <div className="nav-label">SYSTEM</div><div className="nav-item"><MessageCircle size={17}/> Telegram alerts <span className={`tiny-dot ${telegramState==="sent"?"green":""}`}/></div>
      <div className="sidebar-bottom"><div className="secure-card"><ShieldCheck size={18}/><b>Security active</b><p>Authentication is managed by Firebase.</p></div><div className="user-card"><div className="avatar">{initials(user.email)}</div><div className="user-meta"><b>{user.email}</b><span>Administrator</span></div><button className="icon-btn" title="Sign out" onClick={()=>signOut(auth)}><LogOut size={17}/></button></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><button className="icon-btn menu-btn" onClick={()=>setShowMobileNav(true)}><Menu/></button><div className="crumb">Workspace <span>/</span> Overview</div><div className="top-actions"><span className="live-indicator"><i/> LIVE DATABASE</span><button className="icon-btn" title="Refresh" onClick={()=>window.location.reload()}><RefreshCw size={17}/></button><div className="avatar">{initials(user.email)}</div></div></header>
      <div className="content">
        <div className="page-heading"><div><div className="eyebrow">OPERATIONS / DASHBOARD</div><h1>Good to see you.</h1><p>Monitor authorized onboarding records and operational activity.</p></div><div className="heading-actions"><button className="btn-secondary" onClick={exportCsv}><ArrowDownToLine size={16}/> Export CSV</button><button className="primary" onClick={()=>setShowAdd(true)}><Plus size={17}/> Add number</button></div></div>
        <div className="safety-banner"><div className="banner-icon"><ShieldCheck size={19}/></div><div><b>Owner-authorized workflow</b><p>This tool tracks numbers and owner-confirmed progress. It does not register WhatsApp accounts, request or collect OTPs, or read authentication codes from Telegram.</p></div><button className="icon-btn" title="Dismiss" onClick={e=>e.currentTarget.parentElement.remove()}><X size={16}/></button></div>
        <section className="metric-grid">
          <Metric icon={<Users/>} label="TOTAL RECORDS" value={stats.total} tone="blue" foot="All imported numbers"/>
          <Metric icon={<Clock3/>} label="QUEUED" value={stats.queued} tone="amber" foot="Awaiting owner action"/>
          <Metric icon={<ShieldCheck/>} label="OWNER CONFIRMED" value={stats.owner_confirmed} tone="violet" foot="Consent confirmed"/>
          <Metric icon={<CheckCircle2/>} label="COMPLETED" value={stats.completed} tone="green" foot="Marked complete"/>
          <Metric icon={<AlertCircle/>} label="FAILED" value={stats.failed} tone="red" foot="Needs review"/>
        </section>
        <section className="panel records-panel">
          <div className="panel-heading"><div><div className="panel-title">Number records</div><p>Bulk manage records and update their onboarding status.</p></div><div className="heading-actions"><button className="btn-secondary" onClick={()=>setShowImport(true)}><FileUp size={16}/> Bulk import</button></div></div>
          <div className="toolbar"><div className="searchbox"><Search size={17}/><input value={queryText} onChange={e=>setQueryText(e.target.value)} placeholder="Search phone number or note…"/></div><div className="filterbox"><Filter size={15}/><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option>{statuses.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select><ChevronDown size={14}/></div><span className="result-count">{filtered.length} records</span></div>
          <div className="table-scroll"><table><thead><tr><th>PHONE NUMBER</th><th>STATUS</th><th>ADMIN NOTE</th><th>LAST UPDATED</th><th>ACTIONS</th></tr></thead><tbody>
          {filtered.map(row=><RecordRow key={row.id} row={row} onStatus={changeStatus} onDelete={removeRow}/>)}
          {!filtered.length && <tr><td colSpan="5"><div className="empty"><Database size={25}/><b>No records found</b><span>Import a CSV or add a number to get started.</span></div></td></tr>}
          </tbody></table></div>
        </section>
        <section className="bottom-grid">
          <div className="panel activity-panel"><div className="panel-heading"><div><div className="panel-title">Recent activity</div><p>Latest changes across your workspace.</p></div><Activity size={18} className="subtle-icon"/></div>
            {events.slice(0,7).map(ev=><div className="activity-row" key={ev.id}><div className="activity-icon"><Activity size={15}/></div><div className="activity-copy"><b>{ev.event?.replaceAll("_"," ")}</b><span>{ev.details} {ev.phone ? `· ${ev.phone}` : ""}</span></div><time>{stamp(ev.createdAt)}</time></div>)}
            {!events.length && <div className="empty compact">No activity recorded yet.</div>}
          </div>
          <div className="panel integration-panel"><div className="panel-heading"><div><div className="panel-title">Integrations</div><p>Connected operational services.</p></div></div>
            <div className="integration-row"><div className="integration-logo firebase">✦</div><div><b>Firebase</b><span>Authentication + Firestore</span></div><span className="connected"><i/> Connected</span></div>
            <div className="integration-row"><div className="integration-logo telegram"><Send size={17}/></div><div><b>Telegram Bot</b><span>Status notifications only</span></div><span className={`integration-state ${telegramState}`}>{telegramState==="sent"?"Sent":telegramState==="not-configured"?"Setup needed":telegramState==="error"?"Error":"Server-side"}</span></div>
            <div className="integration-note"><CircleHelp size={15}/> Telegram bot credentials are stored server-side in Vercel environment variables.</div>
          </div>
        </section>
        <footer>NumberOps v2.0 <span>·</span> Firebase-backed workspace <span>·</span> Secure by design</footer>
      </div>
    </main>
    {showImport && <Modal title="Bulk import numbers" subtitle="Paste one international-format number per line. CSV rows use the first column." onClose={()=>setShowImport(false)}>
      <div className="modal-tip"><ShieldCheck size={16}/> Importing only creates tracking records. It does not contact phone numbers or request verification codes.</div>
      <textarea rows="8" value={importText} onChange={e=>setImportText(e.target.value)} placeholder={"+2348012345678\n+2348098765432\n+447700900123"} />
      <div className="modal-foot"><span>{parseImport(importText).length} valid unique numbers</span><button className="primary" disabled={busy||!parseImport(importText).length} onClick={async()=>{await doImport();}}>{busy?"Importing…":"Import records"}</button></div>
      {importReport && <p className="success-line"><Check size={15}/> Imported {importReport.added}; invalid/duplicate lines: {importReport.invalidOrDuplicate}.</p>}
    </Modal>}
    {showAdd && <Modal title="Add a number" subtitle="Add a number you are authorized to manage." onClose={()=>setShowAdd(false)}>
      <form onSubmit={addNumber} className="modal-form"><label>Phone number (international format)</label><input value={newPhone} onChange={e=>setNewPhone(e.target.value)} placeholder="+2348012345678" required/><label>Admin note (optional)</label><input value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Context or reference"/><div className="modal-foot"><span>Owner confirmation is pending</span><button className="primary" disabled={busy}>{busy?"Saving…":"Add record"}</button></div></form>
    </Modal>}
    {toast && <div className="toast"><CheckCircle2 size={17}/>{toast}<button onClick={()=>setToast("")}><X size={15}/></button></div>}
  </div>;
}

function Metric({icon,label,value,tone,foot}) { return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-label">{label}</div><div className="metric-value">{value.toLocaleString()}</div><div className="metric-foot">{foot}</div></div>; }
function RecordRow({row,onStatus,onDelete}) {
  const [note,setNote]=useState(row.note||""); const [status,setStatus]=useState(row.status||"queued");
  useEffect(()=>{setNote(row.note||"");setStatus(row.status||"queued");},[row.note,row.status]);
  return <tr><td><div className="phone-cell"><div className="phone-icon"><Smartphone size={15}/></div><b>{row.phone}</b></div></td><td><select className={`status-select ${status}`} value={status} onChange={e=>setStatus(e.target.value)}>{statuses.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></td><td><input className="note-input" value={note} onChange={e=>setNote(e.target.value)} placeholder="Add note…"/></td><td className="date-cell">{stamp(row.updatedAt||row.createdAt)}</td><td><div className="row-actions"><button className="save-btn" onClick={()=>onStatus(row,status,note)} title="Save changes"><Check size={15}/></button><button className="delete-btn" onClick={()=>onDelete(row)} title="Delete record"><Trash2 size={15}/></button></div></td></tr>;
}
function Modal({title,subtitle,onClose,children}) { return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className="modal"><div className="modal-header"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>{children}</div></div>; }

export default App;