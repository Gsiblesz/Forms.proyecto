// Catálogo simple de productos (puedes editarlo o cargarlo desde un backend)
const PRODUCT_CATALOG = [
  { id: "P-001", name: "Arroz 1Kg" },
  { id: "P-002", name: "Azúcar 1Kg" },
  { id: "P-003", name: "Aceite 1L" },
  { id: "P-004", name: "Harina 1Kg" },
  { id: "P-005", name: "Café 500g" },
];

const STORAGE_KEY = "productos_registrados";
const SETTINGS_KEY = "gs_settings"; // { url: string, enabled: boolean, token?: string }
const DEFAULT_GS_URL = "https://script.google.com/macros/s/AKfycby57_ixnTL9abpzfh_XmHHe4tnkyHlINAkadFzJy3WCtphSEdWAcLqPC9_SwRbfj9xclw/exec";

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
    const payload = JSON.stringify(settings.token ? { ...entry, token: settings.token } : entry);
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
    };
    const entry = save(items, meta);
    let msg = `Guardado ${new Date(entry.at).toLocaleString()} (${entry.items.length} item/s)`;
    const send = await maybeSendToSheets(entry);
    if (send.sent) {
      msg += send.data?.mode === "no-cors" ? " — enviado a Google Sheets (sin lectura)" : " — enviado a Google Sheets";
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
  // Si no hay ajustes guardados, preconfigurar con la URL proporcionada y activado
  if (!existing.url && DEFAULT_GS_URL) {
    const preset = { ...existing, url: DEFAULT_GS_URL, enabled: true };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(preset));
    gsUrlInput.value = preset.url;
    gsEnabledInput.checked = preset.enabled;
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
        await fetch(url, {
          method: "POST",
          body: JSON.stringify(probe),
          mode: "no-cors",
        });
        updateResult("Prueba enviada (sin lectura, no-cors). Revisa la hoja 'Entradas'.");
      }
    } catch (err) {
      updateResult(`Error de prueba: ${String(err)}`);
    }
  });

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
