// Catálogo simple de productos por defecto; cada formulario puede sobreescribirlo en assets/forms.js
let PRODUCT_CATALOG = [
  { id: "P-001", name: "Arroz 1Kg" },
  { id: "P-002", name: "Azúcar 1Kg" },
  { id: "P-003", name: "Aceite 1L" },
  { id: "P-004", name: "Harina 1Kg" },
  { id: "P-005", name: "Café 500g" },
];
let PRODUCT_GROUPS = null; // [{label, products:[string]}]
let CODE_MAP = {}; // opcional por formulario: { nombreProducto: codigo }
let UND_MAP = {};  // opcional por formulario: { nombreProducto: 'UND'|'PAQ'|'CAJ'|'KG' }

// Anti-duplicado en cliente: ventana de deduplicación e intervalo de "enfriamiento"
const LAST_SUBMIT_KEY = "last_submit_signature"; // { hash: string, at: number }
const DUPLICATE_WINDOW_MS = 20_000; // bloquear reenvíos idénticos dentro de 20s
const SUBMIT_COOLDOWN_MS = 4_000;  // mantener botón deshabilitado X segundos tras envío

const STORAGE_KEY = "productos_registrados";
const SETTINGS_KEY = "gs_settings"; // { url: string, enabled: boolean, token?: string }
const DEFAULT_GS_URL = "https://script.google.com/macros/s/AKfycby1VqJlGRa0BlG2CNnDxGSqX0xtCaVdpfGClZJaLxYfso2Q0bZvl1niTS36Oy7D0zPPmg/exec";
const DEFAULT_GS_TOKEN = "Pasantias90";
const ROLE_KEY = "app_role"; // 'worker' | 'admin'

function productNameFor(id) {
  return PRODUCT_CATALOG.find(p => p.id === id)?.name ?? "";
}

function codeForProduct(name) {
  if (name && CODE_MAP && Object.prototype.hasOwnProperty.call(CODE_MAP, name)) {
    return CODE_MAP[name];
  }
  // si el catálogo usa {id: codigo, name: nombre}
  const p = PRODUCT_CATALOG.find(p => p.name === name);
  if (p && p.id && /^([A-Z]{2,}|ST|PT)/.test(p.id)) return p.id;
  return "";
}

function undForProduct(name) {
  if (name && UND_MAP && Object.prototype.hasOwnProperty.call(UND_MAP, name)) {
    return UND_MAP[name];
  }
  // heurística mínima de respaldo
  const p = String(name || '').toUpperCase();
  if (p.includes('CAJA')) return 'CAJ';
  if (p.includes('TEQUEÑOS')) return 'PAQ';
  if (p.includes('1 K') || p.endsWith(' 1 K') || p.includes(' 1K')) return 'KG';
  return 'UND';
}

// Stringify estable (ordena claves) para firmar el contenido a enviar
function stableStringify(obj) {
  if (obj && typeof obj === 'object') {
    if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
    const keys = Object.keys(obj).sort();
    return `{${keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k])).join(',')}}`;
  }
  return JSON.stringify(obj);
}

function buildSubmitSignature(items, meta) {
  const normItems = [...items]
    .map(it => ({ p: String(it.product || ''), q: Number(it.quantity || 0) }))
    .sort((a, b) => a.p.localeCompare(b.p) || a.q - b.q);
  const m = {
    sede: meta?.sede || '',
    responsable: meta?.responsable || '',
    fecha: meta?.fecha || '',
    sheet: meta?.sheet || '',
    formId: meta?.formId || '',
    tipo: meta?.tipo || '',
    familia: meta?.familia || ''
  };
  return stableStringify({ items: normItems, meta: m });
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
    // Permitir URL específica por formulario (si viene en meta)
    const effectiveUrl = (entry && entry.meta && entry.meta.gsUrl) ? entry.meta.gsUrl : settings.url;
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
          body: JSON.stringify({ url: effectiveUrl, entry: payloadObj }),
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
      const res = await fetch(effectiveUrl, {
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
      await fetch(effectiveUrl, {
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
  const header = ["entry_id", "timestamp", "code", "product", "quantity", "sede", "responsable", "fecha"];
  const lines = [header.join(",")];
  const mapName = (val) => {
    // si ya viene el nombre en el item, úsalo; si no, busca por id
    const found = PRODUCT_CATALOG.find(p => p.id === val || p.name === val);
    return found?.name || String(val);
  };

  for (const e of entries) {
    for (const it of e.items) {
      const row = [
        e.id,
        e.at,
        it.code ?? "",
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
    // Mapa de códigos opcional
    if (cfg.codeMap && typeof cfg.codeMap === 'object') {
      CODE_MAP = cfg.codeMap;
    } else {
      CODE_MAP = {};
    }
    if (cfg.undMap && typeof cfg.undMap === 'object') {
      UND_MAP = cfg.undMap;
    } else {
      UND_MAP = {};
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
    // Link del visor con sheet (agrega formId y ssurl si aplica)
    const v = document.getElementById("viewer-link");
    if (v) {
      const link = new URL("./registros.html", location.href);
      link.searchParams.set("sheet", cfg.sheetTab);
      if (cfg.id) link.searchParams.set("formId", cfg.id);
      if (cfg.ssurl) link.searchParams.set("ssurl", cfg.ssurl);
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
            // si se definió un codeMap, usarlo como id
            const code = (cfg.codeMap && cfg.codeMap[name]) ? cfg.codeMap[name] : name;
            if (!seen.has(name)) { flat.push({ id: code, name }); seen.add(name); }
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
          const showFam = v === 'ENTREGADO';
          familiaWrap.style.display = showFam ? '' : 'none';
          if (!showFam && familiaSel) {
            // limpiar valor de familia cuando no aplica (MERMA u otros)
            familiaSel.value = '';
          }
        };
        tipoSel.addEventListener('change', syncTipo);
        syncTipo();
      }
    }
    // Personalización por formulario: CONGELADOS HOJALDRE (simple)
    if (cfg.id === 'congelados-hojaldre') {
      // poblar sedes si están definidas
      const sedeList = document.getElementById('sede-list');
      if (sedeList && Array.isArray(cfg.sedes)) {
        sedeList.innerHTML = '';
        cfg.sedes.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s; sedeList.appendChild(opt);
        });
      }
      // etiqueta de responsable
      const lbl = document.getElementById('label-resp');
      if (lbl) lbl.textContent = 'Entregado por';
      // Este formulario no tiene TIPO/FAMILIA, así que no añadimos controles extra.
    }
  }
  // Personalización por formulario: INVENTARIO PRODUCTO TERMINADO
  if (cfg.id === 'inventario-pt') {
    // poblar sedes si están definidas (nombres completos)
    const sedeList = document.getElementById('sede-list');
    if (sedeList && Array.isArray(cfg.sedes)) {
      sedeList.innerHTML = '';
      cfg.sedes.forEach(s => { const opt = document.createElement('option'); opt.value = s; sedeList.appendChild(opt); });
    }
    // Controles extra: Tipo de carga y Empresa (usa los ids genéricos meta-tipo/meta-familia)
    const extra = document.getElementById('form-extra');
    if (extra) {
      extra.innerHTML = `
        <div class="meta" style="margin-bottom:0">
          <div>
            <label>Tipo de carga</label>
            <select id="meta-tipo">
              <option value="INVENTARIO DE CIERRE">INVENTARIO DE CIERRE</option>
              <option value="DEVOLUCIONES">DEVOLUCIONES</option>
            </select>
          </div>
          <div id="empresa-wrap" style="display:none">
            <label>Empresa</label>
            <select id="meta-familia">
              <option value="PANIFICADORA COSTA DORADA, C.A">PANIFICADORA COSTA DORADA, C.A</option>
              <option value="LA TATA DE LA LIBERTAD, C.A">LA TATA DE LA LIBERTAD, C.A</option>
            </select>
          </div>
        </div>
        <small class="muted" id="dev-note" style="display:none">Las devoluciones aplican solo para la sede BELLO CAMPO.</small>
      `;
    }
    const tipoSel = document.getElementById('meta-tipo');
    const empresaWrap = document.getElementById('empresa-wrap');
    const empresaSel = document.getElementById('meta-familia');
    const sedeInput = document.getElementById('meta-sede');
    const devNote = document.getElementById('dev-note');

    // utilidades UI locales
    const rows = document.getElementById('rows');
    const addRowBtn = document.getElementById('add-row');
    function setItemsVisible(show) {
      if (rows) rows.style.display = show ? '' : 'none';
      if (addRowBtn) addRowBtn.style.display = show ? '' : 'none';
    }
    function resetRows() {
      if (!rows) return;
      rows.innerHTML = '';
      rows.appendChild(createRow());
    }
    function applyCatalog(names) {
      PRODUCT_GROUPS = null;
      if (Array.isArray(names) && names.length) {
        // mapear a {id,name}; usamos el nombre como id para que codeMap lo resuelva
        PRODUCT_CATALOG = names.map(n => ({ id: n, name: n }));
      } else {
        PRODUCT_CATALOG = [];
      }
      resetRows();
    }
    function syncState() {
      const tipo = (tipoSel?.value || '').toUpperCase();
      const sede = (sedeInput?.value || '').trim().toUpperCase();
      const isDev = tipo === 'DEVOLUCIONES';
      if (empresaWrap) {
        empresaWrap.style.display = isDev ? '' : 'none';
        if (!isDev && empresaSel) empresaSel.value = '';
      }
      if (devNote) devNote.style.display = isDev ? '' : 'none';
      if (!isDev) {
        // Inventario de cierre: usar catálogo LA TATA
        CODE_MAP = cfg.codeMap || {};
        UND_MAP = cfg.undMap || {};
        applyCatalog((cfg.inventory && cfg.inventory.lata) ? cfg.inventory.lata : []);
        setItemsVisible(true);
        return;
      }
      // Devoluciones: solo válido para BELLO CAMPO
      const isBelloCampo = sede === 'BELLO CAMPO' || sede === 'BC';
      if (!isBelloCampo) {
        setItemsVisible(false);
        applyCatalog([]);
        return;
      }
      const emp = (empresaSel?.value || '').toUpperCase();
      if (emp === 'PANIFICADORA COSTA DORADA, C.A') {
        // Catálogo PDT (sin códigos específicos)
        CODE_MAP = {}; // no tenemos códigos PDT en este cliente
        UND_MAP = {};  // usar heurística
        applyCatalog((cfg.inventory && cfg.inventory.pdt) ? cfg.inventory.pdt : []);
        setItemsVisible(true);
      } else {
        // Catálogo LA TATA
        CODE_MAP = cfg.codeMap || {};
        UND_MAP = cfg.undMap || {};
        applyCatalog((cfg.inventory && cfg.inventory.lata) ? cfg.inventory.lata : []);
        setItemsVisible(true);
      }
    }
    tipoSel?.addEventListener('change', syncState);
    empresaSel?.addEventListener('change', syncState);
    sedeInput?.addEventListener('input', syncState);
    // Estado inicial
    syncState();
  }

  const rowsEl = document.getElementById("rows");
  const addBtn = document.getElementById("add-row");
  const form = document.getElementById("products-form");
  const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
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

  let isSubmitting = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const items = readForm();
    const v = validate(items);
    if (!v.ok) {
      updateResult(`<span style="color:#ffb3b3">${v.errors.join("<br>")}</span>`);
      return;
    }
    // Construir metadata mínima para firma y detección de duplicados
    const metaProbe = {
      sede: document.getElementById("meta-sede").value.trim() || null,
      responsable: document.getElementById("meta-resp").value.trim() || null,
      fecha: document.getElementById("meta-date").value || null,
      formId: cfg?.id || null,
      formName: cfg?.title || null,
      sheet: cfg?.sheetTab || null,
      tipo: document.getElementById('meta-tipo')?.value || null,
      familia: (document.getElementById('meta-tipo')?.value === 'MERMA') ? null : (document.getElementById('meta-familia')?.value || null),
      // Overrides opcionales por formulario
      gsUrl: (cfg && typeof cfg.gsUrl === 'string' && cfg.gsUrl) ? cfg.gsUrl : null,
      ssid: (cfg && typeof cfg.ssid === 'string' && cfg.ssid) ? cfg.ssid : null,
      ssurl: (cfg && typeof cfg.ssurl === 'string' && cfg.ssurl) ? cfg.ssurl : null,
    };
    const signature = buildSubmitSignature(items, metaProbe);
    const lastSig = JSON.parse(localStorage.getItem(LAST_SUBMIT_KEY) || "null");
    const nowMs = Date.now();
    if (lastSig && lastSig.hash === signature && (nowMs - lastSig.at) < DUPLICATE_WINDOW_MS) {
      const waitSec = Math.ceil((DUPLICATE_WINDOW_MS - (nowMs - lastSig.at)) / 1000);
      updateResult(`<span style="color:#ffb3b3">Este envío es idéntico a uno reciente. Espera ${waitSec}s para evitar duplicados.</span>`);
      return;
    }
    if (isSubmitting) return; // evita doble envío por doble click
    isSubmitting = true;
    // deshabilitar botón mientras envía
    let btnOldText = null;
    if (submitBtn) {
      btnOldText = submitBtn.textContent;
      submitBtn.textContent = 'Enviando…';
      submitBtn.disabled = true;
    }
    const meta = metaProbe;
    let sendResult = null;
    try {
      // enriquecer con código y unidad por producto
      const itemsWithCode = items.map(it => ({ ...it, code: codeForProduct(it.product), und: undForProduct(it.product) }));
      const entry = save(itemsWithCode, meta);
      let msg = `Guardado ${new Date(entry.at).toLocaleString()} (${entry.items.length} item/s)`;
      const send = await maybeSendToSheets(entry);
      sendResult = send;
      if (send.sent) {
        // Registrar firma para bloquear reintentos idénticos por unos segundos
        localStorage.setItem(LAST_SUBMIT_KEY, JSON.stringify({ hash: signature, at: Date.now() }));
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
    } finally {
      isSubmitting = false;
      if (submitBtn) {
        const reenable = () => {
          submitBtn.disabled = false;
          if (btnOldText != null) submitBtn.textContent = btnOldText;
        };
        // Mantener un pequeño cooldown si se envió correctamente
        if (sendResult && sendResult.sent) {
          setTimeout(reenable, SUBMIT_COOLDOWN_MS);
        } else {
          reenable();
        }
      }
    }
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
  if (isAdmin && hasSettingsUI) {
    const existing = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const preset = { ...existing, url: DEFAULT_GS_URL, enabled: true, token: DEFAULT_GS_TOKEN };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(preset));
    if (gsUrlInput && gsEnabledInput) {
      gsUrlInput.value = preset.url;
      gsEnabledInput.checked = preset.enabled;
      if (gsTokenInput && preset.token) gsTokenInput.value = preset.token;
    }
    updateResult("Ajustes de Google Sheets preconfigurados");

    if (saveSettingsBtn) saveSettingsBtn.addEventListener("click", () => {
      const settings = {
        url: gsUrlInput.value.trim(),
        enabled: gsEnabledInput.checked,
        token: gsTokenInput?.value.trim() || undefined,
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      updateResult("Ajustes guardados");
    });

    if (testSettingsBtn) testSettingsBtn.addEventListener("click", async () => {
      const url = gsUrlInput.value.trim();
      if (!url) return updateResult("Primero ingresa la URL del Web App");
      const token = gsTokenInput ? (gsTokenInput.value || '').trim() : '';
      const probe = {
        id: "test-" + Math.random().toString(36).slice(2, 8),
        at: new Date().toISOString(),
        items: [{ product: "PING", quantity: 1 }],
        ...(token ? { token } : {}),
      };
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(probe),
          mode: "cors",
        });
        const text = await res.text();
        updateResult(`Prueba: HTTP ${res.status} — ${text.substring(0, 200)}...`);
      } catch (err) {
        updateResult(`Error de prueba: ${String(err)}`);
      }
    });

    if (resetSettingsBtn) resetSettingsBtn.addEventListener("click", () => {
      if (confirm("¿Restablecer ajustes y recargar la página?")) {
        localStorage.removeItem(SETTINGS_KEY);
        location.reload();
      }
    });
  } else {
    // Ensure default settings are applied for non-admin users
    const preset = { url: DEFAULT_GS_URL, enabled: true, token: DEFAULT_GS_TOKEN };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(preset));
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

const tipoSel = document.getElementById('meta-tipo');
const sedeInput = document.getElementById('meta-sede');

if (tipoSel && sedeInput) {
  tipoSel.addEventListener('change', () => {
    if (tipoSel.value.toUpperCase() === 'DEVOLUCIONES') {
      sedeInput.value = 'BELLO CAMPO';
    }
  });
}

// Personalización para el formulario de solicitud de LA TATA DE LA LIBERTAD
if (cfg.id === 'solicitud-tata-libertad') {
  // Datalist de sedes
  const sedeList = document.getElementById('sede-list');
  if (sedeList && Array.isArray(cfg.sedes)) {
    sedeList.innerHTML = '';
    cfg.sedes.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; sedeList.appendChild(opt);
    });
  }
  // Etiqueta de responsable
  const lbl = document.getElementById('label-resp');
  if (lbl) lbl.textContent = 'Responsable';
  // Ocultar controles extra, solo mostrar los campos básicos
  const extra = document.getElementById('form-extra');
  if (extra) extra.innerHTML = '';
  // Ocultar tipo y familia si existen
  const tipoSel = document.getElementById('meta-tipo');
  if (tipoSel) tipoSel.parentElement.style.display = 'none';
  const familiaWrap = document.getElementById('familia-wrap');
  if (familiaWrap) familiaWrap.style.display = 'none';
}
