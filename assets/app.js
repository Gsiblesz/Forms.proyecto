// Catálogo simple de productos por defecto; cada formulario puede sobreescribirlo en assets/forms.js
let PRODUCT_CATALOG = [
  { id: "P-001", name: "Arroz 1Kg" },
  { id: "P-002", name: "Azúcar 1Kg" },
  { id: "P-003", name: "Aceite 1L" },
  { id: "P-004", name: "Harina 1Kg" },
  { id: "P-005", name: "Café 500g" },
];

const STORAGE_KEY = "productos_registrados";
const SETTINGS_KEY = "gs_settings"; // { url: string, enabled: boolean, token?: string }
const DEFAULT_GS_URL = "https://script.google.com/macros/s/AKfycby57_ixnTL9abpzfh_XmHHe4tnkyHlINAkadFzJy3WCtphSEdWAcLqPC9_SwRbfj9xclw/exec";
const DEFAULT_GS_TOKEN = "Pasantias90"; // preconfig por defecto

function createRow(productId = "", quantity = "") {
  const div = document.createElement("div");
  div.className = "row";
  div.innerHTML = `
    <select class="product" required>
      <option value="" disabled ${productId ? "" : "selected"}>Selecciona un producto…</option>
      ${PRODUCT_CATALOG.map(p => `<option value="${p.id}" ${p.id === productId ? "selected" : ""}>${p.name}</option>`).join("")}
    </select>
    <input type="number" class="quantity" min="0" step="1" placeholder="0" value="${quantity}" required />
    <button type="button" class="remove-btn" title="Eliminar fila">✕</button>
  `;

  div.querySelector(".remove-btn").addEventListener("click", () => {
    div.remove();
    updateResult();
  });

  return div;
}

function readForm() {
  const rows = Array.from(document.querySelectorAll("#rows .row"));
  const items = rows.map((row) => {
    const product = row.querySelector(".product").value;
    const qtyStr = row.querySelector(".quantity").value.trim();
    const quantity = qtyStr === "" ? NaN : Number(qtyStr);
    return { product, quantity };
  });
  return items;
}

function validate(items) {
  const errors = [];
  const seen = new Set();

  items.forEach((it, idx) => {
    if (!it.product) errors.push(`Fila ${idx + 1}: falta seleccionar el producto`);
    if (!Number.isFinite(it.quantity) || it.quantity < 0 || !Number.isInteger(it.quantity)) {
      errors.push(`Fila ${idx + 1}: cantidad inválida (entero ≥ 0)`);
    }
    if (it.product) {
      const key = it.product;
      if (seen.has(key)) errors.push(`Fila ${idx + 1}: producto repetido (${key})`);
      seen.add(key);
    }
  });

  return { ok: errors.length === 0, errors };
}

function save(items, meta) {
  const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  const now = new Date().toISOString();
  const entry = { id: crypto.randomUUID(), at: now, items, meta };
  const next = [...prev, entry];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return entry;
}

async function maybeSendToSheets(entry) {
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  if (!settings.enabled || !settings.url) return { sent: false };
  try {
    const payloadObj = settings.token ? { ...entry, token: settings.token } : entry;
    const payload = JSON.stringify(payloadObj);
    // Intento 0: proxy en Vercel para lectura de respuesta y ocultar token del cliente
    const canUseProxy = (() => {
      try { return /^https?:/i.test(window.location.protocol); } catch { return false; }
    })();
    if (canUseProxy) {
      try {
        const res = await fetch("/api/gs-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: settings.url, entry: payloadObj }),
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          return { sent: true, data, via: "proxy" };
        }
        // si no es ok, cae a CORS directo
      } catch (_) {
        // ignorar errores del proxy y seguir
      }
    }
    // Intento 1: CORS normal (text/plain should be simple request)
    try {
      const res = await fetch(settings.url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: payload,
        mode: "cors",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json().catch(() => ({}));
      return { sent: true, data };
    } catch (corsErr) {
      // Intento 2: no-cors (fire-and-forget). No podremos leer respuesta.
      await fetch(settings.url, {
        method: "POST",
        body: payload,
        mode: "no-cors",
        // sin headers personalizados para evitar preflight
      });
      return { sent: true, data: { mode: "no-cors" } };
    }
  } catch (err) {
    console.error("Error enviando a Sheets:", err);
    return { sent: false, error: String(err) };
  }
}

function updateResult(message = null, type = "info") {
  const el = document.getElementById("result");
  if (message == null) {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (all.length === 0) {
      el.classList.add("hidden");
      el.innerHTML = "";
      return;
    }
    const count = all.reduce((acc, e) => acc + e.items.length, 0);
    el.classList.remove("hidden");
    el.innerHTML = `<strong>${all.length}</strong> registro(s), <strong>${count}</strong> item(s) guardados.`;
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML = message;
}

function toCSV(entries) {
  const header = ["entry_id", "timestamp", "product_id", "product_name", "quantity", "sede", "responsable", "fecha"];
  const lines = [header.join(",")];
  const mapName = (id) => PRODUCT_CATALOG.find(p => p.id === id)?.name ?? "";

  for (const e of entries) {
    for (const it of e.items) {
      const row = [
        e.id,
        e.at,
        it.product,
        mapName(it.product),
        String(it.quantity),
        e.meta?.sede ?? "",
        e.meta?.responsable ?? "",
        e.meta?.fecha ?? "",
      ];
      // scape commas/quotes with CSV rules
      const safe = row.map(v => {
        const needsQuotes = /[",\n]/.test(v);
        let val = v.replaceAll('"', '""');
        return needsQuotes ? `"${val}"` : val;
      });
      lines.push(safe.join(","));
    }
  }
  return lines.join("\n");
}

function download(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function main() {
  // Detectar formulario desde query y configurar título/estilos
  const u = new URL(window.location.href);
  const formId = u.searchParams.get("form");
  const cfg = (window.getFormConfig ? window.getFormConfig(formId) : null) || null;
  if (cfg) {
    // Catálogo por formulario (si se definió)
    if (Array.isArray(cfg.catalog) && cfg.catalog.length) {
      PRODUCT_CATALOG = cfg.catalog;
    }
    // Título y subtítulo
    const titleEl = document.getElementById("form-title");
    if (titleEl) titleEl.textContent = cfg.title;
    const subEl = document.getElementById("form-subtitle");
    if (subEl) subEl.textContent = `Pestaña en Google Sheets: ${cfg.sheetTab}`;
    // Link del visor con sheet
    const v = document.getElementById("viewer-link");
    if (v) {
      const link = new URL("./registros.html", location.href);
      link.searchParams.set("sheet", cfg.sheetTab);
      v.href = link.toString();
    }
    // Aplicar color suave como banda superior (opcional)
    try { document.documentElement.style.setProperty("--accent", cfg.color); } catch {}
  }

  const rowsEl = document.getElementById("rows");
  const addBtn = document.getElementById("add-row");
  const form = document.getElementById("products-form");
  const exportBtn = document.getElementById("export-csv");
  const clearBtn = document.getElementById("clear-storage");
  const gsUrlInput = document.getElementById("gs-url");
  const gsEnabledInput = document.getElementById("gs-enabled");
  const gsTokenInput = document.getElementById("gs-token");
  const saveSettingsBtn = document.getElementById("save-settings");
  const testSettingsBtn = document.getElementById("test-settings");
  const setTodayBtn = document.getElementById("set-today");
  const resetSettingsBtn = document.getElementById("reset-settings");

  // Cargar con una fila por defecto si no hay ninguna
  if (!rowsEl.children.length) {
    rowsEl.appendChild(createRow());
  }

  addBtn.addEventListener("click", () => rowsEl.appendChild(createRow()));

  // Botón rápido para establecer la fecha de hoy (YYYY-MM-DD)
  if (setTodayBtn) {
    setTodayBtn.addEventListener("click", () => {
      const d = new Date();
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const iso = `${yyyy}-${mm}-${dd}`;
      const dateInput = document.getElementById("meta-date");
      if (dateInput) dateInput.value = iso;
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const items = readForm();
    const v = validate(items);
    if (!v.ok) {
      updateResult(`<span style="color:#ffb3b3">${v.errors.join("<br>")}</span>`);
      return;
    }
    const meta = {
      sede: document.getElementById("meta-sede").value.trim() || null,
      responsable: document.getElementById("meta-resp").value.trim() || null,
      fecha: document.getElementById("meta-date").value || null,
      formId: cfg?.id || null,
      formName: cfg?.title || null,
      sheet: cfg?.sheetTab || null,
    };
    const entry = save(items, meta);
    let msg = `Guardado ${new Date(entry.at).toLocaleString()} (${entry.items.length} item/s)`;
    const send = await maybeSendToSheets(entry);
    if (send.sent) {
      if (send.via === "proxy") {
        msg += " — enviado a Google Sheets (con lectura vía proxy)";
      } else {
        msg += send.data?.mode === "no-cors" ? " — enviado a Google Sheets (sin lectura)" : " — enviado a Google Sheets";
      }
    } else if (send.error) {
      msg += ` — no se pudo enviar a Sheets (${send.error})`;
    }
    updateResult(`<span style="color:#79ffa7">${msg}</span>`);
    // Reset: dejar una sola fila vacía
    rowsEl.innerHTML = "";
    rowsEl.appendChild(createRow());
    // limpiar metadata opcionalmente
    document.getElementById("meta-sede").value = "";
    document.getElementById("meta-resp").value = "";
    document.getElementById("meta-date").value = "";
  });

  exportBtn.addEventListener("click", () => {
    const entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (entries.length === 0) {
      updateResult("No hay registros para exportar");
      return;
    }
    const csv = toCSV(entries);
    const date = new Date().toISOString().replace(/[:.]/g, "-");
    download(`productos_${date}.csv`, csv, "text/csv;charset=utf-8");
  });

  clearBtn.addEventListener("click", () => {
    if (confirm("¿Borrar todos los registros guardados?")) {
      localStorage.removeItem(STORAGE_KEY);
      updateResult();
    }
  });

  // Cargar/Guardar ajustes de Google Sheets
  const existing = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  // Si no hay ajustes guardados, preconfigurar con la URL/token proporcionados y activado
  if (!existing.url && DEFAULT_GS_URL) {
    const preset = { ...existing, url: DEFAULT_GS_URL, enabled: true, token: DEFAULT_GS_TOKEN };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(preset));
    gsUrlInput.value = preset.url;
    gsEnabledInput.checked = preset.enabled;
    if (preset.token) gsTokenInput.value = preset.token;
    updateResult("Ajustes de Google Sheets preconfigurados");
  }
  if (existing.url) gsUrlInput.value = existing.url;
  if (typeof existing.enabled === "boolean") gsEnabledInput.checked = existing.enabled;
  if (existing.token) gsTokenInput.value = existing.token;
  saveSettingsBtn.addEventListener("click", () => {
    const settings = {
      url: gsUrlInput.value.trim(),
      enabled: gsEnabledInput.checked,
      token: gsTokenInput.value.trim() || undefined,
    };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    updateResult("Ajustes guardados");
  });

  testSettingsBtn.addEventListener("click", async () => {
    const url = gsUrlInput.value.trim();
    if (!url) return updateResult("Primero ingresa la URL del Web App");
    const token = gsTokenInput.value.trim();
    const probe = {
      id: "test-" + Math.random().toString(36).slice(2, 8),
      at: new Date().toISOString(),
      items: [{ product: "PING", quantity: 1 }],
      ...(token ? { token } : {}),
    };
    try {
      // Intento 0: proxy (solo si estamos corriendo bajo http(s))
      const canUseProxy = (() => {
        try { return /^https?:/i.test(window.location.protocol); } catch { return false; }
      })();
      if (canUseProxy) {
        try {
          const res = await fetch("/api/gs-submit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url, entry: probe }),
          });
          if (res.ok) {
            const json = await res.json();
            updateResult(`Prueba vía proxy: HTTP ${res.status} — ${JSON.stringify(json).substring(0, 200)}...`);
            return;
          }
        } catch (_) {}
      }
      // Intento 1: CORS normal
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(probe),
          mode: "cors",
        });
        const text = await res.text();
        updateResult(`Prueba: HTTP ${res.status} — ${text.substring(0, 200)}...`);
      } catch (corsErr) {
        // Intento 2: no-cors (fire-and-forget), no podremos leer respuesta
        try {
          await fetch(url, {
            method: "POST",
            body: JSON.stringify(probe),
            mode: "no-cors",
          });
          updateResult("Prueba enviada (sin lectura, no-cors). Revisa la hoja 'Entradas'.");
        } catch (ncErr) {
          const hint = canUseProxy ? "" : " — pista: abre la página desde tu dominio de Vercel para usar el proxy";
          updateResult(`Error de prueba: ${String(ncErr)}${hint}`);
        }
      }
    } catch (err) {
      updateResult(`Error de prueba: ${String(err)}`);
    }
  });

  if (resetSettingsBtn) {
    resetSettingsBtn.addEventListener("click", () => {
      if (confirm("¿Restablecer ajustes y recargar la página?")) {
        localStorage.removeItem(SETTINGS_KEY);
        location.reload();
      }
    });
  }

  updateResult();
  try { console.debug("Formulario cargado"); } catch {}
}
// Inicializar de forma robusta con y sin defer
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", main);
} else {
  // DOM ya cargado
  main();
}
