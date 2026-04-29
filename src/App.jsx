import { useState, useEffect } from "react";
import {
  archiveCredit,
  createCredit,
  deletePayment as deletePaymentRequest,
  fetchDashboard,
  restoreCredit as restoreCreditRequest,
  updateCredit as updateCreditRequest,
  upsertPayment,
} from "./api";

const MONTHS = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
const TYPES = ["Hipotecario","Libre Inversi\u00f3n","Veh\u00edculo","Tarjeta de Cr\u00e9dito","Educativo","Personal","Comercial","Otro"];
const ST = {
  P: { label: "Pagado", color: "#10b981", bg: "#064e3b" },
  N: { label: "No Pagado", color: "#ef4444", bg: "#7f1d1d" },
  PP: { label: "Parcial", color: "#f59e0b", bg: "#78350f" },
};

function fmt(n) {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}
function sh(n) {
  if (n >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return fmt(n);
}
function fD(d) {
  if (!d) return "\u2014";
  return new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" });
}
function fDT(d) {
  if (!d) return "\u2014";
  return new Date(d).toLocaleString("es-CO", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function cv(c) {
  return Math.max(c.originalValue - c.payments.reduce(function (s, p) { return s + (p.abono || 0); }, 0), 0);
}
function calcInterest(capital, rate) {
  return Math.round(Math.max(capital, 0) * (rate / 100));
}

var baseInput = {
  width: "100%", padding: "10px 12px", borderRadius: 8,
  background: "#1e293b", border: "1px solid #334155",
  color: "#f1f5f9", fontSize: 12, outline: "none", fontFamily: "inherit",
};
var monoInput = Object.assign({}, baseInput, { fontFamily: "'JetBrains Mono', monospace" });
var labelSt = {
  fontSize: 9, color: "#475569", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, display: "block",
};

function Overlay(props) {
  return (
    <div
      onClick={props.onClose}
      style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
    >
      <div
        onClick={function (e) { e.stopPropagation(); }}
        style={{
          width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto",
          background: "linear-gradient(160deg, #080d1a, #111b2e)",
          borderRadius: 20, border: "1px solid #1e3a5f55",
          boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
        }}
      >
        {props.children}
      </div>
    </div>
  );
}

function MHeader(props) {
  return (
    <div style={{ padding: "22px 24px 14px", borderBottom: "1px solid #1e293b33", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>{props.title}</h2>
        {props.sub && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{props.sub}</div>}
      </div>
      <button onClick={props.onClose} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#94a3b8", fontSize: 18, lineHeight: 1 }}>
        &#10005;
      </button>
    </div>
  );
}

function Sem(props) {
  var p = props.payment;
  var m = props.month;
  if (!p) {
    return (
      <div style={{ width: 34, height: 34, borderRadius: 7, background: "#080d1a", border: "1px dashed #1e293b", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 7, color: "#1e293b" }}>{m}</span>
      </div>
    );
  }
  var cfg = ST[p.status] || ST.P;
  return (
    <div
      title={m + ": " + cfg.label + (p.abono > 0 ? " + Abono " + sh(p.abono) : "")}
      style={{ width: 34, height: 34, borderRadius: 7, background: cfg.bg, position: "relative", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid " + cfg.color + "33", cursor: "default" }}
    >
      <span style={{ fontSize: 9, fontWeight: 800, color: cfg.color }}>{p.status}</span>
      {p.abono > 0 && (
        <div style={{ position: "absolute", top: -3, right: -3, width: 11, height: 11, borderRadius: "50%", background: "#10b981", border: "2px solid #064e3b", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 5, fontWeight: 900, color: "#fff" }}>$</span>
        </div>
      )}
    </div>
  );
}

function Donut(props) {
  var abonado = props.abonado || 0;
  var total = props.total || 1;
  var pct = total > 0 ? Math.min(abonado / total, 1) : 0;
  var r = 46, cx = 56, cy = 56, sw = 11, ci = 2 * Math.PI * r;
  var a1 = pct * ci;
  return (
    <svg width={112} height={112} viewBox="0 0 112 112">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={sw} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#10b981" strokeWidth={sw} strokeDasharray={a1 + " " + (ci - a1)} strokeDashoffset={ci * 0.25} strokeLinecap="round" />
      <text x={cx} y={cy - 3} textAnchor="middle" fill="#f1f5f9" fontSize={18} fontWeight={800}>{Math.round(pct * 100)}%</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fill="#475569" fontSize={8}>abonado</text>
    </svg>
  );
}

function DeleteModal(props) {
  var credit = props.credit;
  var onClose = props.onClose;
  var onConfirm = props.onConfirm;
  var rs = useState("");
  var reason = rs[0];
  var setReason = rs[1];
  var es = useState(false);
  var hasErr = es[0];
  var setErr = es[1];

  function handle() {
    if (!reason.trim()) { setErr(true); return; }
    onConfirm(credit.id, reason.trim());
    onClose();
  }

  return (
    <Overlay onClose={onClose}>
      <MHeader title="Eliminar Cr\u00e9dito" sub="Se mover\u00e1 a la papelera" onClose={onClose} />
      <div style={{ padding: "20px 24px 24px" }}>
        <div style={{ padding: 16, background: "#7f1d1d22", borderRadius: 12, border: "1px solid #ef444433", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 24 }}>&#9888;</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fca5a5" }}>Eliminar "{credit.entity}"?</div>
              <div style={{ fontSize: 11, color: "#ef444499", marginTop: 2 }}>Capital: {fmt(credit.originalValue)} - {credit.type} - {credit.responsible}</div>
            </div>
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <span style={Object.assign({}, labelSt, { color: "#ef4444" })}>Motivo de eliminacion *</span>
          <textarea
            value={reason}
            onChange={function (e) { setReason(e.target.value); setErr(false); }}
            placeholder="Ej: Credito pagado, refinanciacion, error de registro..."
            rows={3}
            style={Object.assign({}, baseInput, { resize: "vertical", minHeight: 70, border: hasErr ? "1px solid #ef4444" : "1px solid #334155" })}
          />
          {hasErr && <span style={{ fontSize: 9, color: "#ef4444", marginTop: 2, display: "block" }}>Debes indicar el motivo</span>}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
          <button onClick={handle} style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff", fontSize: 13, fontWeight: 700 }}>Eliminar Credito</button>
        </div>
      </div>
    </Overlay>
  );
}

function ArchiveModal(props) {
  var archived = props.archived;
  var onClose = props.onClose;
  var onRestore = props.onRestore;

  return (
    <Overlay onClose={onClose}>
      <MHeader title="Creditos Eliminados" sub={archived.length + " en archivo"} onClose={onClose} />
      <div style={{ padding: "20px 24px 24px" }}>
        {archived.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#334155" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>&#128230;</div>
            <div style={{ fontSize: 13 }}>No hay creditos eliminados</div>
          </div>
        )}
        {archived.map(function (item, i) {
          var c = item.credit;
          var tAb = c.payments.reduce(function (s, p) { return s + (p.abono || 0); }, 0);
          return (
            <div key={i} style={{ background: "#0a0f1a", borderRadius: 12, padding: 16, border: "1px solid #1e293b", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8" }}>{c.entity}</div>
                  <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
                    <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 12, background: "#3b82f60d", color: "#60a5fa", border: "1px solid #3b82f620" }}>{c.type}</span>
                    <span style={{ fontSize: 10, color: "#475569" }}>{c.responsible}</span>
                  </div>
                </div>
                <button onClick={function () { onRestore(item); }} style={{ padding: "6px 14px", borderRadius: 8, background: "#064e3b", border: "1px solid #10b98133", color: "#10b981", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Restaurar</button>
              </div>
              <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 8, color: "#334155", textTransform: "uppercase", letterSpacing: 1 }}>Capital</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>{fmt(c.originalValue)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: "#334155", textTransform: "uppercase", letterSpacing: 1 }}>Tasa</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", fontFamily: "'JetBrains Mono', monospace" }}>{c.rate}%</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: "#334155", textTransform: "uppercase", letterSpacing: 1 }}>Abonos</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>{fmt(tAb)}</div>
                </div>
              </div>
              <div style={{ padding: "8px 12px", background: "#7f1d1d15", borderRadius: 8, border: "1px solid #ef444418" }}>
                <div style={{ fontSize: 8, color: "#ef4444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Motivo</div>
                <div style={{ fontSize: 11, color: "#fca5a5", fontStyle: "italic" }}>"{item.reason}"</div>
                <div style={{ fontSize: 9, color: "#475569", marginTop: 4 }}>{fDT(item.archivedAt)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </Overlay>
  );
}

function CreditFormModal(props) {
  var credit = props.credit;
  var onClose = props.onClose;
  var onSave = props.onSave;
  var isEdit = !!credit;

  var init = isEdit
    ? { entity: credit.entity, type: credit.type, responsible: credit.responsible, originalValue: String(credit.originalValue), rate: String(credit.rate), observation: credit.observation || "" }
    : { entity: "", type: "Hipotecario", responsible: "", originalValue: "", rate: "", observation: "" };

  var fs = useState(init);
  var form = fs[0];
  var setForm = fs[1];
  var es = useState({});
  var errors = es[0];
  var setErrors = es[1];

  function upd(f, v) { setForm(function (p) { return Object.assign({}, p, { [f]: v }); }); }

  function validate() {
    var e = {};
    if (!form.entity.trim()) e.entity = true;
    if (!form.responsible.trim()) e.responsible = true;
    if (!form.originalValue || Number(form.originalValue) <= 0) e.originalValue = true;
    if (!form.rate || Number(form.rate) <= 0 || Number(form.rate) > 100) e.rate = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handle() {
    if (!validate()) return;
    if (isEdit) {
      onSave(Object.assign({}, credit, { entity: form.entity.trim(), type: form.type, responsible: form.responsible.trim(), originalValue: Number(form.originalValue), rate: Number(form.rate), observation: form.observation.trim() }));
    } else {
      onSave({ entity: form.entity.trim(), type: form.type, responsible: form.responsible.trim(), originalValue: Number(form.originalValue), rate: Number(form.rate), observation: form.observation.trim(), payments: [] });
    }
    onClose();
  }

  function eb(f) { return errors[f] ? "1px solid #ef4444" : "1px solid #334155"; }
  var ov = Number(form.originalValue) || 0;
  var or2 = Number(form.rate) || 0;
  var estInt = calcInterest(ov, or2);

  return (
    <Overlay onClose={onClose}>
      <MHeader title={isEdit ? "Editar Credito" : "Nuevo Credito"} sub={isEdit ? "Modifica los datos" : "Agrega al panel"} onClose={onClose} />
      <div style={{ padding: "20px 24px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <span style={labelSt}>Entidad / Banco *</span>
            <input value={form.entity} onChange={function (e) { upd("entity", e.target.value); }} placeholder="Ej: Bancolombia" style={Object.assign({}, baseInput, { border: eb("entity") })} />
            {errors.entity && <span style={{ fontSize: 9, color: "#ef4444" }}>Requerido</span>}
          </div>
          <div>
            <span style={labelSt}>Tipo</span>
            <select value={form.type} onChange={function (e) { upd("type", e.target.value); }} style={baseInput}>
              {TYPES.map(function (t) { return <option key={t} value={t}>{t}</option>; })}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <span style={labelSt}>Responsable *</span>
          <input value={form.responsible} onChange={function (e) { upd("responsible", e.target.value); }} placeholder="Nombre completo" style={Object.assign({}, baseInput, { border: eb("responsible") })} />
          {errors.responsible && <span style={{ fontSize: 9, color: "#ef4444" }}>Requerido</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
          <div>
            <span style={labelSt}>Valor ($) *</span>
            <input type="number" value={form.originalValue} onChange={function (e) { upd("originalValue", e.target.value); }} placeholder="50000000" style={Object.assign({}, monoInput, { border: eb("originalValue") })} />
            {errors.originalValue && <span style={{ fontSize: 9, color: "#ef4444" }}>Invalido</span>}
            {ov > 0 && <span style={{ fontSize: 9, color: "#3b82f6", display: "block", marginTop: 2 }}>{fmt(ov)}</span>}
          </div>
          <div>
            <span style={labelSt}>Interes (%) *</span>
            <input type="number" value={form.rate} onChange={function (e) { upd("rate", e.target.value); }} placeholder="12.5" step="0.1" style={Object.assign({}, monoInput, { border: eb("rate") })} />
            {errors.rate && <span style={{ fontSize: 9, color: "#ef4444" }}>Invalido</span>}
            {or2 > 0 && ov > 0 && <span style={{ fontSize: 9, color: "#f59e0b", display: "block", marginTop: 2 }}>Interes estimado: {fmt(estInt)}</span>}
          </div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <span style={labelSt}>Observación</span>
          <textarea
            value={form.observation}
            onChange={function (e) { upd("observation", e.target.value); }}
            placeholder="Notas importantes del crédito: condiciones especiales, acuerdos, recordatorios..."
            rows={3}
            style={Object.assign({}, baseInput, { resize: "vertical", minHeight: 70 })}
          />
        </div>

        {form.entity && ov > 0 && or2 > 0 && (
          <div style={{ padding: "14px 16px", background: "#060a14", borderRadius: 12, border: "1px solid #1e293b", marginBottom: 18 }}>
            <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginBottom: 8 }}>Vista previa</div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{form.entity}</div>
                <div style={{ fontSize: 10, color: "#475569" }}>{form.type} - {form.responsible || "---"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#3b82f6", fontFamily: "'JetBrains Mono', monospace" }}>{sh(ov)}</div>
                <div style={{ fontSize: 10, color: "#f59e0b" }}>Interes estimado: {fmt(estInt)}</div>
              </div>
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 12, borderRadius: 10, background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
          <button onClick={handle} style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", cursor: "pointer", background: isEdit ? "linear-gradient(135deg, #3b82f6, #2563eb)" : "linear-gradient(135deg, #10b981, #059669)", color: "#fff", fontSize: 13, fontWeight: 700 }}>
            {isEdit ? "Guardar Cambios" : "+ Crear Credito"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function DetailModal(props) {
  var credit = props.credit;
  var onClose = props.onClose;
  var onAddPayment = props.onAddPayment;
  var onDeletePayment = props.onDeletePayment;
  var sfs = useState(false);
  var showForm = sfs[0];
  var setShowForm = sfs[1];
  var cds = useState(null);
  var confirmDeleteMonth = cds[0];
  var setConfirmDeleteMonth = cds[1];
  var currentVal = cv(credit);
  var defInt = calcInterest(currentVal, credit.rate);
  var fds = useState({ month: new Date().getMonth(), status: "P", date: new Date().toISOString().split("T")[0], interest: defInt, abono: 0, note: "" });
  var formData = fds[0];
  var setFormData = fds[1];

  var totInt = credit.payments.filter(function (p) { return p.status !== "N"; }).reduce(function (s, p) { return s + p.interest; }, 0);
  var totAb = credit.payments.reduce(function (s, p) { return s + (p.abono || 0); }, 0);
  var pctR = credit.originalValue > 0 ? (totAb / credit.originalValue) * 100 : 0;
  var projectedCapital = Math.max(currentVal - (Number(formData.abono) || 0), 0);
  var projectedInterest = calcInterest(projectedCapital, credit.rate);

  useEffect(function () {
    setFormData(function (prev) {
      return Object.assign({}, prev, { interest: defInt });
    });
  }, [defInt, credit.id, setFormData]);

  function uf(f, v) { setFormData(function (p) { return Object.assign({}, p, { [f]: v }); }); }
  function submit() {
    onAddPayment(credit.id, { month: formData.month, status: formData.status, date: formData.date, interest: Number(formData.interest), abono: Number(formData.abono), note: formData.note });
    setShowForm(false);
    setFormData(function (p) { return Object.assign({}, p, { interest: defInt, abono: 0, note: "" }); });
  }

  return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "22px 24px 14px", borderBottom: "1px solid #1e293b33", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 20, background: "#3b82f612", color: "#60a5fa", border: "1px solid #3b82f630", fontWeight: 700 }}>{credit.type}</span>
            <span style={{ fontSize: 10, color: "#64748b" }}>{credit.responsible}</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", margin: 0 }}>{credit.entity}</h2>
        </div>
        <button onClick={onClose} style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 10, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#94a3b8", fontSize: 18 }}>&#10005;</button>
      </div>

      <div style={{ display: "flex", background: "#060a14" }}>
        {[
          { l: "Capital Original", v: fmt(credit.originalValue), c: "#64748b" },
          { l: "Capital Actual", v: fmt(currentVal), c: "#3b82f6" },
          { l: "Total Abonos", v: fmt(totAb), c: "#10b981" },
          { l: "Reduccion", v: pctR.toFixed(1) + "%", c: pctR > 0 ? "#10b981" : "#475569" },
        ].map(function (s, i) {
          return (
            <div key={i} style={{ flex: 1, padding: "14px 10px", textAlign: "center", background: i % 2 ? "#080d1a" : "#060a14" }}>
              <div style={{ fontSize: 8, color: "#334155", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, marginBottom: 3 }}>{s.l}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: s.c, fontFamily: "'JetBrains Mono', monospace" }}>{s.v}</div>
            </div>
          );
        })}
      </div>

      {totAb > 0 && (
        <div style={{ padding: "14px 24px", borderBottom: "1px solid #1e293b22" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ fontSize: 9, color: "#475569", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Reduccion de capital</span>
            <span style={{ fontSize: 10, color: "#10b981", fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{sh(totAb)} / {sh(credit.originalValue)}</span>
          </div>
          <div style={{ height: 7, borderRadius: 4, background: "#1e293b", overflow: "hidden" }}>
            <div style={{ height: "100%", width: pctR + "%", borderRadius: 4, background: "linear-gradient(90deg, #10b981, #34d399)" }} />
          </div>
        </div>
      )}

      {credit.observation && (
        <div style={{ padding: "12px 24px", borderBottom: "1px solid #1e293b22", background: "#060a1488" }}>
          <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Observación</div>
          <div style={{ fontSize: 12, color: "#94a3b8", lineHeight: 1.5 }}>{credit.observation}</div>
        </div>
      )}

      <div style={{ padding: "18px 24px 22px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 2, margin: 0 }}>Historial de Pagos</h3>
          <button onClick={function () { setShowForm(!showForm); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderRadius: 9, background: showForm ? "#1e293b" : "linear-gradient(135deg, #3b82f6, #2563eb)", border: "none", color: showForm ? "#94a3b8" : "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
            {showForm ? "Cancelar" : "+ Registrar Pago"}
          </button>
        </div>

        {showForm && (
          <div style={{ background: "#060a14", borderRadius: 14, padding: 18, marginBottom: 18, border: "1px solid #3b82f622" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <span style={labelSt}>Mes</span>
                <select value={formData.month} onChange={function (e) { uf("month", Number(e.target.value)); }} style={baseInput}>
                  {MONTHS.map(function (m, i) { return <option key={i} value={i}>{m} 2026</option>; })}
                </select>
              </div>
              <div>
                <span style={labelSt}>Estado</span>
                <select value={formData.status} onChange={function (e) { uf("status", e.target.value); }} style={baseInput}>
                  <option value="P">Pagado</option>
                  <option value="PP">Parcial</option>
                  <option value="N">No Pagado</option>
                </select>
              </div>
              <div>
                <span style={labelSt}>Fecha</span>
                <input type="date" value={formData.date} onChange={function (e) { uf("date", e.target.value); }} style={baseInput} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <span style={labelSt}>Intereses ($)</span>
                <input type="number" value={formData.interest} onChange={function (e) { uf("interest", e.target.value); }} style={monoInput} />
              </div>
              <div>
                <span style={Object.assign({}, labelSt, { color: "#10b981" })}>Abono Capital ($)</span>
                <input type="number" value={formData.abono} onChange={function (e) { uf("abono", e.target.value); }} style={Object.assign({}, monoInput, { background: "#064e3b22", border: "1px solid #10b98133", color: "#10b981" })} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10, padding: "10px 12px", borderRadius: 10, background: "#0b1220", border: "1px solid #1e293b" }}>
              <div>
                <div style={{ fontSize: 8, color: "#475569", textTransform: "uppercase", letterSpacing: 1 }}>Capital tras abono</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#93c5fd", fontFamily: "'JetBrains Mono', monospace" }}>{fmt(projectedCapital)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 8, color: "#475569", textTransform: "uppercase", letterSpacing: 1 }}>Interes sugerido</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", fontFamily: "'JetBrains Mono', monospace" }}>{fmt(projectedInterest)}</div>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <span style={labelSt}>Nota</span>
              <input value={formData.note} onChange={function (e) { uf("note", e.target.value); }} placeholder="Ej: Abono con prima..." style={baseInput} />
            </div>
            <button onClick={submit} style={{ width: "100%", padding: 11, borderRadius: 9, border: "none", cursor: "pointer", background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontSize: 12, fontWeight: 700 }}>Registrar Pago</button>
          </div>
        )}

        {credit.payments.length === 0 && (
          <div style={{ textAlign: "center", padding: "30px 0", color: "#334155" }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>&#128203;</div>
            <div style={{ fontSize: 12 }}>Sin pagos registrados</div>
          </div>
        )}

        <div style={{ position: "relative" }}>
          {credit.payments.length > 0 && <div style={{ position: "absolute", left: 16, top: 0, bottom: 0, width: 2, background: "linear-gradient(180deg, #3b82f633, transparent)" }} />}
          {[...credit.payments].reverse().map(function (p, i) {
            var cfg = ST[p.status] || ST.P;
            var isConfirming = confirmDeleteMonth === p.month;
            return (
              <div key={i} style={{ display: "flex", gap: 14, marginBottom: 14, position: "relative" }}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: cfg.bg, border: "2px solid " + cfg.color + "44", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, zIndex: 1 }}>
                  <span style={{ fontSize: 9, fontWeight: 800, color: cfg.color }}>{p.status}</span>
                </div>
                <div style={{ flex: 1, background: "#0a1020", borderRadius: 11, padding: "12px 16px", border: "1px solid " + cfg.color + "18" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: cfg.color }}>{MONTHS[p.month]} 2026</span>
                      <span style={{ fontSize: 9, color: "#334155" }}>{fD(p.date)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 5, background: cfg.bg, color: cfg.color, fontWeight: 700 }}>{cfg.label}</span>
                      {!isConfirming && (
                        <button
                          onClick={function () { setConfirmDeleteMonth(p.month); }}
                          title="Eliminar pago"
                          style={{ width: 22, height: 22, borderRadius: 5, background: "#7f1d1d22", border: "1px solid #ef444433", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#ef4444", fontSize: 10, flexShrink: 0 }}
                        >&#128465;</button>
                      )}
                    </div>
                  </div>
                  {isConfirming && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "8px 10px", borderRadius: 8, background: "#7f1d1d22", border: "1px solid #ef444433" }}>
                      <span style={{ fontSize: 10, color: "#fca5a5", flex: 1 }}>&#9888; Eliminar este pago?</span>
                      <button onClick={function () { setConfirmDeleteMonth(null); }} style={{ padding: "3px 10px", borderRadius: 6, background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Cancelar</button>
                      <button onClick={function () { setConfirmDeleteMonth(null); onDeletePayment(credit.id, p.month); }} style={{ padding: "3px 10px", borderRadius: 6, background: "#ef4444", border: "none", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Eliminar</button>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 18 }}>
                    <div>
                      <div style={{ fontSize: 8, color: "#334155", textTransform: "uppercase", letterSpacing: 1 }}>Intereses</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#cbd5e1", fontFamily: "'JetBrains Mono', monospace" }}>{fmt(p.interest)}</div>
                    </div>
                    {p.abono > 0 && (
                      <div>
                        <div style={{ fontSize: 8, color: "#10b981", textTransform: "uppercase", letterSpacing: 1 }}>Abono Capital</div>
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#10b981", fontFamily: "'JetBrains Mono', monospace" }}>{fmt(p.abono)}</div>
                      </div>
                    )}
                  </div>
                  {p.note && <div style={{ marginTop: 6, fontSize: 10, color: "#475569", fontStyle: "italic", borderTop: "1px solid #1e293b33", paddingTop: 6 }}>"{p.note}"</div>}
                </div>
              </div>
            );
          })}
        </div>

        {credit.payments.length > 0 && (
          <div style={{ marginTop: 6, padding: "12px 16px", background: "#060a14", borderRadius: 11, border: "1px solid #1e293b", display: "flex", justifyContent: "space-around" }}>
            {[
              { l: "Total Intereses", v: fmt(totInt), c: "#f59e0b" },
              { l: "Total Abonos", v: fmt(totAb), c: "#10b981" },
              { l: "Interes", v: credit.rate.toFixed(2) + "%", c: "#94a3b8" },
            ].map(function (x, i) {
              return (
                <div key={i} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 8, color: "#334155", textTransform: "uppercase", letterSpacing: 1 }}>{x.l}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: x.c, fontFamily: "'JetBrains Mono', monospace" }}>{x.v}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Overlay>
  );
}

export default function App() {
  var cs = useState([]);
  var credits = cs[0];
  var setCredits = cs[1];
  var dis = useState(null);
  var detailId = dis[0];
  var setDetailId = dis[1];
  var fms = useState(null);
  var formModal = fms[0];
  var setFormModal = fms[1];
  var dms = useState(null);
  var deleteTarget = dms[0];
  var setDeleteTarget = dms[1];
  var ars = useState([]);
  var archived = ars[0];
  var setArchived = ars[1];
  var sas = useState(false);
  var showArchive = sas[0];
  var setShowArchive = sas[1];
  var ls = useState(true);
  var isLoading = ls[0];
  var setLoading = ls[1];
  var ers = useState("");
  var syncError = ers[0];
  var setSyncError = ers[1];
  var frs = useState("");
  var filterResponsable = frs[0];
  var setFilterResponsable = frs[1];

  useEffect(function () {
    setLoading(true);
    setSyncError("");

    fetchDashboard()
      .then(function (data) {
        setCredits(data.credits || []);
        setArchived(data.archived || []);
      })
      .catch(function (error) {
        setSyncError(error.message || "No se pudo cargar la informacion guardada.");
      })
      .finally(function () {
        setLoading(false);
      });
  }, [setArchived, setCredits, setLoading, setSyncError]);

  function addPayment(cid, pay) {
    setSyncError("");
    return upsertPayment(cid, pay)
      .then(function (updated) {
        setCredits(function (prev) {
          return prev.map(function (c) {
            return c.id === updated.id ? updated : c;
          });
        });
      })
      .catch(function (error) {
        setSyncError(error.message || "No se pudo registrar el pago.");
      });
  }

  function removePayment(cid, month) {
    setSyncError("");
    return deletePaymentRequest(cid, month)
      .then(function (updated) {
        setCredits(function (prev) {
          return prev.map(function (c) {
            return c.id === updated.id ? updated : c;
          });
        });
      })
      .catch(function (error) {
        setSyncError(error.message || "No se pudo eliminar el pago.");
      });
  }

  function saveCredit(data) {
    setSyncError("");
    var request = data.id ? updateCreditRequest(data.id, data) : createCredit(data);

    return request
      .then(function (saved) {
        setCredits(function (prev) {
          var exists = prev.some(function (c) { return c.id === saved.id; });
          var next = exists
            ? prev.map(function (c) { return c.id === saved.id ? saved : c; })
            : [].concat(prev, [saved]);

          return next.sort(function (a, b) { return a.id - b.id; });
        });
      })
      .catch(function (error) {
        setSyncError(error.message || "No se pudo guardar el credito.");
      });
  }

  function deleteCredit(id, reason) {
    setSyncError("");
    return archiveCredit(id, reason)
      .then(function (archivedCredit) {
        setArchived(function (prev) {
          return [archivedCredit].concat(prev);
        });
        setCredits(function (prev) { return prev.filter(function (x) { return x.id !== id; }); });
        setDetailId(function (prev) { return prev === id ? null : prev; });
      })
      .catch(function (error) {
        setSyncError(error.message || "No se pudo archivar el credito.");
      });
  }

  function restoreCredit(item) {
    setSyncError("");
    return restoreCreditRequest(item.credit.id)
      .then(function (restored) {
        setCredits(function (prev) {
          return [].concat(prev, [restored]).sort(function (a, b) { return a.id - b.id; });
        });
        setArchived(function (prev) {
          return prev.filter(function (x) { return x.credit.id !== item.credit.id; });
        });
      })
      .catch(function (error) {
        setSyncError(error.message || "No se pudo restaurar el credito.");
      });
  }

  var enriched = credits.map(function (c) { return Object.assign({}, c, { currentValue: cv(c) }); });
  var responsables = Array.from(new Set(enriched.map(function (c) { return c.responsible; }))).sort();
  var filteredEnriched = filterResponsable
    ? enriched.filter(function (c) { return c.responsible === filterResponsable; })
    : enriched;
  var tOrig = filteredEnriched.reduce(function (s, c) { return s + c.originalValue; }, 0);
  var tCur = filteredEnriched.reduce(function (s, c) { return s + c.currentValue; }, 0);
  var tAb = filteredEnriched.reduce(function (s, c) { return s + c.payments.reduce(function (ss, p) { return ss + (p.abono || 0); }, 0); }, 0);
  var tInt = filteredEnriched.reduce(function (s, c) { return s + calcInterest(c.currentValue, c.rate); }, 0);
  var cPct = tOrig > 0 ? Math.round((tAb / tOrig) * 100) : 0;
  var detailCredit = detailId ? enriched.find(function (c) { return c.id === detailId; }) : null;

  return (
    <div style={{ minHeight: "100vh", background: "#020617", color: "#f8fafc", fontFamily: "'DM Sans', -apple-system, sans-serif", padding: "20px 16px" }}>
      <style>{
        "@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,100..1000&family=JetBrains+Mono:wght@400;700;800&display=swap');" +
        "* { box-sizing: border-box; margin: 0; padding: 0; }" +
        "::-webkit-scrollbar { width: 5px; height: 5px; }" +
        "::-webkit-scrollbar-track { background: #060a14; }" +
        "::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }" +
        "input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }" +
        "select, input, textarea { font-family: inherit; }"
      }</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22, flexWrap: "wrap" }}>
        <div style={{ width: 42, height: 42, borderRadius: 12, background: "linear-gradient(135deg, #3b82f6, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>&#128179;</div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.5, color: "#f1f5f9", margin: 0 }}>Control de Creditos</h1>
          <div style={{ fontSize: 10, color: "#334155" }}>{isLoading ? "Sincronizando con PostgreSQL..." : "Dashboard interactivo con persistencia en base de datos"}</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {responsables.length > 1 && (
            <select
              value={filterResponsable}
              onChange={function (e) { setFilterResponsable(e.target.value); }}
              style={{ padding: "10px 14px", borderRadius: 12, background: filterResponsable ? "#0c2a1e" : "#1e293b", border: filterResponsable ? "1px solid #10b98155" : "1px solid #334155", color: filterResponsable ? "#10b981" : "#64748b", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
            >
              <option value="">Todos los responsables</option>
              {responsables.map(function (r) { return <option key={r} value={r}>{r}</option>; })}
            </select>
          )}
          <button onClick={function () { setShowArchive(true); }} style={{ display: "flex", alignItems: "center", gap: 5, padding: "10px 14px", borderRadius: 12, background: "#1e293b", border: "1px solid #334155", color: "#94a3b8", fontSize: 11, fontWeight: 700, cursor: "pointer", position: "relative" }}>
            Eliminados
            {archived.length > 0 && <span style={{ position: "absolute", top: -5, right: -5, width: 18, height: 18, borderRadius: "50%", background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{archived.length}</span>}
          </button>
          <button onClick={function () { setFormModal("new"); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderRadius: 12, background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px #10b98133" }}>
            + Nuevo Credito
          </button>
        </div>
      </div>

      {syncError && (
        <div style={{ marginBottom: 18, padding: "12px 14px", borderRadius: 12, background: "#7f1d1d22", border: "1px solid #ef444433", color: "#fecaca", fontSize: 11 }}>
          {syncError}
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        {[
          { l: "Deuda Actual", v: sh(tCur), s: "Original: " + sh(tOrig), c: "#3b82f6" },
          { l: "Interes Actual", v: sh(tInt), s: "Sobre capital vigente", c: "#f59e0b" },
          { l: "Abonos Capital", v: sh(tAb), s: tOrig > 0 ? ((tAb / tOrig) * 100).toFixed(1) + "% reducido" : "0%", c: "#10b981" },
          { l: "Cumplimiento", v: cPct + "%", s: sh(tAb) + " de " + sh(tOrig) + " abonado", c: cPct > 80 ? "#10b981" : "#f59e0b" },
        ].map(function (k, i) {
          return (
            <div key={i} style={{ flex: "1 1 170px", minWidth: 155, background: "linear-gradient(145deg, #0a0f1a, #131c2e)", borderRadius: 14, padding: "20px 16px", position: "relative", overflow: "hidden", border: "1px solid " + k.c + "12" }}>
              <div style={{ fontSize: 9, color: "#475569", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginBottom: 5 }}>{k.l}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: k.c, letterSpacing: -1, fontFamily: "'JetBrains Mono', monospace" }}>{k.v}</div>
              <div style={{ fontSize: 10, color: "#334155", marginTop: 3 }}>{k.s}</div>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, background: "linear-gradient(90deg, transparent, " + k.c + "55, transparent)" }} />
            </div>
          );
        })}
      </div>

      {/* Donut + Cards */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 150px", background: "linear-gradient(145deg, #0a0f1a, #131c2e)", borderRadius: 14, padding: 14, border: "1px solid #1e293b", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <Donut abonado={tAb} total={tOrig} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {[{ l: "Abonado", c: "#10b981", v: sh(tAb) }, { l: "Restante", c: "#334155", v: sh(tCur) }].map(function (x) {
              return <div key={x.l} style={{ display: "flex", alignItems: "center", gap: 3 }}><div style={{ width: 6, height: 6, borderRadius: "50%", background: x.c }} /><span style={{ fontSize: 8, color: "#475569" }}>{x.v}</span></div>;
            })}
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {filteredEnriched.map(function (c) {
            var ab = c.payments.reduce(function (s, p) { return s + (p.abono || 0); }, 0);
            var pct = c.originalValue > 0 ? (ab / c.originalValue) * 100 : 0;
            return (
              <div key={c.id} onClick={function () { setDetailId(c.id); }} style={{ flex: "0 0 185px", background: "linear-gradient(145deg, #0a0f1a, #131c2e)", borderRadius: 13, padding: 14, border: "1px solid #1e293b", cursor: "pointer", position: "relative" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0", marginBottom: 1 }}>{c.entity}</div>
                <div style={{ fontSize: 9, color: "#475569", marginBottom: 8 }}>{c.type}</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#3b82f6", fontFamily: "'JetBrains Mono', monospace", marginBottom: 3 }}>{sh(c.currentValue)}</div>
                {pct > 0 && <div><span style={{ fontSize: 9, color: "#10b981", fontWeight: 700 }}>-{pct.toFixed(1)}%</span></div>}
              </div>
            );
          })}
          {filteredEnriched.length === 0 && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#334155", fontSize: 12 }}>{filterResponsable ? "Sin créditos para este responsable" : "Sin créditos - crea uno"}</div>}
        </div>
      </div>

      {/* Table */}
      <div style={{ background: "linear-gradient(145deg, #0a0f1a, #131c2e)", borderRadius: 14, border: "1px solid #1e293b", overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid #1e293b33", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span style={{ fontSize: 10, color: "#475569", textTransform: "uppercase", letterSpacing: 2, fontWeight: 700 }}>Detalle y Semaforo</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(ST).map(function (e) {
              return <div key={e[0]} style={{ display: "flex", alignItems: "center", gap: 3 }}><div style={{ width: 7, height: 7, borderRadius: 3, background: e[1].bg, border: "1px solid " + e[1].color + "33" }} /><span style={{ fontSize: 8, color: "#475569" }}>{e[1].label}</span></div>;
            })}
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 950 }}>
            <thead>
              <tr>
                {["", "Entidad", "Tipo", "Responsable", "Capital", "Interes", "Interes Calc.", "Acciones", "Semaforo 2026"].map(function (h, i) {
                  return <th key={i} style={{ padding: "10px 10px", fontSize: 8, color: "#334155", textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, textAlign: i === 8 ? "center" : "left", borderBottom: "1px solid #1e293b" }}>{h}</th>;
                })}
              </tr>
            </thead>
            <tbody>
              {filteredEnriched.length === 0 && (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#334155", fontSize: 13 }}>{filterResponsable ? "Sin créditos para " + filterResponsable : "No hay créditos registrados"}</td></tr>
              )}
              {filteredEnriched.map(function (c, idx) {
                var mi = calcInterest(c.currentValue, c.rate);
                var pm = {};
                c.payments.forEach(function (p) { pm[p.month] = p; });
                return (
                  <tr key={c.id} style={{ background: idx % 2 ? "#060a1444" : "transparent" }}>
                    <td style={{ padding: "10px 6px 10px 14px", borderBottom: "1px solid #1e293b11" }}>
                      <button onClick={function () { setDetailId(c.id); }} title="Ver detalle" style={{ width: 30, height: 30, borderRadius: 7, background: "#1e293b", border: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#60a5fa", fontSize: 12 }}>&#128065;</button>
                    </td>
                    <td style={{ padding: 10, fontSize: 12, fontWeight: 700, color: "#e2e8f0", borderBottom: "1px solid #1e293b11" }}>{c.entity}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid #1e293b11" }}>
                      <span style={{ fontSize: 9, padding: "2px 9px", borderRadius: 20, background: "#3b82f60d", color: "#60a5fa", border: "1px solid #3b82f620", fontWeight: 600 }}>{c.type}</span>
                    </td>
                    <td style={{ padding: 10, fontSize: 11, color: "#64748b", borderBottom: "1px solid #1e293b11" }}>{c.responsible}</td>
                    <td style={{ padding: 10, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "#e2e8f0", fontWeight: 700, borderBottom: "1px solid #1e293b11" }}>{fmt(c.currentValue)}</td>
                    <td style={{ padding: 10, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: c.rate > 20 ? "#ef4444" : c.rate > 15 ? "#f59e0b" : "#10b981", borderBottom: "1px solid #1e293b11" }}>{c.rate}%</td>
                    <td style={{ padding: 10, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "#c4b5fd", fontWeight: 700, borderBottom: "1px solid #1e293b11" }}>{fmt(mi)}</td>
                    <td style={{ padding: "10px 6px", borderBottom: "1px solid #1e293b11" }}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button onClick={function () { setFormModal(c); }} title="Editar" style={{ width: 28, height: 28, borderRadius: 6, background: "#1e293b", border: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#f59e0b", fontSize: 12 }}>&#9998;</button>
                        <button onClick={function () { setDeleteTarget(c); }} title="Eliminar" style={{ width: 28, height: 28, borderRadius: 6, background: "#1e293b", border: "1px solid #334155", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#ef4444", fontSize: 12 }}>&#128465;</button>
                      </div>
                    </td>
                    <td style={{ padding: "8px 12px", borderBottom: "1px solid #1e293b11" }}>
                      <div style={{ display: "flex", gap: 3, justifyContent: "center" }}>
                        {MONTHS.map(function (m, i) { return <Sem key={i} payment={pm[i]} month={m} />; })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ textAlign: "center", marginTop: 14, fontSize: 9, color: "#1e293b" }}>
        Ver detalle | Editar | Eliminar | Valores en COP
      </div>

      {detailCredit && <DetailModal credit={detailCredit} onClose={function () { setDetailId(null); }} onAddPayment={addPayment} onDeletePayment={removePayment} />}
      {formModal && <CreditFormModal credit={formModal === "new" ? null : formModal} onClose={function () { setFormModal(null); }} onSave={saveCredit} />}
      {deleteTarget && <DeleteModal credit={deleteTarget} onClose={function () { setDeleteTarget(null); }} onConfirm={deleteCredit} />}
      {showArchive && <ArchiveModal archived={archived} onClose={function () { setShowArchive(false); }} onRestore={restoreCredit} />}
    </div>
  );
}
