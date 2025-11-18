// Catálogo por defecto vacío. Siempre se sobreescribe desde assets/forms.js
// según el formulario activo (o por grupos en LA TATA / inventario).
let PRODUCT_CATALOG = [];
let PRODUCT_GROUPS = null; // [{label, products:[string]}]
let QTY_LABEL = 'Cantidad'; // texto del label para el campo cantidad en las filas
let CODE_MAP = {}; // opcional por formulario: { nombreProducto: codigo }
let UND_MAP = {};  // opcional por formulario: { nombreProducto: 'UND'|'PAQ'|'CAJ'|'KG' }
// Catálogo de códigos/unidades cargado desde TSV (cache)
let CODE_TSV_READY = false;
let CODE_TSV_DATA = { names: [], codeMap: {}, undMap: {} };

// Familias auto-detectadas (DONAS, HOJALDRE, PANADERIA)
const FAMILY_SETS = { DONAS: new Set(), HOJALDRE: new Set(), PANADERIA: new Set() };
let FAMILIES_LOADED = false;
let SHOW_ROW_FAMILY = false; // mostrar columna de familia por fila (solo solicitudes-pedido)

// Modo debug: habilita logs detallados si ?debug=1 o localStorage.debug === '1'
function isDebug() {
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.get('debug') === '1') return true;
  } catch {}
  try { if (localStorage.getItem('debug') === '1') return true; } catch {}
  return false;
}

async function loadFamilySets() {
  try {
    const paths = [
      './assets/DONAS.tsv',
      './assets/HOJALDRE.tsv',
      './assets/PANADERIA.tsv',
    ];
    const texts = await Promise.all(paths.map(p => fetch(p).then(r => r.ok ? r.text() : '')));
    const [donas, hojaldre, panaderia] = texts;
    function fillSet(tsv, set) {
      if (!tsv) return;
      tsv.split(/\r?\n/).forEach(line => {
        if (!line.trim()) return;
        const parts = line.split('\t');
        const name = parts[3] || '';
        if (name) set.add(name.trim());
      });
    }
    fillSet(donas, FAMILY_SETS.DONAS);
    fillSet(hojaldre, FAMILY_SETS.HOJALDRE);
    fillSet(panaderia, FAMILY_SETS.PANADERIA);
    FAMILIES_LOADED = true;
  } catch (e) {
    console.warn('No se pudieron cargar las familias desde TSV:', e);
    FAMILIES_LOADED = false; // seguimos, la UI funciona sin familia
  }
}

// Carga catálogo de códigos y unidades desde TSV: CODIGOS, DESCRIPCION, Unidad_Primaria
async function loadCodesFromTSV() {
  if (CODE_TSV_READY) return CODE_TSV_DATA;
  try {
    const path = './assets/CODIGOS%20DESCRIPCION%20Unidad_Primaria.tsv';
    const txt = await fetch(path).then(r => r.ok ? r.text() : '');
    if (!txt) { CODE_TSV_READY = true; return CODE_TSV_DATA; }
    const lines = txt.split(/\r?\n/).filter(l => l.trim().length);
    // Detectar encabezados
    const head = (lines.shift() || '').split('\t').map(s => s.trim());
    const idxCod = head.findIndex(h => /CODIGOS/i.test(h));
    const idxDesc = head.findIndex(h => /DESCRIPCION/i.test(h));
    const idxUnd = head.findIndex(h => /Unidad/i.test(h));
    const names = [];
    const codeMap = {};
    const undMap = {};
    for (const line of lines) {
      const parts = line.split('\t');
      const code = String(parts[idxCod] || '').trim();
      const name = String(parts[idxDesc] || '').trim();
      const und = String(parts[idxUnd] || '').trim().toUpperCase();
      if (!name) continue;
      names.push(name);
      if (code) codeMap[name] = code;
      if (und) undMap[name] = und;
    }
    CODE_TSV_DATA = { names, codeMap, undMap };
    CODE_TSV_READY = true;
  } catch (e) {
    console.warn('No se pudo cargar el TSV de códigos:', e);
    CODE_TSV_READY = true; // evitar reintentos agresivos
  }
  return CODE_TSV_DATA;
}

// Lanzar precarga oportunista de TSV en segundo plano
try { loadCodesFromTSV().catch(() => {}); } catch {}

function familyForProduct(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (FAMILY_SETS.DONAS.has(n)) return 'DONAS';
  if (FAMILY_SETS.HOJALDRE.has(n)) return 'HOJALDRE';
  if (FAMILY_SETS.PANADERIA.has(n)) return 'PANADERIA';
  return '';
}

function productDisplayName(val) {
  // Si val coincide con un id del catálogo, devuelve su nombre; si no, asume que ya es el nombre
  const found = PRODUCT_CATALOG.find(p => p.id === val);
  return found?.name || String(val || '');
}

function isCodeLike(v) {
  const s = String(v || '').trim();
  // PTSU0065, ST..., PT..., u otros códigos alfanuméricos en mayúsculas
  return /^[A-Z]{2,}[A-Z0-9]*\d{2,}$/.test(s);
}

function nameForCode(code) {
  const c = String(code || '').trim();
  if (!c) return '';
  // 1) Invertir CODE_MAP si existe
  for (const [name, k] of Object.entries(CODE_MAP || {})) {
    if (k === c) return name;
  }
  // 2) Buscar en el catálogo si el id es un código
  const found = PRODUCT_CATALOG.find(p => p.id === c);
  if (found && found.name) return found.name;
  return '';
}

// Valor que debe setearse en el <select> para un nombre dado
function selectValueForName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  if (Array.isArray(PRODUCT_GROUPS) && PRODUCT_GROUPS.length) {
    // En grupos, el value de las <option> es el nombre
    return n;
  }
  const found = PRODUCT_CATALOG.find(p => p.name === n);
  return found ? found.id : n;
}

// Construye un índice de búsqueda {id,name,code,value}
function buildSearchIndex() {
  const list = [];
  if (Array.isArray(PRODUCT_GROUPS) && PRODUCT_GROUPS.length) {
    for (const g of PRODUCT_GROUPS) {
      for (const name of g.products) {
        const code = CODE_MAP?.[name] || (PRODUCT_CATALOG.find(p => p.name === name)?.id) || '';
        list.push({ id: code || name, name, code, value: selectValueForName(name) });
      }
    }
    return list;
  }
  for (const p of PRODUCT_CATALOG) {
    list.push({ id: p.id, name: p.name, code: (/^[A-Z0-9-]+$/.test(p.id) ? p.id : (CODE_MAP?.[p.name] || '')), value: p.id });
  }
  return list;
}

// Abre modal para buscar productos y asigna al <select> destino
function openProductPicker(targetSelect) {
  const data = buildSearchIndex();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <h3>Buscar producto</h3>
      <input class="searchbox" type="text" placeholder="Escribe para filtrar…" />
      <div class="list"></div>
    </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('.searchbox');
  const list = overlay.querySelector('.list');
  let filtered = data.slice(0);
  let active = 0;
  const render = () => {
    list.innerHTML = '';
    filtered.forEach((it, i) => {
      const div = document.createElement('div');
      div.className = 'item' + (i === active ? ' active' : '');
      div.innerHTML = `<div class="name">${it.name}</div><div class="code">${it.code || ''}</div>`;
      div.addEventListener('click', () => {
        targetSelect.value = it.value;
        targetSelect.dispatchEvent(new Event('change'));
        const row = targetSelect.closest('.row');
        row?.querySelector('.quantity')?.focus();
        document.body.removeChild(overlay);
      });
      list.appendChild(div);
    });
  };
  const applyFilter = () => {
    const q = String(input.value || '').toLowerCase().trim();
    if (!q) { filtered = data.slice(0, 300); active = 0; return render(); }
    filtered = data.filter(it => it.name.toLowerCase().includes(q) || String(it.code||'').toLowerCase().includes(q)).slice(0, 300);
    active = 0; render();
  };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
  input.addEventListener('input', applyFilter);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { document.body.removeChild(overlay); }
    if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, filtered.length - 1); render(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
    if (e.key === 'Enter') {
      const it = filtered[active];
      if (it) {
        targetSelect.value = it.value;
        targetSelect.dispatchEvent(new Event('change'));
        const row = targetSelect.closest('.row');
        row?.querySelector('.quantity')?.focus();
        document.body.removeChild(overlay);
      }
    }
  });
  applyFilter();
  setTimeout(() => input.focus(), 0);
}

function recomputeFamiliaUI() {
  // Solo muestra en Solicitudes simple (solicitudes-pedido)
  const famInput = document.getElementById('meta-familia');
  if (!famInput) return;
  const items = readForm();
  const fams = new Set();
  for (const it of items) {
    if (it.product) {
      const f = familyForProduct(it.product);
      if (f) fams.add(f);
    }
  }
  if (fams.size === 0) {
    famInput.value = '';
  } else if (fams.size === 1) {
    famInput.value = Array.from(fams)[0];
  } else {
    famInput.value = 'MIXTO';
  }
}

// Anti-duplicado en cliente: ventana de deduplicación e intervalo de "enfriamiento"
const LAST_SUBMIT_KEY = "last_submit_signature"; // { hash: string, at: number }
const DUPLICATE_WINDOW_MS = 20_000; // bloquear reenvíos idénticos dentro de 20s
const SUBMIT_COOLDOWN_MS = 4_000;  // mantener botón deshabilitado X segundos tras envío

// Guardado local (localStorage). Pon en false para desactivar completamente el almacenamiento local
const ENABLE_LOCAL_SAVE = false;
const STORAGE_KEY = "productos_registrados";
const SETTINGS_KEY = "gs_settings"; // { url: string, enabled: boolean, token?: string }
const DEFAULT_GS_URL = "https://script.google.com/macros/s/AKfycbzwXG6PkYAkVDyerexOYEb0Ab3JffceZPK8GOGMTgcz-2RXHGfesatHZ0yeNp2o_6mKsQ/exec";
const DEFAULT_GS_TOKEN = "Pasantias90";
const ROLE_KEY = "app_role"; // 'worker' | 'admin'

function productNameFor(id) {
  return PRODUCT_CATALOG.find(p => p.id === id)?.name ?? "";
}

function codeForProduct(name) {
  // 1) Priorizar CODE_MAP explícito
  if (name && CODE_MAP && Object.prototype.hasOwnProperty.call(CODE_MAP, name)) {
    return CODE_MAP[name];
  }
  // 2) Solo usar el id del catálogo si realmente parece un código (no un nombre)
  const p = PRODUCT_CATALOG.find(p => p.name === name);
  if (p && p.id && isCodeLike(p.id)) return p.id;
  // 3) Fallback: si el TSV ya está cargado, usarlo como apoyo
  try {
    const c = CODE_TSV_DATA && CODE_TSV_DATA.codeMap ? CODE_TSV_DATA.codeMap[name] : '';
    if (c) return c;
  } catch {}
  // 4) En caso contrario, sin código
  return "";
}

function undForProduct(name) {
  if (name && UND_MAP && Object.prototype.hasOwnProperty.call(UND_MAP, name)) {
    return UND_MAP[name];
  }
  // Fallback: TSV si está disponible
  try {
    const u = CODE_TSV_DATA && CODE_TSV_DATA.undMap ? CODE_TSV_DATA.undMap[name] : '';
    if (u) return u;
  } catch {}
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
  // Cuando mostramos familia por fila, la fila usa 4 columnas (producto, familia, cantidad, borrar)
  div.className = "row" + (SHOW_ROW_FAMILY ? " has-family" : "");
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

  const qtyLabel = QTY_LABEL || 'Cantidad';
  // Familia por fila: como <select> para permitir override manual cuando no se reconoce
  const famHtml = SHOW_ROW_FAMILY ? `
      <select class="family" title="Familia">
        <option value="">Familia…</option>
        <option value="DONAS">DONAS</option>
        <option value="HOJALDRE">HOJALDRE</option>
        <option value="PANADERIA">PANADERIA</option>
      </select>
    ` : '';
  const searchHtml = `<button type="button" class="search-btn" title="Buscar producto">🔎</button>`;
  if (SHOW_ROW_FAMILY) {
    // Orden: producto | familia | buscar | cantidad | borrar
    div.innerHTML = `
      <select class="product" required>${optionsHtml}</select>
      ${famHtml}
      ${searchHtml}
      <div class="qty-cell">
        <label class="row-label">${qtyLabel}</label>
        <input type="number" class="quantity" min="0" step="1" placeholder="0" value="${quantity}" required />
      </div>
      <button type="button" class="remove-btn" title="Eliminar fila">✕</button>
    `;
  } else {
    // Orden: producto | buscar | cantidad | borrar
    div.innerHTML = `
      <select class="product" required>${optionsHtml}</select>
      ${searchHtml}
      <div class="qty-cell">
        <label class="row-label">${qtyLabel}</label>
        <input type="number" class="quantity" min="0" step="1" placeholder="0" value="${quantity}" required />
      </div>
      <button type="button" class="remove-btn" title="Eliminar fila">✕</button>
    `;
  }

  div.querySelector(".remove-btn").addEventListener("click", () => {
    div.remove();
    updateResult();
    // actualizar familia automática si aplica
    recomputeFamiliaUI();
  });

  // Recalcular familia por fila cuando cambia el producto seleccionado
  const prodSel = div.querySelector('.product');
  const famInput = div.querySelector('.family');
  const searchBtn = div.querySelector('.search-btn');
  const setRowFamily = () => {
    if (!famInput) return;
    const val = prodSel?.value || '';
    const name = productDisplayName(val);
    const detected = familyForProduct(name) || '';
    const currentForm = window?.CURRENT_FORM_ID || '';
    const sinSolicitudChk = document.getElementById('meta-sin-solicitud');
    const isSinSolicitud = sinSolicitudChk ? !!sinSolicitudChk.checked : false;
    // Comportamiento especial para LA TATA DE LA LIBERTAD:
    //  - Si NO es "registro sin solicitud" (isSinSolicitud === false) entonces la familia se aplica automáticamente
    //    y se deshabilita aunque no se detecte (queda vacía si no la conocemos).
    //  - Si es "registro sin solicitud" permitir editar manualmente (para no dejar espacios en blanco en Sheets).
    if (currentForm === 'tata-libertad') {
      if (!isSinSolicitud) {
        if (detected) famInput.value = detected;
        famInput.disabled = true;
        famInput.title = detected ? `Familia (auto: ${detected})` : 'Familia (solo editable en registros sin solicitud)';
      } else {
        if (detected && !famInput.value) famInput.value = detected; // valor inicial, editable
        famInput.disabled = false;
        famInput.title = detected ? `Familia (auto, puedes editar)` : 'Familia';
      }
      return;
    }
    // Formulario de solicitudes-pedido (comportamiento original): deshabilitar solo si se detecta
    if (detected) {
      famInput.value = detected;
      famInput.disabled = true;
      famInput.title = `Familia (auto: ${detected})`;
    } else {
      if (!famInput.value) famInput.value = '';
      famInput.disabled = false;
      famInput.title = 'Familia';
    }
  };
  if (prodSel) {
    prodSel.addEventListener('change', setRowFamily);
    // Inicializar en caso de que productId venga prefijado
    setRowFamily();
  }
  if (searchBtn && prodSel) {
    searchBtn.addEventListener('click', () => openProductPicker(prodSel));
  }

  return div;
}

function readForm() {
  const rows = Array.from(document.querySelectorAll("#rows .row"));
  const items = rows.map((row) => {
    const product = row.querySelector(".product").value;
    const qtyStr = row.querySelector(".quantity").value.trim();
    const quantity = qtyStr === "" ? NaN : Number(qtyStr);
    const famSel = row.querySelector('.family');
    const family = famSel ? String(famSel.value || '').trim().toUpperCase() : '';
    return { product, quantity, family };
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
  const now = new Date().toISOString();
  // ID corto: base36 timestamp + 4 chars aleatorios
  const shortId = (Date.now().toString(36) + Math.random().toString(36).slice(2,6)).toUpperCase();
  const entry = { id: shortId, at: now, items, meta };
  if (!ENABLE_LOCAL_SAVE) {
    return entry; // no persistimos en localStorage cuando está desactivado
  }
  const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  const next = [...prev, entry];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return entry;
}

async function maybeSendToSheets(entry) {
  const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
  if (!settings.enabled || !settings.url) return { sent: false };
  try {
    // Enviar tal cual (items: [{product, quantity}])
    const payloadObj = (() => {
      const base = { ...entry };
      if (settings.token) base.token = settings.token;
      if (isDebug()) base.debug = true; // pedir eco/idx al backend cuando debug
      return base;
    })();
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
  const settingsMsg = document.getElementById("settings-msg");
  // Si no hay elemento `#result` (p. ej. estamos en menu.html), usar el span pequeño
  // `#settings-msg` como fallback para mostrar el resultado de la prueba.
  if (!el && !settingsMsg) return;
  if (!ENABLE_LOCAL_SAVE && message == null) {
    // Sin guardado local: no mostramos resumen, solo mensajes explícitos
    if (el) { el.classList.add("hidden"); el.innerHTML = ""; }
    if (!el && settingsMsg) { settingsMsg.textContent = ""; }
    return;
  }
  if (ENABLE_LOCAL_SAVE && message == null) {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (all.length === 0) {
      if (el) { el.classList.add("hidden"); el.innerHTML = ""; }
      if (!el && settingsMsg) { settingsMsg.textContent = ""; }
      return;
    }
    const count = all.reduce((acc, e) => acc + e.items.length, 0);
    if (el) {
      el.classList.remove("hidden");
      el.innerHTML = `<strong>${all.length}</strong> registro(s), <strong>${count}</strong> item(s) guardados.`;
    } else if (settingsMsg) {
      settingsMsg.textContent = `${all.length} registro(s), ${count} item(s) guardados.`;
    }
    return;
  }
  if (el) {
    el.classList.remove("hidden");
    el.innerHTML = message;
  } else if (settingsMsg) {
    // Mostrar texto plano en el pequeño span (strip HTML)
    const txt = (typeof message === 'string') ? message.replace(/<[^>]*>?/gm, '') : String(message);
    settingsMsg.textContent = txt;
  }
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
  // Configuración inicial
  function loadFormByTab(tabId) {
    const formConfig = window.FORMS.find(f => f.id === tabId);
    if (!formConfig) {
      console.error(`No se encontró configuración para la pestaña: ${tabId}`);
      return;
    }

    // Actualizar el título y descripción del formulario
    const titleEl = document.getElementById("form-title");
    const descEl = document.getElementById("form-desc");
    if (titleEl) titleEl.textContent = formConfig.title;
    if (descEl) descEl.textContent = formConfig.description;
  }

  // Detectar la pestaña seleccionada al cargar la página
  const urlParams = new URLSearchParams(window.location.search);
  const hasFormParam = urlParams.has("form");
  if (!hasFormParam) {
    const activeTab = urlParams.get("tab") || "solicitudes";
    loadFormByTab(activeTab);
  }
}


  // Gate de acceso por rol: si no hay rol, volver a portada
  const role = localStorage.getItem(ROLE_KEY);
  if (!role) {
    try { window.location.replace("./menu.html"); } catch { window.location.href = "./menu.html"; }
    // No usamos 'return' en el nivel superior para evitar errores de sintaxis
  }
  const isAdmin = role === 'admin';
  if (!Array.isArray(window.FORMS) || window.FORMS.length === 0) {
    // Defer inicialización si aún no cargó forms.js
    setTimeout(main, 120);
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
    // Exponer id de formulario actual para lógica contextual en filas
    try { window.CURRENT_FORM_ID = cfg.id; } catch {}
    // Herencia opcional de otro formulario (para reutilizar catálogo/grupos/mapas)
    if (cfg.inheritFrom) {
      try {
        const base = (Array.isArray(formsList) ? formsList : []).find(f => f.id === cfg.inheritFrom);
        if (base && typeof base === 'object') {
          if (!cfg.groups && Array.isArray(base.groups)) cfg.groups = base.groups
          if (!cfg.catalog && Array.isArray(base.catalog)) cfg.catalog = base.catalog;
          if (!cfg.codeMap && base.codeMap) cfg.codeMap = base.codeMap;
          if (!cfg.undMap && base.undMap) cfg.undMap = base.undMap;
          if (!cfg.sedes && Array.isArray(base.sedes)) cfg.sedes = base.sedes;
        }
      } catch {}
    }
    // Catálogo por formulario (si se definió)
    if (Array.isArray(cfg.catalog) && cfg.catalog.length) {
      PRODUCT_CATALOG = cfg.catalog;
      try { console.debug('[DBG] PRODUCT_CATALOG loaded from cfg.catalog', { cfgId: cfg.id, source: 'cfg.catalog', length: PRODUCT_CATALOG.length, sample: PRODUCT_CATALOG.slice(0,5) }); } catch(_) {}
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
    // Si estamos en la pestaña "registros" y es el formulario LA TATA, aplicar título especial
    let effectiveTitle = cfg.title;
    try {
      const u2 = new URL(window.location.href);
      const activeTab = (u2.searchParams.get('tab') || '').toLowerCase();
      if ((cfg.id === 'tata-libertad') && activeTab === 'registros') {
        effectiveTitle = 'LA TATA DE LA LIBERTAD REGISTROS';
      }
    } catch {}
    
    if (titleEl) titleEl.textContent = effectiveTitle;
    try { document.title = `${effectiveTitle} — Registro`; } catch {}
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
    // Link del visor con sheet (y formId cuando aplica)
    const v = document.getElementById("viewer-link");
    if (v) {
      const link = new URL("./registros.html", location.href);
      link.searchParams.set("sheet", cfg.sheetTab);
      // Para el visor de Inventario PT, pasar formId para que el Apps Script rote al target correcto si lo soporta
      if (cfg.id === 'registros') {
        link.searchParams.set('formId', 'inventario-pt');
      }
      v.href = link.toString();
    }
    // Aplicar color suave como banda superior (opcional)
    try { document.documentElement.style.setProperty("--accent", cfg.color); } catch {}

  // Personalización por formulario: LA TATA DE LA LIBERTAD (alias: solicitudes)
    if (cfg.id === 'tata-libertad' || cfg.id === 'solicitudes') {
      QTY_LABEL = 'CANTIDAD REGISTRADA';
      // Mostrar columna de familia por fila y cargar sets de familias para auto-detección
      SHOW_ROW_FAMILY = true;
      loadFamilySets().catch(() => {});
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
        try { console.debug('[DBG] PRODUCT_CATALOG built from cfg.groups (tata-libertad)', { cfgId: cfg.id, groups: cfg.groups.length, length: PRODUCT_CATALOG.length, sample: PRODUCT_CATALOG.slice(0,5) }); } catch(_) {}
      }
      // Datalist de sedes
  const sedeList = document.getElementById('meta-sede');
      if (sedeList && Array.isArray(cfg.sedes)) {
        sedeList.innerHTML = '';
        cfg.sedes.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          // mostrar texto legible en el <select>
          opt.textContent = s;
          sedeList.appendChild(opt);
        });
      }
      // Cambiar etiqueta de responsable a "Entregado por"
      const lbl = document.getElementById('label-resp');
      if (lbl) lbl.textContent = 'Entregado por';
      // Controles extra mínimos: permitir marcar "registro sin solicitud" y un campo opcional de referencia
      const extra = document.getElementById('form-extra');
      if (extra) {
        extra.innerHTML = `
          <div class="meta" style="gap:12px;align-items:end">
            <div>
              <label><input type="checkbox" id="meta-sin-solicitud"> Registro sin solicitud</label>
            </div>
            <div id="sol-id-wrap">
              <label>N° Solicitud (opcional)</label>
              <input type="text" id="meta-sol-id" placeholder="Ej: SOL-1234" />
            </div>
          </div>
          <small class="muted">Si marcas "Registro sin solicitud" y dejas vacío el número, se generará uno automáticamente.</small>
        `;
        // Habilitar/deshabilitar campo según el checkbox
        const chk = document.getElementById('meta-sin-solicitud');
        const inp = document.getElementById('meta-sol-id');
        const toggle = () => {
          if (!chk || !inp) return;
          // No deshabilitar el input: permite que el usuario ingrese un número si lo desea.
          // Si ingresa número y la casilla está marcada, el envío forzará sinSolicitud=false.
          inp.placeholder = chk.checked ? 'Se generará automáticamente (opcional)' : 'Ej: SOL-1234';
          // Recalcular estado de familia por fila cuando cambia el modo sin-solicitud
          try { document.querySelectorAll('.row .product').forEach(el => el.dispatchEvent(new Event('change'))); } catch {}
        };
        chk?.addEventListener('change', toggle);
        inp?.addEventListener('input', toggle);
        toggle();
      }
    }
    // Personalización por formulario: Solicitudes simple (fecha, sede, responsable, productos y cantidades)
    if (cfg.id === 'solicitudes-pedido') {
      QTY_LABEL = 'CANTIDAD SOLICITADA';
      // Mostrar columna de familia por fila y cargar sets
      SHOW_ROW_FAMILY = true;
      loadFamilySets().catch(() => {});
      // Reutiliza grupos/mapas ya heredados; construir catálogo plano desde grupos si aplica
      if (Array.isArray(cfg.groups) && cfg.groups.length) {
        PRODUCT_GROUPS = cfg.groups;
        const flat = [];
        const seen = new Set();
        for (const g of cfg.groups) {
          for (const name of g.products) {
            const code = (cfg.codeMap && cfg.codeMap[name]) ? cfg.codeMap[name] : name;
            if (!seen.has(name)) { flat.push({ id: code, name }); seen.add(name); }
          }
        }
        PRODUCT_CATALOG = flat;
        try { console.debug('[DBG] PRODUCT_CATALOG built from cfg.groups (solicitudes-pedido)', { cfgId: cfg.id, groups: cfg.groups.length, length: PRODUCT_CATALOG.length, sample: PRODUCT_CATALOG.slice(0,5) }); } catch(_) {}
      }
      // Poblar sedes igual que el formulario base (heredadas)
  const sedeList = document.getElementById('meta-sede');
      if (sedeList && Array.isArray(cfg.sedes)) {
        sedeList.innerHTML = '';
        cfg.sedes.forEach(s => { const opt = document.createElement('option'); opt.value = s; opt.textContent = s; sedeList.appendChild(opt); });
      }
      // Asegurar etiqueta de responsable por defecto
      const lbl = document.getElementById('label-resp');
      if (lbl) lbl.textContent = 'Responsable';
    }
    // Personalización por formulario: CONGELADOS HOJALDRE (simple)
    if (cfg.id === 'congelados-hojaldre') {
      // poblar sedes si están definidas
  const sedeList = document.getElementById('meta-sede');
      if (sedeList && Array.isArray(cfg.sedes)) {
        sedeList.innerHTML = '';
        cfg.sedes.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s; opt.textContent = s; sedeList.appendChild(opt);
        });
      }
      // etiqueta de responsable
      const lbl = document.getElementById('label-resp');
      if (lbl) lbl.textContent = 'Entregado por';
      // Este formulario no tiene TIPO/FAMILIA, así que no añadimos controles extra.
    }
    // Personalización por formulario: MERMA (fecha + producto + cantidad; sede fija a BC)
    if (cfg.id === 'merma') {
      QTY_LABEL = 'CANTIDAD';
      // Construir catálogo desde grupos heredados (de LA TATA)
      if (Array.isArray(cfg.groups) && cfg.groups.length) {
        PRODUCT_GROUPS = cfg.groups;
        const flat = [];
        const seen = new Set();
        for (const g of cfg.groups) {
          for (const name of g.products) {
            const code = (cfg.codeMap && cfg.codeMap[name]) ? cfg.codeMap[name] : name;
            if (!seen.has(name)) { flat.push({ id: code, name }); seen.add(name); }
          }
        }
        PRODUCT_CATALOG = flat;
      }
      // Mantener visible la FECHA; hacer SEDE visible pero bloqueada a 'BC' y ocultar RESPONSABLE
      const sedeInputFixed = document.getElementById('meta-sede');
      const sedeWrap = sedeInputFixed ? sedeInputFixed.closest('div') : null;
      // Mostrar el control de sede para que el navegador pueda enfocarlo en validaciones,
      // pero bloquear su selección y dejar el valor por defecto 'BC'. Esto evita problemas
      // de validación cuando el control está oculto o vacío.
      try {
        if (sedeWrap) { sedeWrap.style.display = ''; }
        if (sedeInputFixed) {
          sedeInputFixed.value = 'BC';
          sedeInputFixed.disabled = true; // impedir cambios del usuario
          sedeInputFixed.setAttribute('aria-disabled','true');
        }
      } catch(e){}
      const respInput = document.getElementById('meta-resp');
      const respWrap = respInput ? respInput.closest('div') : null;
      if (respWrap) respWrap.style.display = 'none';
      // Nota informativa
      const extra = document.getElementById('form-extra');
      if (extra) {
        extra.innerHTML = '<small class="muted">MERMA: la sede se fija automáticamente a <strong>BC</strong> (BELLO CAMPO). Indica fecha, producto y cantidad.</small>';
      }
      // Forzar sede fija a BELLO CAMPO
  // Ensure merma form leaves SEDE fixed to BC (already applied above) — keep defensive assignment
  if (sedeInputFixed) {
    try { sedeInputFixed.value = 'BC'; sedeInputFixed.disabled = true; } catch(_){}
  }
    
    }
  }
  // Personalización por formulario: INVENTARIO PRODUCTO TERMINADO (alias: registros)
  if (cfg && (cfg.id === 'inventario-pt' || cfg.id === 'registros')) {
    // poblar sedes si están definidas (nombres completos)
  const sedeList = document.getElementById('meta-sede');
    if (sedeList && Array.isArray(cfg.sedes)) {
      sedeList.innerHTML = '';
      cfg.sedes.forEach(s => { const opt = document.createElement('option'); opt.value = s; opt.textContent = s; sedeList.appendChild(opt); });
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
          <div id="empresa-wrap" style="display:block">
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
      // Siempre mostrar EMPRESA
      if (empresaWrap) empresaWrap.style.display = '';
      if (devNote) devNote.style.display = isDev ? '' : 'none';

      // Si es devoluciones, forzar y bloquear la sede a BELLO CAMPO
      if (isDev) {
        try {
          if (sedeInput) {
            // establecer valor visible completo cuando sea necesario
            sedeInput.value = 'BELLO CAMPO';
            sedeInput.disabled = true; // impedir elegir otra sede
          }
        } catch (e) {}
        const isBelloCampo = (sede === 'BELLO CAMPO' || sede === 'BC' || (sedeInput && (String(sedeInput.value||'').toUpperCase() === 'BELLO CAMPO')));
        if (!isBelloCampo) {
          // En caso extraordinario, ocultar filas y limpiar catálogo
          setItemsVisible(false);
          applyCatalog([]);
          return;
        }
      } else {
        // cuando no es devoluciones, asegurar que el control de sede esté habilitado
        try { if (sedeInput) sedeInput.disabled = false; } catch (e) {}
      }

      // Elegir catálogo según EMPRESA tanto para Inventario de Cierre como Devoluciones
      const emp = (empresaSel?.value || '').toUpperCase();
      if (emp === 'PANIFICADORA COSTA DORADA, C.A') {
        // PANIFICADORA: mostrar SOLO la lista curada inventory.pdt (líneas 383-416 en forms.js)
        // Enriquecer códigos y unidades desde el TSV grande si existen; si no, dejar sin código.
        const curated = (cfg.inventory && cfg.inventory.pdt) ? cfg.inventory.pdt.slice(0) : [];
        loadCodesFromTSV().then(data => {
          const tsvCodes = data.codeMap || {};
          const tsvUnds  = data.undMap  || {};
          CODE_MAP = {};
          UND_MAP  = {};
          curated.forEach(name => {
            const code = tsvCodes[name] || (cfg.codeMap ? cfg.codeMap[name] : undefined);
            if (code) CODE_MAP[name] = code;
            const und  = tsvUnds[name] || (cfg.undMap ? cfg.undMap[name] : undefined);
            if (und) UND_MAP[name] = und.toUpperCase();
          });
          applyCatalog(curated);
        }).catch(() => {
          // Fallback: sin TSV, usar lista curada sin códigos adicionales
          CODE_MAP = {};
          UND_MAP  = {};
          applyCatalog(curated);
        });
      } else {
        // Catálogo LA TATA
        CODE_MAP = cfg.codeMap || {};
        UND_MAP = cfg.undMap || {};
        applyCatalog((cfg.inventory && cfg.inventory.lata) ? cfg.inventory.lata : []);
      }
      setItemsVisible(true);
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

  // Utilidades de fecha/hora en zona horaria específica
  function getTZParts(tz, date = new Date()) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(date);
      const map = {}; for (const p of parts) { map[p.type] = p.value; }
      return { year: map.year, month: map.month, day: map.day, hour: map.hour, minute: map.minute };
    } catch { return null; }
  }

  // Reloj visible: hora actual de Caracas en el front
  function updateVEClock() {
    try {
      const el = document.getElementById('meta-hora-caracas');
      if (!el) return;
      const ve = getTZParts('America/Caracas');
      if (!ve) return;
      const hh = String(ve.hour||'00').padStart(2,'0');
      const mm = String(ve.minute||'00').padStart(2,'0');
      el.textContent = `${hh}:${mm}`;
    } catch {}
  }
  // Indicador visual: muestra si la hora será incluida en el envío
  function updateHoraIndicator() {
    try {
      const ind = document.getElementById('meta-hora-indicator');
      const dateEl = document.getElementById('meta-date');
      if (!ind || !dateEl) return;
      const isTodayFlag = String(dateEl.dataset?.isToday || '').trim() === '1';
      // Determinar si la hora será incluida según la misma regla que en el submit
      const ve = getTZParts('America/Caracas') || {};
      const todayStr = `${ve.day||''}-${ve.month||''}-${ve.year||''}`;
      const selectedDate = String(dateEl.value || '').trim();
  // Excluir el formulario 'registros' de la regla que incluye hora por defecto.
  // Queremos que el formulario de registro envíe solo la fecha.
  const isInventario = typeof cfg === 'object' && (cfg.id === 'registros' || cfg.id === 'inventario-pt');
  const isTata = typeof cfg === 'object' && (cfg.id === 'tata-libertad' || cfg.id === 'solicitudes');
  const shouldInclude = isTodayFlag || selectedDate === todayStr || ((isInventario || isTata) && String(dateEl.dataset?.isToday || '') !== '0');
      if (shouldInclude) {
        ind.textContent = 'Hora: incluida';
        ind.style.background = '#1b6e3a';
        ind.style.color = '#fff';
      } else {
        ind.textContent = 'Hora: omitida';
        ind.style.background = '#6b6b6b';
        ind.style.color = '#fff';
      }
    } catch {}
  }
  // Actualizar al cargar y cada minuto
  updateVEClock();
  try { updateHoraIndicator(); } catch {}
  try { setInterval(updateVEClock, 60 * 1000); } catch {}

  // Botón rápido para establecer la fecha de hoy (dd-mm-aaaa)
  if (setTodayBtn) {
    setTodayBtn.addEventListener("click", () => {
      // Usar la zona horaria de Venezuela
      const ve = getTZParts('America/Caracas') || {};
      const iso = `${ve.day||'01'}-${ve.month||'01'}-${ve.year||'1970'}`;
      const dateInput = document.getElementById("meta-date");
      if (dateInput) dateInput.value = iso;
      // Marcar el input como 'hoy' para que el submit incluya la hora
      try { if (dateInput) dateInput.dataset.isToday = '1'; } catch {}
      // actualizar reloj visible
      updateVEClock();
      try { updateHoraIndicator(); } catch {}
    });
  }
  if (setYesterdayBtn) {
    setYesterdayBtn.addEventListener("click", () => {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const iso = `${dd}-${mm}-${yyyy}`;
      const dateInput = document.getElementById("meta-date");
      if (dateInput) dateInput.value = iso;
      try { if (dateInput) dateInput.dataset.isToday = '0'; } catch {}
      try { updateHoraIndicator(); } catch {}
    });
  }

  // Prefijar la fecha de hoy si está vacía
  const dateInputInit = document.getElementById("meta-date");
  if (dateInputInit && !dateInputInit.value) {
    const ve = getTZParts('America/Caracas') || {};
    dateInputInit.value = `${ve.day||'01'}-${ve.month||'01'}-${ve.year||'1970'}`;
    try { dateInputInit.dataset.isToday = '1'; } catch {}
    try { updateHoraIndicator(); } catch {}
  }

  // Sincronizar el flag isToday cuando el usuario edita manualmente la fecha
  try {
    const dateElWatch = document.getElementById('meta-date');
    if (dateElWatch) {
      const syncIsToday = () => {
        try {
          const ve = getTZParts('America/Caracas') || {};
          const todayStr = `${ve.day||'01'}-${ve.month||'01'}-${ve.year||'1970'}`;
          const val = String(dateElWatch.value || '').trim();
          dateElWatch.dataset.isToday = (val === todayStr) ? '1' : '0';
          try { updateHoraIndicator(); } catch {}
        } catch {}
      };
      dateElWatch.addEventListener('input', syncIsToday);
      dateElWatch.addEventListener('change', syncIsToday);
      // sincronizar ahora mismo
      syncIsToday();
    }
  } catch {}

  let isSubmitting = false;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    // Validar que la sede esté seleccionada cuando el control está visible
    try {
      const sedeEl = document.getElementById('meta-sede');
      if (sedeEl && !sedeEl.disabled && sedeEl.offsetParent !== null) {
        const val = String(sedeEl.value || '').trim();
        if (!val) {
          updateResult(`<span style="color:#ffb3b3">Selecciona una sede antes de enviar.</span>`);
          return;
        }
      }
    } catch {}
    const items = readForm();
    const v = validate(items);
    if (!v.ok) {
      updateResult(`<span style="color:#ffb3b3">${v.errors.join("<br>")}</span>`);
      return;
    }
    // Construir metadata mínima para firma y detección de duplicados
    const metaProbe = {
      sede: (document.getElementById("meta-sede").value || '').trim().toUpperCase() || null,
      responsable: document.getElementById("meta-resp").value.trim() || null,
      fecha: document.getElementById("meta-date").value || null,
      formId: cfg?.id || null,
      formName: cfg?.title || null,
      sheet: cfg?.sheetTab || null,
      tipo: document.getElementById('meta-tipo')?.value || null,
      familia: (document.getElementById('meta-tipo')?.value === 'MERMA') ? null : (document.getElementById('meta-familia')?.value || null),
    };
    // Defensive default: asegurar que tipo siempre tenga un valor para evitar errores
    // en el backend si algún script del cliente falla antes de asignarlo.
    if (!metaProbe.tipo) {
      // Para formularios de LA TATA queremos 'ENTREGADO' por defecto
      const isTata = cfg && (cfg.id === 'tata-libertad' || cfg.id === 'solicitudes' || cfg.id === 'solicitudes-pedido');
      metaProbe.tipo = isTata ? 'ENTREGADO' : (metaProbe.tipo || null);
    }
    // Enviar formId lógico para que el backend rote Inventario PT si está configurado
    if (cfg && cfg.id === 'registros') {
      metaProbe.formId = 'inventario-pt';
    }
    // Enviar también la fecha como texto plano para que el backend NO la reprocese con zonas horarias
    if (metaProbe && metaProbe.fecha) {
      metaProbe.fechaTxt = metaProbe.fecha; // dd-mm-aaaa
    }
    // Registrar hora de Caracas SOLO si la fecha seleccionada es HOY (Caracas)
    try {
      const ve = getTZParts('America/Caracas');
      if (ve) {
        const todayStr = `${ve.day}-${ve.month}-${ve.year}`; // dd-mm-aaaa
        const dateEl = document.getElementById("meta-date");
        const selectedDate = String(dateEl?.value || '').trim();
        const isTodayFlag = String(dateEl?.dataset?.isToday || '').trim() === '1';
  // Regla de inclusión de hora:
  // - Si el usuario marcó explícitamente Hoy (isTodayFlag) o la fecha coincide con hoy -> incluir hora.
  // - Para los formularios de tipo INVENTARIO PRODUCTO TERMINADO (registros) y LA TATA (solicitudes/registro),
  //   incluir la hora por defecto salvo que el usuario haya marcado explícitamente Ayer / otra fecha
  //   (dataset.isToday === '0'). Esto restaura el comportamiento previo para LA TATA.
  // Excluir 'registros' para que el formulario de registro no mande la hora, solo la fecha
  const isInventario = cfg && (cfg.id === 'registros' || cfg.id === 'inventario-pt');
  const isTata = cfg && (cfg.id === 'tata-libertad' || cfg.id === 'solicitudes');
  const shouldIncludeHora = isTodayFlag || selectedDate === todayStr || ((isInventario || isTata) && String(dateEl?.dataset?.isToday || '') !== '0');
        if (shouldIncludeHora) {
          const hh = String(ve.hour||'00').padStart(2,'0');
          const mm = String(ve.minute||'00').padStart(2,'0');
          metaProbe.horaTxt = `${hh}:${mm}`;
        } else {
          // asegurar que NO se envíe hora cuando no se quiere
          delete metaProbe.horaTxt;
        }
      }
    } catch {}
    // Default para Registros LA TATA: ENTREGADO (sin UI de tipo)
    if (cfg && (cfg.id === 'tata-libertad' || cfg.id === 'solicitudes')) {
      if (!metaProbe.tipo) metaProbe.tipo = 'ENTREGADO';
      // Gestión de solicitud: permitir "sin solicitud" y generar identificador
      const solIdEl = document.getElementById('meta-sol-id');
      const sinSolEl = document.getElementById('meta-sin-solicitud');
      let solId = (solIdEl?.value || '').trim();
      let sinSol = !!sinSolEl?.checked;
      const selectedDate = document.getElementById("meta-date")?.value || '';
      const ymd = (selectedDate || new Date().toISOString().slice(0,10)).replace(/-/g,'');
      if (!solId && sinSol) {
        // Solo generar SIN-SOL cuando el usuario marca la casilla
        const rand = Math.random().toString(36).slice(2,6).toUpperCase();
        solId = `SIN-SOL-${ymd}-${rand}`;
      }
      // Si el usuario ingresó un número de solicitud, forzar sinSolicitud=false
      if (solId && sinSol) sinSol = false;
      metaProbe.solicitudId = solId;
      metaProbe.sinSolicitud = sinSol;
    }
    // Forzar un tipo estándar para el formulario de Solicitudes simple
    if (cfg && cfg.id === 'solicitudes-pedido') {
      metaProbe.tipo = 'SOLICITUD';
      // En Solicitudes cada item define su familia; no enviamos familia a nivel meta
      metaProbe.familia = null;
    }
    // Forzar tipo para MERMA
    if (cfg && cfg.id === 'merma') {
      metaProbe.tipo = 'MERMA';
      metaProbe.familia = null;
      if (!metaProbe.sede) metaProbe.sede = 'BELLO CAMPO';
    }
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
      // Garantizar que el TSV esté cargado para fallback de códigos/unidades
      try { await loadCodesFromTSV(); } catch {}
      // enriquecer con código y unidad por producto
      const itemsWithCode = items.map(it => {
        const raw = String(it.product || '').trim();
        // Intentar obtener nombre por id -> nombre
        let name = productDisplayName(raw);
        // Si no resolvió (o devolvió el mismo código), y parece un código, intentar invertir
        if (!name || isCodeLike(raw) && name === raw) {
          const fromCode = nameForCode(raw);
          if (fromCode) name = fromCode;
        }
        // Si aún no hay nombre y el raw parece ser código, mantén el código como code
        let code = codeForProduct(name);
        if ((!code || code === name) && isCodeLike(raw)) {
          code = raw; // usar el valor elegido como código
        }
        const detectedFam = String(familyForProduct(name) || '').toUpperCase();
        const uiFam = String(it.family || '').toUpperCase();
        const familia = detectedFam || uiFam || undefined;
        return {
          quantity: it.quantity,
          family: it.family,
          // Canon: 'product' siempre es el NOMBRE legible
          product: name || raw,
          code,
          und: undForProduct(name || raw),
          familia,
        };
      });
      const entry = save(itemsWithCode, meta);
      if (isDebug()) {
        try { console.debug('[DEBUG] entry to send', entry); } catch {}
      }
      let msg = ENABLE_LOCAL_SAVE
        ? `Guardado ${new Date(entry.at).toLocaleString()} (${entry.items.length} item/s)`
        : `Listo (${entry.items.length} item/s)`;
      // Intento de envío al backend (proxy o directo según settings)
      console.debug('[submit] intentando enviar entry', { formId: meta?.formId, tipo: meta?.tipo });
      const send = await maybeSendToSheets(entry);
      sendResult = send;
      // If nothing was actually sent and this is the MERMA form, attempt a direct POST to the WebApp URL
      if ((!sendResult || !sendResult.sent) && cfg && cfg.id === 'merma') {
        try{
          console.debug('[submit] primer intento no envió; reintentando POST directo al WebApp para MERMA');
          const directRes = await fetch((JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}').url) || DEFAULT_GS_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(entry), mode: 'cors'
          });
          const text = await directRes.text().catch(()=>'');
          let parsed = null;
          try{ parsed = JSON.parse(text); }catch(_){ parsed = null; }
          sendResult = { sent: directRes.ok, data: parsed || { raw: text }, error: directRes.ok ? undefined : `HTTP ${directRes.status}` };
          console.debug('[submit] POST directo resultado', sendResult);
        }catch(err){
          sendResult = { sent: false, error: String(err) };
          console.error('[submit] error en POST directo MERMA', err);
        }
      }
      const backendOk = !(send && send.data && send.data.ok === false);
      if (send.sent && backendOk) {
        // Si el backend respondió con count=0 en ENTREGADO normal (sin sinSolicitud), intentar fallback automático una vez
        try {
          const cnt = Number(send.data && (send.data.count ?? send.data.updated ?? send.data.updatedRows ?? send.data.affected));
          const isSolicitud = (meta?.tipo || '').toUpperCase() === 'SOLICITUD';
          const isSin = !!meta?.sinSolicitud;
          if (!isSolicitud && !isSin && (!Number.isFinite(cnt) || cnt <= 0)) {
            // Fallback: convertir a "sin solicitud" y reintentar una vez
            const selectedDate = document.getElementById("meta-date")?.value || '';
            const ymd = (selectedDate || new Date().toISOString().slice(0,10)).replace(/-/g,'');
            const rand = Math.random().toString(36).slice(2,6).toUpperCase();
            const fallbackId = `SIN-SOL-${ymd}-${rand}`;
            const retryMeta = { ...entry.meta, sinSolicitud: true, solicitudId: fallbackId };
            const retryEntry = { ...entry, meta: retryMeta };
            const retry = await maybeSendToSheets(retryEntry);
            sendResult = retry; // para debug/eco
            const retryOk = retry && retry.sent && !(retry.data && retry.data.ok === false);
            if (!retryOk) {
              updateResult(`<span style="color:#ffb3b3">No se encontró una SOLICITUD que coincida con FECHA+SEDE+PRODUCTO/CODIGO y el intento automático como "sin solicitud" falló.</span>`);
              return;
            }
            // Marcar mensaje con nota de fallback
            msg += " — procesado como ‘sin solicitud’ (automático)";
          }
        } catch {}
        // Registrar firma para bloquear reintentos idénticos por unos segundos
        localStorage.setItem(LAST_SUBMIT_KEY, JSON.stringify({ hash: signature, at: Date.now() }));
        if (send.via === "proxy") {
          msg += " — enviado a Google Sheets (con lectura vía proxy)";
        } else {
          msg += send.data?.mode === "no-cors" ? " — enviado a Google Sheets (sin lectura)" : " — enviado a Google Sheets";
        }
      } else if (send.sent && !backendOk) {
        const errTxt = send.data && send.data.error ? String(send.data.error) : 'error remoto';
        msg += ` — el Web App respondió ok=false (${errTxt})`;
        updateResult(`<span style="color:#ffb3b3">${msg}</span>`);
        return; // no limpiar ni resetear, para que el usuario corrija
      } else if (send.error) {
        msg += ` — no se pudo enviar a Sheets (${send.error})`;
      }
      let extra = '';
      if (isDebug()) {
        const first = entry.items && entry.items[0] ? entry.items[0] : null;
        const dbg = first ? `\n<pre style="white-space:pre-wrap;max-height:200px;overflow:auto;background:#0d0f1a;padding:8px;border-radius:8px;border:1px solid #1c2549">${
          JSON.stringify({
            item:{
              product:first.product,
              code:first.code,
              und:first.und,
              qty:first.quantity,
              familia:first.familia
            },
            meta:{
              sede: entry.meta?.sede || null,
              responsable: entry.meta?.responsable || null,
              fecha: entry.meta?.fecha || null,
              fechaTxt: entry.meta?.fechaTxt || null,
              tipo: entry.meta?.tipo || null,
              solicitudId: entry.meta?.solicitudId || null,
              sinSolicitud: entry.meta?.sinSolicitud || null,
              sheet: entry.meta?.sheet || null,
              formId: entry.meta?.formId || null
            }
          }, null, 2)
        }</pre>` : '';
        // incluir eco del backend si vino
        const echo = sendResult && sendResult.data && (sendResult.data.firstItem || sendResult.data.idx)
          ? `\n<pre style="white-space:pre-wrap;max-height:200px;overflow:auto;background:#0d0f1a;padding:8px;border-radius:8px;border:1px solid #1c2549">${
            JSON.stringify({ backendFirstItem: sendResult.data.firstItem, backendIdx: sendResult.data.idx }, null, 2)
          }</pre>`
          : '';
        extra = dbg + echo;
      }
      updateResult(`<span style="color:#79ffa7">${msg}</span>${extra}`);
      // Reset: dejar una sola fila vacía
      rowsEl.innerHTML = "";
      rowsEl.appendChild(createRow());
      // limpiar metadata opcionalmente
      document.getElementById("meta-sede").value = "";
      document.getElementById("meta-resp").value = "";
      document.getElementById("meta-date").value = "";
      // recalcular familia automática (queda en blanco hasta nueva selección)
      recomputeFamiliaUI();
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
    if (!ENABLE_LOCAL_SAVE) {
      updateResult("El guardado local está desactivado");
      return;
    }
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
    if (!ENABLE_LOCAL_SAVE) {
      updateResult("El guardado local está desactivado");
      return;
    }
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
      const token = gsTokenInput.value.trim();
      // Construir un probe de prueba completo incluyendo meta para que el Web App
      // no rechace el payload por falta de metadata. Usamos formId 'tata-libertad'
      // por defecto (prueba de solicitudes).
      const ve = (function(){ try{ const p = getTZParts('America/Caracas'); return p; }catch(_){ return null; } })();
      const today = ve ? `${ve.day}-${ve.month}-${ve.year}` : new Date().toLocaleDateString('en-GB');
      const probe = {
        id: "test-" + Math.random().toString(36).slice(2, 8),
        at: new Date().toISOString(),
        items: [{ product: "PING", quantity: 1 }],
        meta: {
          formId: (window.CURRENT_FORM_ID || 'tata-libertad'),
          sheet: (window.CURRENT_FORM_ID && window.CURRENT_FORM_ID === 'inventario-pt') ? 'INVENTARIO DE PRODUCTO TERMINADO' : 'LA TATA DE LA LIBERTAD',
          fechaTxt: today,
          sede: (document.getElementById('meta-sede')?.value || 'BC'),
          tipo: 'ENTREGADO'
        },
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
    // Solo inicializar por defecto si no hay ajustes previos; no sobrescribir lo que se configuró en el menú
    const existing = localStorage.getItem(SETTINGS_KEY);
    if (!existing) {
      const preset = { url: DEFAULT_GS_URL, enabled: true, token: DEFAULT_GS_TOKEN };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(preset));
    }
  }

  updateResult();
  try { console.debug("Formulario cargado", { formId, cfg }); } catch {}

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

// Cambiar título/desc por 'tab' solo si NO se está usando un formulario específico
function loadFormByTab(tabId) {
  const formConfig = window.FORMS.find(f => f.id === tabId);
  if (!formConfig) {
    console.log('Unexpected return statement');
    return;
  }
  const titleEl = document.getElementById("form-title");
  const descEl = document.getElementById("form-desc");
  if (titleEl) titleEl.textContent = formConfig.title;
  if (descEl) descEl.textContent = formConfig.description;
}

const _qp = new URLSearchParams(window.location.search);
if (!_qp.has("form")) {
  const activeTab = _qp.get("tab") || "solicitudes";
  loadFormByTab(activeTab);
}

main();