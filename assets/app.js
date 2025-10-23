// Catálogo simple de productos por defecto; cada formulario puede sobreescribirlo en assets/forms.js
let PRODUCT_CATALOG = [
  { id: "P-001", name: "Arroz 1Kg" },
  { id: "P-002", name: "Azúcar 1Kg" },
  { id: "P-003", name: "Aceite 1L" },
  { id: "P-004", name: "Harina 1Kg" },
  { id: "P-005", name: "Café 500g" },
];
let PRODUCT_GROUPS = null; // [{label, products:[string]}]

const STORAGE_KEY = "productos_registrados";
const SETTINGS_KEY = "gs_settings"; // { url: string, enabled: boolean, token?: string }
const DEFAULT_GS_URL = "https://script.google.com/macros/s/AKfycbylShlKMGbYqzeDaR_5TIbAkvHO1T4zLM-0nlYy4dE0bTZ7knR502nBQJIUmg5ZeFVLzA/exec";
const DEFAULT_GS_TOKEN = "Pasantias90"; // preconfig por defecto
const ROLE_KEY = "app_role"; // 'worker' | 'admin'

function productNameFor(id) {
  return PRODUCT_CATALOG.find(p => p.id === id)?.name ?? "";
}

function createRow(productId = "", quantity = "") {
  const div = document.createElement("div");
  div.className = "row";
  let optionsHtml = '';
  if (Array.isArray(PRODUCT_GROUPS) && PRODUCT_GROUPS.length) {
    optionsHtml += `<option value="" disabled ${productId ? '' : 'selected'}>Selecciona un producto…</option>`;
    for (const g of PRODUCT_GROUPS) {
      optionsHtml += `<optgroup label="${g.label}">`;
      for (const name of g.products) {
        const val = name; // usamos el nombre como id
        const sel = val === productId ? 'selected' : '';
        optionsHtml += `<option value="${val}" ${sel}>${name}</option>`;
      }
      optionsHtml += `</optgroup>`;
    }
  } else {
    optionsHtml = `
      <option value="" disabled ${productId ? "" : "selected"}>Selecciona un producto…</option>
      ${PRODUCT_CATALOG.map(p => `<option value="${p.id}" ${p.id === productId ? "selected" : ""}>${p.name}</option>`).join("")}
    `;
  }

  div.innerHTML = `
    <select class="product" required>${optionsHtml}</select>
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
  // ID corto: base36 timestamp + 4 chars aleatorios
  const shortId = (Date.now().toString(36) + Math.random().toString(36).slice(2,6)).toUpperCase();
  const entry = { id: shortId, at: now, items, meta };
  const next = [...prev, entry];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return entry;
}

async function maybeSendToSheets(entry) {
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  if (!settings.enabled || !settings.url) return { sent: false };
  try {
    // Enviar tal cual (items: [{product, quantity}])
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
  // Gate de acceso por rol: si no hay rol, volver a portada
  const role = localStorage.getItem(ROLE_KEY);
  if (!role) {
    try { window.location.replace("./menu.html"); } catch { window.location.href = "./menu.html"; }
    return;
  }
  const isAdmin = role === 'admin';
  // Esperar a que forms.js cargue si aún no está disponible
  if (!Array.isArray(window.FORMS) || window.FORMS.length === 0) {
    setTimeout(main, 120);
    return;
  }
  // Detectar formulario desde query y configurar título/estilos
  const u = new URL(window.location.href);
  const formId = u.searchParams.get("form");
  const formsList = Array.isArray(window.FORMS) ? window.FORMS : [];
  const DEFAULT_FORM_ID = 'tata-libertad';
  let cfg = null;
  if (typeof window.getFormConfig === 'function') {
    try { cfg = window.getFormConfig(formId); } catch (_) { cfg = null; }
  }
  if (!cfg && formsList.length) {
    // intentar primeramente el id por defecto
    cfg = formsList.find(f => f.id === DEFAULT_FORM_ID) || formsList[0];
  }
  if (cfg) {
    // Catálogo por formulario (si se definió)
    if (Array.isArray(cfg.catalog) && cfg.catalog.length) {
      PRODUCT_CATALOG = cfg.catalog;
    }
    // Título y subtítulo
    const titleEl = document.getElementById("form-title");
    if (titleEl) titleEl.textContent = cfg.title;
    try { document.title = `${cfg.title} — Registro`; } catch {}
    const badgeEl = document.getElementById("form-badge");
    if (badgeEl) {
      badgeEl.textContent = cfg.title;
      badgeEl.style.display = '';
      try { badgeEl.style.background = cfg.color; } catch {}
    }
    const subEl = document.getElementById("form-subtitle");
    if (subEl) subEl.textContent = `Pestaña en Google Sheets: ${cfg.sheetTab}`;
  const descEl = document.getElementById("form-desc");
  if (descEl && cfg.description) descEl.textContent = cfg.description;
    // Link del visor con sheet
    const v = document.getElementById("viewer-link");
    if (v) {
      const link = new URL("./registros.html", location.href);
      link.searchParams.set("sheet", cfg.sheetTab);
      v.href = link.toString();
    }
    // Aplicar color suave como banda superior (opcional)
    try { document.documentElement.style.setProperty("--accent", cfg.color); } catch {}

    // Personalización por formulario: LA TATA DE LA LIBERTAD
    if (cfg.id === 'tata-libertad') {
      // Construir grupos y catálogo plano para mapear nombres
      if (Array.isArray(cfg.groups) && cfg.groups.length) {
        PRODUCT_GROUPS = cfg.groups;
        const flat = [];
        const seen = new Set();
        for (const g of cfg.groups) {
          for (const name of g.products) {
            if (!seen.has(name)) { flat.push({ id: name, name }); seen.add(name); }
          }
        }
        PRODUCT_CATALOG = flat;
      }
      // Datalist de sedes
      const sedeList = document.getElementById('sede-list');
      if (sedeList && Array.isArray(cfg.sedes)) {
        sedeList.innerHTML = '';
        cfg.sedes.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s; sedeList.appendChild(opt);
        });
      }
      // Cambiar etiqueta de responsable a "Entregado por"
      const lbl = document.getElementById('label-resp');
      if (lbl) lbl.textContent = 'Entregado por';
      // Insertar controles de TIPO y FAMILIA
      const extra = document.getElementById('form-extra');
      if (extra) {
        extra.innerHTML = `
          <div class="meta" style="margin-bottom:0">
            <div>
              <label>Tipo</label>
              <select id="meta-tipo">
                <option value="MERMA">MERMA</option>
                <option value="ENTREGADO">ENTREGADO</option>
              </select>
            </div>
            <div id="familia-wrap" style="display:none">
              <label>Familia</label>
              <select id="meta-familia"></select>
            </div>
          </div>
        `;
        const familiaSel = document.getElementById('meta-familia');
        if (familiaSel && Array.isArray(cfg.familias)) {
          familiaSel.innerHTML = cfg.familias.map(f => `<option value="${f}">${f}</option>`).join('');
        }
        const tipoSel = document.getElementById('meta-tipo');
        const familiaWrap = document.getElementById('familia-wrap');
        const syncTipo = () => {
          const v = tipoSel.value;
          familiaWrap.style.display = v === 'ENTREGADO' ? '' : 'none';
        };
        tipoSel.addEventListener('change', syncTipo);
        syncTipo();
      }
    }
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
  const setYesterdayBtn = document.getElementById("set-yesterday");
  const resetSettingsBtn = document.getElementById("reset-settings");
  const hasSettingsUI = !!document.querySelector('.settings');

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
  if (setYesterdayBtn) {
    setYesterdayBtn.addEventListener("click", () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const iso = `${yyyy}-${mm}-${dd}`;
      const dateInput = document.getElementById("meta-date");
      if (dateInput) dateInput.value = iso;
    });
  }

  // Prefijar la fecha de hoy si está vacía
  const dateInputInit = document.getElementById("meta-date");
  if (dateInputInit && !dateInputInit.value) {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dateInputInit.value = `${yyyy}-${mm}-${dd}`;
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
      tipo: document.getElementById('meta-tipo')?.value || null,
      familia: (document.getElementById('meta-tipo')?.value === 'MERMA') ? null : (document.getElementById('meta-familia')?.value || null),
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

  if (exportBtn) exportBtn.addEventListener("click", () => {
    const entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (entries.length === 0) {
      updateResult("No hay registros para exportar");
      return;
    }
    const csv = toCSV(entries);
    const date = new Date().toISOString().replace(/[:.]/g, "-");
    download(`productos_${date}.csv`, csv, "text/csv;charset=utf-8");
  });

  if (clearBtn) clearBtn.addEventListener("click", () => {
    if (confirm("¿Borrar todos los registros guardados?")) {
      localStorage.removeItem(STORAGE_KEY);
      updateResult();
    }
  });

  // Cargar/Guardar ajustes de Google Sheets (solo si hay UI presente; en la portada)
  if (hasSettingsUI) {
    const existing = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (!existing.url && DEFAULT_GS_URL) {
      const preset = { ...existing, url: DEFAULT_GS_URL, enabled: true, token: DEFAULT_GS_TOKEN };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(preset));
      if (isAdmin && gsUrlInput && gsEnabledInput) {
        gsUrlInput.value = preset.url;
        gsEnabledInput.checked = preset.enabled;
        if (gsTokenInput && preset.token) gsTokenInput.value = preset.token;
      }
      if (isAdmin) updateResult("Ajustes de Google Sheets preconfigurados");
    }
    if (isAdmin && gsUrlInput && gsEnabledInput) {
      if (existing.url) gsUrlInput.value = existing.url;
      if (typeof existing.enabled === "boolean") gsEnabledInput.checked = existing.enabled;
      if (existing.token && gsTokenInput) gsTokenInput.value = existing.token;
      if (saveSettingsBtn) saveSettingsBtn.addEventListener("click", () => {
        const settings = {
          url: gsUrlInput.value.trim(),
          enabled: gsEnabledInput.checked,
          token: gsTokenInput?.value.trim() || undefined,
        };
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        updateResult("Ajustes guardados");
      });
    }
    if (isAdmin && testSettingsBtn) testSettingsBtn.addEventListener("click", async () => {
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

  }
  if (hasSettingsUI && resetSettingsBtn) {
    resetSettingsBtn.addEventListener("click", () => {
      if (confirm("¿Restablecer ajustes y recargar la página?")) {
        localStorage.removeItem(SETTINGS_KEY);
        location.reload();
      }
    });
  }

  updateResult();
  try { console.debug("Formulario cargado", { formId, cfg }); } catch {}
}
// Inicializar de forma robusta con y sin defer
if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", main);
} else {
  // DOM ya cargado
  main();
}
