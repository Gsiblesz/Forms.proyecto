/** Apps Script con sede canónica (BC <-> BELLO CAMPO) y FAMILIA siempre en blanco en SOLICITUD/ENTREGADO/MERMA. */

const CONFIG = {
  TOKEN: 'Pasantias90',
  SPREADSHEET_ID: '1TlsAVq8pauOxwHHCWGL8I740pGZ5ftpYC3gwvEPo1eE',
  // Default sheet name to use when no target or meta.sheet is provided
  // La pestaña que antes era SOLICITUDES ahora se formaliza como AJUSTES
  SHEET: 'AJUSTES',
  // Agregamos columna HORA (antes de FECHA); HORA contendrá "HH:mm dd-mm-aaaa" y FECHA solo "dd-mm-aaaa"
  HEAD: ['HORA','FECHA','SEDE','FAMILIA','PRODUCTO','CODIGO','UND','CANTIDAD SOLICITADA','RESPONSABLE SOLICITUD','CANTIDAD ENTREGADA','RESPONSABLE ENTREGA'],
  DELIVERY_MATCH_SCOPE: 'FECHA_SEDE_PRODUCTO',
  STRICT_DELIVERY_MATCH: true,
  ALLOW_DELIVERY_CREATE: false,
  ALWAYS_CREATE_WHEN_SIN_SOLICITUD: true,
  TARGETS: {
    'inventario-pt': {
      // Libro de INVENTARIO DE PRODUCTO TERMINADO (donde estará la pestaña AJUSTES)
      ssurl: 'https://docs.google.com/spreadsheets/d/1TlsAVq8pauOxwHHCWGL8I740pGZ5ftpYC3gwvEPo1eE/edit',
      sheet: 'INVENTARIO DE PRODUCTO TERMINADO',
      // Mantener primeros 5 como están y reordenar bloque de producto
      // entry_id, FECHA (con hora incluida), TIPO, SEDE, EMPRESA, CODIGO, PRODUCTO, UND, CANTIDAD, RESPONSABLE
      // Nuevo ajuste: mantener columna HORA antes de FECHA; HORA contendrá Date (hora+fecha) y FECHA dd-mm-aaaa
      HEAD: ['entry_id','HORA','FECHA','TIPO','SEDE','EMPRESA','CODIGO','PRODUCTO','UND','CANTIDAD','RESPONSABLE'],
      MODE: 'append'
    }
    ,
    // Target explícito para el formulario LA TATA de la libertad
    'tata-libertad': {
      // Libro "LA TATA DE LA LIBERTAD" (formulario específico)
      ssurl: 'https://docs.google.com/spreadsheets/d/1MQlP9wx199xW-gIYwf4FcjdANG9TLEkSjORiNmxJH5s/edit?gid=1387627441',
      sheet: 'LA TATA DE LA LIBERTAD',
      HEAD: ['HORA','FECHA','SEDE','FAMILIA','PRODUCTO','CODIGO','UND','CANTIDAD SOLICITADA','RESPONSABLE SOLICITUD','CANTIDAD ENTREGADA','RESPONSABLE ENTREGA']
    }
  }
};

// Head por defecto incluyendo columna MERMA (se conserva para formularios de LA TATA)
function _defaultRequiredHead_(){ return CONFIG.HEAD.concat(['MERMA']); }
function _headFor(formId){ var t=CONFIG.TARGETS&&CONFIG.TARGETS[formId]; return (t&&Array.isArray(t.HEAD))?t.HEAD.slice(0):_defaultRequiredHead_(); }
function _canonSede(raw){ const s=String(raw||'').trim().toUpperCase(); if(s==='BC'||s==='BELLO CAMPO') return 'BELLO CAMPO'; if(s==='E PB-2'||s==='E PB2'||s==='E PB') return 'E PB-2'; if(s==='PB'||s==='PALOS GRANDES'||s==='LOS PALOS GRANDES') return 'LOS PALOS GRANDES'; if(s==='SL'||s==='SAN LUIS') return 'SAN LUIS'; return s; }

// Raw sede: return the trimmed, uppercased value exactly as provided by the client
function _rawSede(raw){ return String(raw||'').trim().toUpperCase(); }

function doGet(e){
  var p=(e&&e.parameter)||{};
  var op=String(p.op||'').toLowerCase();
  if(op==='fix'){
    // Modo mantenimiento: reordenar físicamente columnas del target solicitado
    if(CONFIG.TOKEN&&p.token&&p.token!==CONFIG.TOKEN) return _json({ok:false,error:'unauthorized'},401);
    try{
      var formIdFix=String(p.formId||'');
      var tgtFix=(CONFIG.TARGETS&&CONFIG.TARGETS[formIdFix])||null;
      if(!tgtFix) return _json({ok:false,error:'unknown formId'},400);
      var ssFix=_resolveSpreadsheet(tgtFix.ssid,tgtFix.ssurl);
      var out=fixSheetToHead_(ssFix,tgtFix.sheet,tgtFix.HEAD);
      return _json({ok:true,fixed:true,sheet:out.sheet,rows:out.rows,head:out.head},200);
    }catch(err){ return _json({ok:false,error:String(err)},500); }
  }
  if(op!=='list') return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  if(CONFIG.TOKEN&&p.token&&p.token!==CONFIG.TOKEN) return _json({ok:false,error:'unauthorized'},401);
  try{
    var formId=String(p.formId||'');
    var tgt=(CONFIG.TARGETS&&CONFIG.TARGETS[formId])||null;
    var ss=tgt?_resolveSpreadsheet(tgt.ssid,tgt.ssurl):_resolveSpreadsheet(p.ssid,p.ssurl);
  // Prefer explicit target sheet from CONFIG.TARGETS; fallback to query param or default
  var sheetName=(tgt&&tgt.sheet) || p.sheet || CONFIG.SHEET;
    var head=_headFor(formId);
    var sh=_getOrCreateSheet(ss,sheetName,head);
    // Si es un target específico, reconciliar nombre y orden de columnas (p.ej. PRODUCTO/PRODUCTOS, orden esperado)
    if(tgt){ _reconcileHeaderAndOrder_(sh, head); }
    var lastRow=sh.getLastRow();
    var lastCol=sh.getLastColumn()||head.length;
    if(tgt){ lastCol=Math.min(lastCol,head.length); } // limitar al HEAD del target
    var outHead=sh.getRange(1,1,1,lastCol).getValues()[0];
    if(lastRow<=1) return _json({ok:true,head:outHead,rows:[]},200);
    var limit=Math.max(1,Math.min(500,Number(p.limit||100)));
    var rowCount=Math.min(limit,lastRow-1);
    var startRow=lastRow-rowCount+1;
    var rows=sh.getRange(startRow,1,rowCount,lastCol).getValues();
    return _json({ok:true,head:outHead,rows:rows},200);
  }catch(err){
    return _json({ok:false,error:String(err)},500);
  }
}

function doPost(e){
  try{
    var raw=(e&&e.postData&&e.postData.contents)||'';
    if(!raw) return _json({ok:false,error:'no body'},400);
    var payload=JSON.parse(raw);
    // Aceptar dos formas: 1) payload directamente con { items, meta }
    //                  2) wrapper externo { entry: { items, meta, ... } } (ej. algunos formularios)
    if(payload && !payload.items && payload.entry && (payload.entry.items || payload.entry.meta)){
      payload = payload.entry;
    }
  if(!payload || !payload.items) return _json({ok:false,error:'bad payload, missing items'},400);
  // Ensure payload.meta is defined to avoid ReferenceError (some clients omit meta)
  var meta = payload.meta || {};
  // tipoMeta puede venir vacío; normalizamos recortando espacios y forzando mayúsculas
  var tipoMeta = meta && meta.tipo ? String(meta.tipo).trim().toUpperCase() : '';
  // Si no se proporciona tipo pero el formId indica 'merma', inferir MERMA
  try{ if(!tipoMeta && meta && meta.formId && String(meta.formId).toLowerCase().indexOf('merma')!==-1) tipoMeta = 'MERMA'; }catch(_){ }

    var qToken = (e && e.parameter && e.parameter.token) || '';
    var token = payload.token || qToken || '';
    if (CONFIG.TOKEN && token && token !== CONFIG.TOKEN) return _json({ ok: false, error: 'invalid token' }, 401);

    var p = (e && e.parameter) || {};
    var formId = (meta.formId) || '';
    // First try explicit mapping by formId
    var tgt = (CONFIG.TARGETS && CONFIG.TARGETS[formId]) || null;
    // Defensive fallback: if no formId or no target matched, try to detect target from meta.ssurl/meta.ssid or meta.sheet
    if(!tgt && meta){
      try{
        for(var _k in CONFIG.TARGETS){
          var _t = CONFIG.TARGETS[_k];
          if(!_t) continue;
          // try match by ssurl id
          var m = String(_t.ssurl||'').match(/\/d\/([^/]+)/);
          var tid = (m && m[1])?m[1]:'';
          if(tid && (String(meta.ssurl||'').indexOf(tid)!==-1 || String(meta.ssid||'').indexOf(tid)!==-1)){
            tgt = _t; formId = _k; break;
          }
          // try match by sheet/tab name
          if(meta.sheet && _t.sheet && String(meta.sheet).trim().toLowerCase()===String(_t.sheet).trim().toLowerCase()){
            tgt = _t; formId = _k; break;
          }
        }
      }catch(_){ /* ignore detection errors */ }
    }

    // Resolve sheetName and spreadsheet according to the resolved target (if any)
    var sheetName = (tgt && tgt.sheet) || meta.sheet || p.sheet || CONFIG.SHEET;
    var ss = tgt ? _resolveSpreadsheet(tgt.ssid, tgt.ssurl) : _resolveSpreadsheet(meta.ssid || p.ssid, meta.ssurl || p.ssurl);
    try{ Logger.log('doPost resolved formId=%s target=%s sheet=%s', formId, tgt?('yes-'+(tgt.sheet||'')):'none', sheetName); }catch(_){ }

    // Temporary debugging logs: help determine which deployed script handled the request
    try{
      Logger.log('doPost start: formId=%s, tipoMeta=%s, token=%s', formId, tipoMeta, token);
      Logger.log('meta payload: %s', JSON.stringify(meta));
      Logger.log('resolved sheetName: %s', sheetName);
      try{ Logger.log('resolved spreadsheet id: %s', ss && ss.getId ? ss.getId() : 'no-ss'); }catch(e){ Logger.log('error getting ss id: %s', String(e)); }
    }catch(_){ /* ignore logging errors */ }

    var res;
    if (tgt && tgt.MODE === 'append') {
      res = appendInventario(payload, { ss: ss, sheetName: sheetName, head: tgt.HEAD, formId: formId });
    } else if (tipoMeta === 'MERMA') {
      // Flujo MERMA: usar HEAD del target si existe, si no usar el HEAD por defecto (incluye MERMA)
      var headForFlow = (tgt && Array.isArray(tgt.HEAD)) ? tgt.HEAD : _defaultRequiredHead_();
      res = upsertMerma(payload, { ss: ss, sheetName: sheetName, head: headForFlow, formId: formId });
    } else {
      var tipo = (tipoMeta === 'SOLICITUD') ? 'SOLICITUD' : 'ENTREGADO';
      var headForFlow = (tgt && Array.isArray(tgt.HEAD)) ? tgt.HEAD : _defaultRequiredHead_();
      res = upsertOneSheet(payload, tipo, { ss: ss, sheetName: sheetName, head: headForFlow, formId: formId });
    }
    var debug=(p.debug==='1')||!!payload.debug;
    if(debug){
      var first=(payload.items&&payload.items[0])||null;
      return _json({ok:true,sheet:res.sheet,count:res.count,idx:res.idx,firstItem:first},200);
    }
    return _json({ok:true,sheet:res.sheet,count:res.count},200);
  }catch(err){
    return _json({ok:false,error:String(err)},500);
  }
}

function appendInventario(payload,opts){
  var ss=opts.ss;
  var sheetName=opts.sheetName;
  var head=opts.head||['entry_id','HORA','FECHA','TIPO','SEDE','EMPRESA','CODIGO','PRODUCTO','UND','CANTIDAD','RESPONSABLE'];
  var sh=_getOrCreateSheet(ss,sheetName,head);
  // Verificación fuerte del encabezado: si falta HORA/FECHA o hay PRODUCTOS/CANTIDAD duplicado, reconstruye la hoja
  try{
    var curHeadAll=sh.getRange(1,1,1,Math.max(sh.getLastColumn(),head.length)).getValues()[0].map(function(x){return String(x||'').trim();});
    var needsFix=false;
    // Normaliza PRODUCTOS -> PRODUCTO para la comparación
    var curNorm=curHeadAll.map(function(x){ return (String(x).trim().toUpperCase()==='PRODUCTOS')?'PRODUCTO':String(x).trim(); });
    // Falta alguno requerido o el orden de los primeros N no coincide o hay más/menos columnas
    for(var i0=0;i0<head.length;i0++){ if(curNorm[i0]!==head[i0]) { needsFix=true; break; } }
    for(var j0=0;j0<head.length && !needsFix;j0++){ if(curNorm.indexOf(head[j0])===-1){ needsFix=true; break; } }
    if(!needsFix){
      // detecta duplicados de algún encabezado requerido en las primeras N columnas
      var seen={};
      for(var k0=0;k0<Math.min(curNorm.length,head.length);k0++){ var name=curNorm[k0]; if(seen[name]){ needsFix=true; break; } seen[name]=true; }
    }
    if(needsFix){
      fixSheetToHead_(ss,sheetName,head);
      sh=ss.getSheetByName(sheetName);
    } else {
      // Si no requiere reconstrucción completa, al menos reconciliar orden y sinónimos
      _reconcileHeaderAndOrder_(sh, head);
    }
  }catch(_){ _reconcileHeaderAndOrder_(sh, head); }
  var idx=_ensureColumnsAndIndex_(sh,head);
  // Asegurar explícitamente que la columna HORA exista en el encabezado
  try{
    if(!idx['HORA']){
      // Escribir los encabezados requeridos en las primeras columnas para forzar HORA
      sh.getRange(1,1,1,head.length).setValues([head]);
      sh.setFrozenRows(1);
      idx=_ensureColumnsAndIndex_(sh,head);
    }
  }catch(_){ }
  // Asegurar formato de fecha/hora y zona horaria del Spreadsheet
  try{
    if(ss && ss.getSpreadsheetTimeZone && ss.getSpreadsheetTimeZone() !== 'America/Caracas'){
      ss.setSpreadsheetTimeZone('America/Caracas');
    }
  }catch(_){ }
  // Apply number formats only to data rows (skip header row) to avoid errors
  // Do per-column try/catch and surface which column fails so the WebApp response
  // includes an indicator (column name and index) when formatting fails.
  var maxRows = sh.getMaxRows();
  var dataRows = Math.max(0, maxRows - 1); // exclude header
  if(dataRows > 0){
    if(idx['HORA']){
      try{
        sh.getRange(2, idx['HORA'], dataRows, 1).setNumberFormat('hh:mm yyyy-mm-dd');
      }catch(e){
        throw new Error('No puedes configurar el formato de número en la columna "HORA" (col '+idx['HORA']+'): '+String(e));
      }
    }
    if(idx['FECHA']){
      try{
        sh.getRange(2, idx['FECHA'], dataRows, 1).setNumberFormat('yyyy-mm-dd');
      }catch(e){
        throw new Error('No puedes configurar el formato de número en la columna "FECHA" (col '+idx['FECHA']+'): '+String(e));
      }
    }
  }

  var entryId=String(payload.id||('e-'+Math.random().toString(36).slice(2,8))).toUpperCase();
  var fechaRaw=payload.meta&&payload.meta.fechaTxt?String(payload.meta.fechaTxt).trim():_asDateString(payload.meta&&payload.meta.fecha);
  var fechaIso=_asDateString(fechaRaw); // yyyy-mm-dd unificado
  // Tomar hora solo si viene del cliente (HOY). Si no, dejar sin hora.
  var hora=(payload.meta&&payload.meta.horaTxt)?String(payload.meta.horaTxt).trim():'';
  var tipo=String(payload.meta&&payload.meta.tipo||'').toUpperCase();
  // Decide whether to preserve raw sede codes (for forms like 'tata-libertad')
  var formIdOpt = (opts && opts.formId) ? String(opts.formId).toLowerCase() : '';
  var sede = (formIdOpt === 'tata-libertad') ? _rawSede(payload.meta&&payload.meta.sede) : _canonSede(payload.meta&&payload.meta.sede);
  var empresa=String(payload.meta&&payload.meta.familia||'').trim();
  var resp=String(payload.meta&&payload.meta.responsable||'').trim();
  // Construir Date real para FECHA con hora de Caracas
  var horaFecha=((hora?hora:'') + (fechaIso?(' '+fechaIso):'')).trim();
  var dt=null; // Date con la hora/minuto indicados sobre la fecha seleccionada
  try{
    if(hora){
  var fkey=_asDateKey_(fechaIso); // YYYY-MM-DD
      var p=fkey.split('-');
      var yy=Number(p[0]||0), mm1=Number(p[1]||1)-1, dd=Number(p[2]||1);
      var hm=String(hora||'').split(':');
      var HH=Number(hm[0]||0), MM=Number(hm[1]||0);
      dt=new Date(yy,mm1,dd,HH,MM,0,0);
    }
  }catch(_){ dt=null; }

  var items=Array.isArray(payload.items)?payload.items:[];
  var rows=[];
  for(var i=0;i<items.length;i++){
    var it=items[i]||{};
    var codigo=String(it.code||'').trim();
    var und=String(it.und||'').trim();
    var prod=String(it.product||it.name||'').trim();
  var qty=_toInt(it.quantity);

    var vals=new Array(head.length).fill('');
  if(idx['entry_id'])  vals[idx['entry_id']-1]=entryId;
  if(idx['HORA'])      vals[idx['HORA']-1]=dt||'';
  if(idx['FECHA'])     vals[idx['FECHA']-1]=fechaIso||'';
    if(idx['TIPO'])      vals[idx['TIPO']-1]=tipo||'';
    if(idx['SEDE'])      vals[idx['SEDE']-1]=sede||'';
    if(idx['EMPRESA'])   vals[idx['EMPRESA']-1]=empresa||'';

    if(idx['CODIGO'])    vals[idx['CODIGO']-1]=codigo||'';
    if(idx['PRODUCTO'])  vals[idx['PRODUCTO']-1]=prod||'';
    if(idx['UND'])       vals[idx['UND']-1]=und||'';
    if(idx['CANTIDAD'])  vals[idx['CANTIDAD']-1]=qty;
    if(idx['RESPONSABLE']) vals[idx['RESPONSABLE']-1]=resp||'';

    rows.push(vals);
  }
  if(rows.length){
    var start=sh.getLastRow()+1;
    sh.getRange(start,1,rows.length,head.length).setValues(rows);
  }
  return {sheet:sheetName,count:rows.length,idx:idx};
}

function upsertMerma(payload,opts){
  var ss=(opts&&opts.ss)||SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheetName=(opts&&opts.sheetName)||CONFIG.SHEET;
  var requiredHead=(opts&&opts.head)||_defaultRequiredHead_();
  var sh=_getOrCreateSheet(ss,sheetName,requiredHead);
  // Reconciliar orden para garantizar HORA antes de FECHA
  _reconcileHeaderAndOrder_(sh, requiredHead);
  // Limpia columna obsoleta si existe
  _dropColumnByExactHeader_(sh,'TIPO_MERMA');
  var idx=_ensureColumnsAndIndex_(sh,requiredHead);
  // Forzar existencia de columna HORA en el encabezado si por alguna razón falta
  try{
    if(!idx['HORA']){
      sh.getRange(1,1,1,requiredHead.length).setValues([requiredHead]);
      sh.setFrozenRows(1);
      idx=_ensureColumnsAndIndex_(sh,requiredHead);
    }
  }catch(_){ }

  // Asegurar zona horaria y formatos: HORA mostrará hora+fecha, FECHA mostrará dd-mm-aaaa
  try{
    if(ss && ss.getSpreadsheetTimeZone && ss.getSpreadsheetTimeZone() !== 'America/Caracas'){
      ss.setSpreadsheetTimeZone('America/Caracas');
    }
  }catch(_){ }
  try{
    var maxRows2 = sh.getMaxRows();
    var dataRows2 = Math.max(0, maxRows2 - 1);
    if(dataRows2 > 0){
      if(idx['HORA']) sh.getRange(2, idx['HORA'], dataRows2, 1).setNumberFormat('hh:mm yyyy-mm-dd');
      if(idx['FECHA']) sh.getRange(2, idx['FECHA'], dataRows2, 1).setNumberFormat('yyyy-mm-dd');
    }
  }catch(_){ }
  
  // Asegurar zona horaria y formatos: HORA mostrará hora+fecha, FECHA mostrará dd-mm-aaaa
  try{
    if(ss && ss.getSpreadsheetTimeZone && ss.getSpreadsheetTimeZone() !== 'America/Caracas'){
      ss.setSpreadsheetTimeZone('America/Caracas');
    }
  }catch(_){ }
  try{
    var maxRows3 = sh.getMaxRows();
    var dataRows3 = Math.max(0, maxRows3 - 1);
    if(dataRows3 > 0){
      if(idx['HORA']) sh.getRange(2, idx['HORA'], dataRows3, 1).setNumberFormat('hh:mm dd-mm-yyyy');
      if(idx['FECHA']) sh.getRange(2, idx['FECHA'], dataRows3, 1).setNumberFormat('dd-mm-yyyy');
    }
  }catch(_){ }

  var fechaRaw=payload.meta&&payload.meta.fechaTxt?String(payload.meta.fechaTxt).trim():_asDateString(payload.meta&&payload.meta.fecha);
  // Normalizar la fecha del payload a clave YYYY-MM-DD para emparejado consistente
  var fechaIso=_asDateString(fechaRaw);
  var fechaKey=_asDateKey_(fechaIso);
  // MERMA aplica solo para BELLO CAMPO (BC)
  var sede = 'BELLO CAMPO';
  // Hora solo si viene del cliente (HOY). Si no, sin hora.
  var hora=(payload.meta&&payload.meta.horaTxt)?String(payload.meta.horaTxt).trim():'';
  var horaFecha = hora ? (hora + (fechaIso?(' '+fechaIso):'')) : '';
  // Construir Date real si la hora está presente para escribir en la hoja usando tipo Date
  var dt=null;
  try{
    if(hora){
      var fkey=_asDateKey_(fechaIso); // YYYY-MM-DD
      var p=fkey.split('-');
      var yy=Number(p[0]||0), mm1=Number(p[1]||1)-1, dd=Number(p[2]||1);
      var hm=String(hora||'').split(':');
      var HH=Number(hm[0]||0), MM=Number(hm[1]||0);
      dt=new Date(yy,mm1,dd,HH,MM,0,0);
    }
  }catch(_){ dt=null; }

  var values=sh.getDataRange().getValues();
  var map={};
  // Build tolerant lookup map with multiple key variants to improve matching
  for(var r=2;r<=values.length;r++){
    var row=values[r-1];
    var f=_asDateKey_(row[idx['FECHA']-1]);
    var s=_canonSede(row[idx['SEDE']-1]);
    var c=idx['CODIGO']?_norm(row[idx['CODIGO']-1]):'';
    var p=idx['PRODUCTO']?_norm(row[idx['PRODUCTO']-1]):'';
    var gen=_pref(c,p);
    if(!f||!s) continue;
    // primary normalized key
    if(gen) map[f+'|'+s+'|GEN|'+gen]=r;
    // explicit code and product keys (if present)
    if(c) map[f+'|'+s+'|CODE|'+c]=r;
    if(p) map[f+'|'+s+'|PROD|'+p]=r;
  }

    var items=Array.isArray(payload.items)?payload.items:[];
  var updates=0;
  for(var i=0;i<items.length;i++){
    var it=items[i]||{};
    var nombre=_norm(it.product||it.name);
    var codigo=_norm(it.code);
    var und=_norm(it.und);
  var qty=_toInt(it.quantity);
  var idKey=_pref(codigo,nombre);
  // fsKey: fecha|sede|idKey used for indexing/creating new rows when needed
    if(!idKey) continue;
  // normalize single fsKey expression (use fechaKey for consistent YYYY-MM-DD keys)
  var fsKey = (fechaKey && sede && idKey) ? (fechaKey+'|'+sede+'|'+idKey) : '';
    var rowIndex=map[fsKey]||0;

    if(!rowIndex){
      rowIndex=sh.getLastRow()+1;
      sh.insertRows(rowIndex,1);
    if(idx['HORA'] && dt) sh.getRange(rowIndex,idx['HORA']).setValue(dt);
  if(fechaIso)  sh.getRange(rowIndex,idx['FECHA']).setValue(fechaIso);
      if(sede)   sh.getRange(rowIndex,idx['SEDE']).setValue(sede);
      if(nombre) sh.getRange(rowIndex,idx['PRODUCTO']).setValue(nombre);
      if(codigo) sh.getRange(rowIndex,idx['CODIGO']).setValue(codigo);
      if(und)    sh.getRange(rowIndex,idx['UND']).setValue(und);
      if(idx['CANTIDAD SOLICITADA'])   sh.getRange(rowIndex,idx['CANTIDAD SOLICITADA']).setValue('');
      if(idx['RESPONSABLE SOLICITUD']) sh.getRange(rowIndex,idx['RESPONSABLE SOLICITUD']).setValue('');
      if(idx['CANTIDAD ENTREGADA'])    sh.getRange(rowIndex,idx['CANTIDAD ENTREGADA']).setValue('');
      if(idx['RESPONSABLE ENTREGA'])   sh.getRange(rowIndex,idx['RESPONSABLE ENTREGA']).setValue('');
  if(idx['MERMA'])                  sh.getRange(rowIndex,idx['MERMA']).setValue(_toInt(qty));
      map[fsKey]=rowIndex;
      updates++;
      continue;
    }

    if(idx['MERMA']){
      var cell=sh.getRange(rowIndex,idx['MERMA']);
      var cur=_toInt(cell.getValue());
      var next=cur+qty;
      cell.setValue(next);
    }
  if(idx['HORA']&&dt){ sh.getRange(rowIndex,idx['HORA']).setValue(dt); }
    updates++;
  }
  return {sheet:sheetName,count:updates,idx:idx};
}

function upsertOneSheet(payload,tipo,opts){
  var ss=(opts&&opts.ss)||SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  var sheetName=(opts&&opts.sheetName)||CONFIG.SHEET;
  var requiredHead=(opts&&opts.head)||_defaultRequiredHead_();
  var sh=_getOrCreateSheet(ss,sheetName,requiredHead);
  // Reconciliar orden para garantizar HORA antes de FECHA
  _reconcileHeaderAndOrder_(sh, requiredHead);
  // Limpiar columna obsoleta que no aplica a este formulario
  _dropColumnByExactHeader_(sh,'TIPO_MERMA');
  var idx=_ensureColumnsAndIndex_(sh,requiredHead);
  // Forzar existencia de columna HORA en el encabezado si por alguna razón falta
  try{
    if(!idx['HORA']){
      sh.getRange(1,1,1,requiredHead.length).setValues([requiredHead]);
      sh.setFrozenRows(1);
      idx=_ensureColumnsAndIndex_(sh,requiredHead);
    }
  }catch(_){ }

  var fechaRaw='';
  if(payload.meta&&payload.meta.fechaTxt) fechaRaw=String(payload.meta.fechaTxt).trim(); else fechaRaw=_asDateString(payload.meta&&payload.meta.fecha);
  // Normalizar la fecha del payload a clave YYYY-MM-DD para emparejado consistente
  var fechaIso=_asDateString(fechaRaw);
  var fechaKey=_asDateKey_(fechaIso);
  // Construir Date real si la hora está presente para escribir en la hoja usando tipo Date
  var hora=(payload.meta&&payload.meta.horaTxt)?String(payload.meta.horaTxt).trim():'';
  var dt=null;
  try{
    if(hora && fechaIso){
      var fkey=_asDateKey_(fechaIso);
      var p=fkey.split('-');
      var yy=Number(p[0]||0), mm1=Number(p[1]||1)-1, dd=Number(p[2]||1);
      var hm=String(hora||'').split(':');
      var HH=Number(hm[0]||0), MM=Number(hm[1]||0);
      dt=new Date(yy,mm1,dd,HH,MM,0,0);
    }
  }catch(_){ dt=null; }
  // Asegurar formatos de columnas HORA/FECHA
  try{
    var maxRows4 = sh.getMaxRows();
    var dataRows4 = Math.max(0, maxRows4 - 1);
    if(dataRows4 > 0){
      if(idx['HORA']) sh.getRange(2, idx['HORA'], dataRows4, 1).setNumberFormat('hh:mm yyyy-mm-dd');
      if(idx['FECHA']) sh.getRange(2, idx['FECHA'], dataRows4, 1).setNumberFormat('yyyy-mm-dd');
    }
  }catch(_){ }
  // Ensure SEDE is always 'BC' for MERMA
  if (tipo === 'MERMA') {
    payload.meta.sede = 'BC'; // Force SEDE to BC
  }
  // Respect raw codes for specific forms (e.g. 'tata-libertad') otherwise use canonical names
  var formIdOpt = (opts && opts.formId) ? String(opts.formId).toLowerCase() : '';
  var sede = (formIdOpt === 'tata-libertad') ? _rawSede(payload.meta&&payload.meta.sede) : _canonSede(payload.meta&&payload.meta.sede);
  var resp=_norm(payload.meta&&payload.meta.responsable);
  var solicitudId=(payload.meta&&payload.meta.solicitudId)?String(payload.meta.solicitudId):'';
  var sinSolicitud=!!(payload.meta&&payload.meta.sinSolicitud);
  // Hora solo si viene del cliente (HOY). Si no, sin hora.
  var hora=(payload.meta&&payload.meta.horaTxt)?String(payload.meta.horaTxt).trim():'';
  var horaFecha = hora ? (hora + (fechaIso?(' '+fechaIso):'')) : '';

  var values=sh.getDataRange().getValues();
  var keyToRowFS={};
  var blockByFS={};

  // Decide whether this flow should use raw sede codes (formIdOpt already set above)
  for(var r=2;r<=values.length;r++){
    var row=values[r-1];
    var f=_asDateKey_(row[idx['FECHA']-1]);
    var s = (formIdOpt === 'tata-libertad') ? _rawSede(row[idx['SEDE']-1]) : _canonSede(row[idx['SEDE']-1]);
    var c=idx['CODIGO']?_norm(row[idx['CODIGO']-1]):'';
    var p=idx['PRODUCTO']?_norm(row[idx['PRODUCTO']-1]):'';
    var idKey=_pref(c,p);
    if(f&&s&&idKey) keyToRowFS[f+'|'+s+'|'+idKey]=r;
  }

  // Registro resumen para depuración: número de entradas indexadas
  try{ Logger.log('upsertOneSheet: keyToRowFS entries=%d, sheet=%s', Object.keys(keyToRowFS).length, sheetName); }catch(_){/* ignore */}

    var items=Array.isArray(payload.items)?payload.items:[];
  var updates=[];
  var missing=[];
  for(var i=0;i<items.length;i++){
    var it=items[i];
    var nombre=_norm(it&&(it.product||it.producto||it.name));
    var codigo=_norm(it&&it.code);
    var und=_norm(it&&it.und);
  var qty=_toInt((it&&it.quantity));
    var idKey=_pref(codigo,nombre);
  // fsKey used for indexing/creating new rows when needed (fechaKey|sede|idKey)
  var fsKey = (fechaKey && sede && idKey) ? (fechaKey+'|'+sede+'|'+idKey) : '';
    // Try multiple key variants for matching: prefer CODE, then PROD, then GEN
    var rowIndex=null;
    if(fechaKey && sede){
      var candCode = codigo? (fechaKey+'|'+sede+'|CODE|'+codigo) : null;
      var candProd = nombre? (fechaKey+'|'+sede+'|PROD|'+nombre) : null;
      var candGen = idKey? (fechaKey+'|'+sede+'|GEN|'+idKey) : null;
      if(candCode && keyToRowFS[candCode]) rowIndex=keyToRowFS[candCode];
      else if(candProd && keyToRowFS[candProd]) rowIndex=keyToRowFS[candProd];
      else if(candGen && keyToRowFS[candGen]) rowIndex=keyToRowFS[candGen];
      else rowIndex=null;
    }

    if(tipo==='SOLICITUD'){
      if(!rowIndex){
          var placeKey=(fechaIso||'')+'|'+(sede||'');
        var block=blockByFS[placeKey];
        var insertAt=((block&&block.last)||sh.getLastRow())+1;
        sh.insertRows(insertAt,1);
        rowIndex=insertAt;
    if(blockByFS[placeKey]) blockByFS[placeKey].last=rowIndex; else blockByFS[placeKey]={first:rowIndex,last:rowIndex};
  if(idx['HORA']&&dt) sh.getRange(rowIndex,idx['HORA']).setValue(dt);
  if(fechaIso)  sh.getRange(rowIndex,idx['FECHA']).setValue(fechaIso);
        if(sede)   sh.getRange(rowIndex,idx['SEDE']).setValue(sede);
        if(nombre) sh.getRange(rowIndex,idx['PRODUCTO']).setValue(nombre);
        if(codigo) sh.getRange(rowIndex,idx['CODIGO']).setValue(codigo);
        if(und)    sh.getRange(rowIndex,idx['UND']).setValue(und);
  if(fsKey) keyToRowFS[fsKey]=rowIndex;
      }
      sh.getRange(rowIndex,idx['CANTIDAD SOLICITADA']).setValue(qty);
      if(idx['RESPONSABLE SOLICITUD']) sh.getRange(rowIndex,idx['RESPONSABLE SOLICITUD']).setValue(resp);
  if(idx['HORA']&&dt) sh.getRange(rowIndex,idx['HORA']).setValue(dt);
      updates.push({row:rowIndex,tipo:tipo,qty:qty});
      continue;
    }

    if(rowIndex){
      if(idx['CANTIDAD ENTREGADA'])  sh.getRange(rowIndex,idx['CANTIDAD ENTREGADA']).setValue(qty);
      if(idx['RESPONSABLE ENTREGA']) sh.getRange(rowIndex,idx['RESPONSABLE ENTREGA']).setValue(resp);
  if(idx['HORA']&&dt) sh.getRange(rowIndex,idx['HORA']).setValue(dt);
      updates.push({row:rowIndex,tipo:tipo,qty:qty});
      continue;
    }

    if(sinSolicitud&&CONFIG.ALWAYS_CREATE_WHEN_SIN_SOLICITUD){
  var placeKeyE=(fechaIso||'')+'|'+(sede||'');
      var blockE=blockByFS[placeKeyE];
      var insertAtE=((blockE&&blockE.last)||sh.getLastRow())+1;
      sh.insertRows(insertAtE,1);
      rowIndex=insertAtE;
      if(blockByFS[placeKeyE]) blockByFS[placeKeyE].last=rowIndex; else blockByFS[placeKeyE]={first:rowIndex,last:rowIndex};
  if(idx['HORA']&&dt) sh.getRange(rowIndex,idx['HORA']).setValue(dt);
  if(fechaIso) sh.getRange(rowIndex,idx['FECHA']).setValue(fechaIso);
      if(sede)  sh.getRange(rowIndex,idx['SEDE']).setValue(sede);
      if(nombre) sh.getRange(rowIndex,idx['PRODUCTO']).setValue(nombre);
      if(codigo) sh.getRange(rowIndex,idx['CODIGO']).setValue(codigo);
      if(und)    sh.getRange(rowIndex,idx['UND']).setValue(und);
      if(idx['CANTIDAD ENTREGADA'])  sh.getRange(rowIndex,idx['CANTIDAD ENTREGADA']).setValue(qty);
      if(idx['RESPONSABLE ENTREGA']) sh.getRange(rowIndex,idx['RESPONSABLE ENTREGA']).setValue(resp);
  if(idx['HORA']&&dt) sh.getRange(rowIndex,idx['HORA']).setValue(dt);
      updates.push({row:rowIndex,tipo:tipo,qty:qty});
      continue;
    }
    missing.push({key:fsKey,producto:nombre,codigo:codigo,qty:qty});
  }
  return {sheet:sheetName,count:updates.length,missing:missing,idx:idx};
}

function _json(obj,status){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function _resolveSpreadsheet(ssid,ssurl){
  try{
    if(ssid) return SpreadsheetApp.openById(ssid);
    if(ssurl){
      var m=String(ssurl).match(/\/d\/([^/]+)/);
      if(m&&m[1]) return SpreadsheetApp.openById(m[1]);
    }
  }catch(e){}
  return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
}

function _getOrCreateSheet(ss,name,header){
  // Normalize sheet name: avoid creating sheets with empty names
  var sheetName = String(name||'').trim();
  if(!sheetName) sheetName = CONFIG.SHEET || 'Sheet1';
  var sh=ss.getSheetByName(sheetName);
  if(!sh) sh=ss.insertSheet(sheetName);
  // Sólo inicializa encabezados si la hoja está vacía (no pisa hojas existentes)
  var lastRow=sh.getLastRow();
  if(lastRow<=0){
    var need=header.slice(0);
    sh.getRange(1,1,1,need.length).setValues([need]);
    sh.setFrozenRows(1);
  }
  return sh;
}

// Reconcilia diferencias de encabezados y reordena físicamente las columnas para que coincidan con "requiredHead"
function _reconcileHeaderAndOrder_(sh, requiredHead){
  try{
    var lc=sh.getLastColumn();
    if(lc<=0) return;
    // Eliminar filtro activo si impide mover columnas
    try{ var filter=sh.getFilter&&sh.getFilter(); if(filter) filter.remove(); }catch(_){ }
    var cur=sh.getRange(1,1,1,lc).getValues()[0];
    // Normaliza sinónimos conocidos
    for(var c=0;c<cur.length;c++){
      if(String(cur[c]).trim().toUpperCase()==='PRODUCTOS'){
        cur[c]='PRODUCTO';
        sh.getRange(1,c+1).setValue('PRODUCTO');
      }
    }
    // Asegura existencia de todas las columnas requeridas (si falta alguna, insertarla en su posición)
    for(var i=0;i<requiredHead.length;i++){
      var name=requiredHead[i];
      var idx=-1;
      for(var j=0;j<cur.length;j++){ if(String(cur[j]).trim()===name){ idx=j; break; } }
      if(idx===-1){
        sh.insertColumnBefore(i+1);
        sh.getRange(1,i+1).setValue(name);
        cur.splice(i,0,name);
      }
    }
    // Reordenar columnas según requiredHead
    // Nota: mover de izquierda a derecha recalculando índices tras cada movimiento
    for(var i2=0;i2<requiredHead.length;i2++){
      var want=requiredHead[i2];
      var curIdx=-1;
      for(var j2=0;j2<cur.length;j2++){ if(String(cur[j2]).trim()===want){ curIdx=j2; break; } }
      var dest=i2; // 0-based
      if(curIdx!==-1 && curIdx!==dest){
        // mover columna curIdx+1 a posición dest+1
        sh.moveColumns(sh.getRange(1,curIdx+1,sh.getMaxRows(),1), dest+1);
        // Actualiza arreglo cur al nuevo orden
        var moved=cur.splice(curIdx,1)[0];
        cur.splice(dest,0,moved);
      }
    }
    // Escribe los encabezados exactamente como requiredHead en las primeras N columnas
    sh.getRange(1,1,1,requiredHead.length).setValues([requiredHead]);
    sh.setFrozenRows(1);

    // Opcional: si hay columnas duplicadas de nombres requeridos a la derecha de N, eliminarlas para evitar confusiones futuras
    var lastColNow=sh.getLastColumn();
    if(lastColNow>requiredHead.length){
      var hdrNow=sh.getRange(1,1,1,lastColNow).getValues()[0];
      var reqSet={}; for(var r=0;r<requiredHead.length;r++){ reqSet[requiredHead[r]]=true; }
      // Recorre de derecha a izquierda eliminando duplicados de nombres requeridos más allá de N
      for(var cc=lastColNow; cc>requiredHead.length; cc--){
        var nameNow=String(hdrNow[cc-1]).trim();
        if(reqSet[nameNow]){
          try{ sh.deleteColumn(cc); }catch(e){}
        }
      }
    }
  }catch(e){ /* no-op si no se puede reordenar */ }
}

// Crea una hoja temporal con el HEAD requerido, copia los datos mapeando columnas por nombre y reemplaza la original
function fixSheetToHead_(ss, sheetName, requiredHead){
  var sh=ss.getSheetByName(sheetName);
  if(!sh) throw new Error('sheet not found: '+sheetName);
  var data=sh.getDataRange().getValues();
  if(data.length===0){
    // crear encabezado si estaba vacía
    sh.getRange(1,1,1,requiredHead.length).setValues([requiredHead]);
    return {sheet:sheetName,rows:0,head:requiredHead};
  }
  var curHead=data[0];
  // mapa nombre normalizado -> index 0-based (PRODUCTOS -> PRODUCTO)
  var map={};
  for(var i=0;i<curHead.length;i++){
    var raw=String(curHead[i]).trim();
    var norm=(raw.toUpperCase()==='PRODUCTOS')?'PRODUCTO':raw;
    // Conserva la primera ocurrencia si hay duplicados
    if(map[norm]==null) map[norm]=i;
  }
  // construir salida
  var outRows=[];
  for(var r=1;r<data.length;r++){
    var row=data[r];
    var out=new Array(requiredHead.length).fill('');
    for(var c=0;c<requiredHead.length;c++){
      var name=requiredHead[c];
      var idx=map[name];
      if(idx!=null && idx>=0 && idx<row.length){ out[c]=row[idx]; }
    }
    outRows.push(out);
  }
  var tmpName=sheetName+'__FIX_TMP';
  var tmp=ss.getSheetByName(tmpName); if(tmp) ss.deleteSheet(tmp);
  tmp=ss.insertSheet(tmpName);
  tmp.getRange(1,1,1,requiredHead.length).setValues([requiredHead]);
  tmp.setFrozenRows(1);
  if(outRows.length) tmp.getRange(2,1,outRows.length,requiredHead.length).setValues(outRows);
  // Reemplaza: renombra original y luego renombra tmp
  var oldName=sheetName+'__OLD_'+(new Date().getTime());
  ss.setActiveSheet(sh);
  sh.setName(oldName);
  tmp.setName(sheetName);
  return {sheet:sheetName,rows:outRows.length,head:requiredHead};
}

function _dropColumnByExactHeader_(sh,name){
  try{
    var lastCol=sh.getLastColumn();
    if(lastCol<=0) return false;
    var head=sh.getRange(1,1,1,lastCol).getValues()[0];
    var targets=[];
    for(var c=1;c<=head.length;c++){
      if(String(head[c-1]).trim()===name){ targets.push(c); }
    }
    for(var i=targets.length-1;i>=0;i--){ sh.deleteColumn(targets[i]); }
    return targets.length>0;
  }catch(e){ return false; }
}

function _ensureColumnsAndIndex_(sh,requiredHead){
  var lastCol=sh.getLastColumn();
  var head=lastCol>0?sh.getRange(1,1,1,lastCol).getValues()[0]:[];
  var map={};
  for(var i=0;i<head.length;i++) map[head[i]]=i+1;
  var changed=false;
  for(var j=0;j<requiredHead.length;j++){
    var name=requiredHead[j];
    if(!map[name]){ head.push(name); map[name]=head.length; changed=true; }
  }
  if(changed){ sh.getRange(1,1,1,head.length).setValues([head]); sh.setFrozenRows(1); }
  var idx={}; for(var k=0;k<head.length;k++) idx[head[k]]=k+1; return idx;
}

function _norm(v){ return String(v==null?'':v).trim().toUpperCase(); }
function _pref(a,b){ return a?a:b; }
// Convierte valores a número robustamente: maneja strings con coma decimal, nulos y NaN
// Convierte a entero (estricto): acepta sólo enteros; si recibe number se trunca.
// No acepta comas ni decimales en strings — entradas no enteras devuelven 0.
function _toInt(v){
  try{
    if(v==null) return 0;
    if(typeof v==='number'){
      if(!Number.isFinite(v)) return 0;
      return Math.trunc(v);
    }
    var s=String(v).trim();
    if(s==='') return 0;
    // aceptar opcionalmente signo y sólo dígitos
    var m=s.match(/^[-+]?\d+$/);
    if(m) return parseInt(s,10);
    return 0;
  }catch(_){ return 0; }
}
function _asDateString(x){
  if(!x) return '';
  if(Object.prototype.toString.call(x)==='[object Date]'){
    var y=x.getFullYear(),m=String(x.getMonth()+1).padStart(2,'0'),d=String(x.getDate()).padStart(2,'0');
    return y+'-'+m+'-'+d;
  }
  var s=String(x).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var d=new Date(s);
  if(!isNaN(d)){
    var yy=d.getFullYear(),mm=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');
    return yy+'-'+mm+'-'+dd;
  }
  return s;
}

// Devuelve una clave de fecha normalizada YYYY-MM-DD a partir de valores tipo
// 'YYYY-MM-DD' o 'DD-MM-AAAA' (con separador '-') para usar en llaves de búsqueda.
function _asDateKey_(s){
  if(!s) return '';
  var str=String(s).trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(str)) return str; // ya está en ISO
  var m=str.match(/^(\d{2})-(\d{2})-(\d{4})$/); // dd-mm-aaaa
  if(m){ return m[3]+'-'+m[2]+'-'+m[1]; }
  // Último intento: Date parse
  var d=new Date(str);
  if(!isNaN(d)){
    var yy=d.getFullYear(),mm=('0'+(d.getMonth()+1)).slice(-2),dd=('0'+d.getDate()).slice(-2);
    return yy+'-'+mm+'-'+dd;
  }
  return str;
}

// Formatea hora HH:MM en 24h a partir de Date
function _asTimeString(d){
  try{
    var hh=('0'+d.getHours()).slice(-2);
    var mm=('0'+d.getMinutes()).slice(-2);
    return hh+':'+mm;
  }catch(_){ return ''; }
}
// Asegura formato de fecha de visualización dd-mm-aaaa
// (función _asDateDisplay_ se eliminó porque no estaba en uso; reintroducir si se necesita)
// Ensure HORA is formatted as yyyy-mm-dd hh:mm
  // Nota: no introducir código que use variables externas aquí; las funciones manejan formato/columnas localmente.