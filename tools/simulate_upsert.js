// Simulación ligera de la lógica de emparejado de upsertOneSheet
// Ejecutar: node tools\simulate_upsert.js

function _canonSede(raw){
  const s=String(raw||'').trim().toUpperCase();
  if(s==='BC'||s==='BELLO CAMPO') return 'BELLO CAMPO';
  if(s==='E PB-2'||s==='E PB2'||s==='E PB') return 'E PB-2';
  if(s==='PB'||s==='PALOS GRANDES'||s==='LOS PALOS GRANDES') return 'LOS PALOS GRANDES';
  if(s==='SL'||s==='SAN LUIS') return 'SAN LUIS';
  return s;
}
function _norm(x){ return String(x||'').trim().toUpperCase(); }
function _pref(code,name){ code=_norm(code); name=_norm(name); return code||name||''; }
function _asDateKey(fecha){ // fecha en dd-mm-aaaa -> YYYY-MM-DD
  if(!fecha) return '';
  var m=String(fecha).trim().match(/(\d{2})-(\d{2})-(\d{4})/);
  if(!m) return '';
  return m[3]+'-'+m[2]+'-'+m[1];
}

// Estado simulado de la hoja: array de filas (1-based index assumed for printing)
// Cada fila: {FECHA:'dd-mm-aaaa', SEDE:'BELLO CAMPO', CODIGO:'ABC', PRODUCTO:'NOMBRE', CANTIDAD_SOLICITADA:..., CANTIDAD_ENTREGADA:...}
var sheetRows = [
  // header (ignored)
  null,
  // existing row: solicitud previa creada
  {FECHA:'17-11-2025', SEDE:'BELLO CAMPO', CODIGO:'ABC123', PRODUCTO:'PAN', CANTIDAD_SOLICITADA:10, CANTIDAD_ENTREGADA:null}
];

function buildMaps(rows){
  var keyToRowFS={};
  var blockByFS={};
  for(var r=1;r<rows.length;r++){
    var row=rows[r]; if(!row) continue;
    var f=String(row.FECHA||'').trim();
    var s=_canonSede(row.SEDE||'');
    var c=_norm(row.CODIGO||'');
    var p=_norm(row.PRODUCTO||'');
    var idKey=_pref(c,p);
    if(f && s){
      keyToRowFS[f+'|'+s+'|'+idKey]=r;
      var fsOnly=f+'|'+s;
      if(!blockByFS[fsOnly]) blockByFS[fsOnly]={first:r,last:r}; else blockByFS[fsOnly].last=r;
    }
  }
  return {keyToRowFS,blockByFS};
}

function simulateSolAndEnt(){
  console.log('Estado inicial de la hoja (fila 2):', sheetRows[1]);

  // 1) Simular envío de SOLICITUD (ya existe la fila, pero vamos a enviar otra solicitud para mismo producto)
  var solicitudPayload = {
    meta: { fechaTxt:'17-11-2025', sede:'BELLO CAMPO', responsable:'Ana', tipo:'SOLICITUD' },
    items: [ { code:'ABC123', product:'Pan', quantity:5 } ]
  };

  var maps = buildMaps(sheetRows);
  // Ahora la lógica del servidor usa dd-mm-aaaa como clave, así que usamos la misma cadena
  var fechaKey=solicitudPayload.meta.fechaTxt;
  var sedeCanon=_canonSede(solicitudPayload.meta.sede);
  var it=solicitudPayload.items[0];
  var idKey=_pref(it.code,it.product);
  var fsKey = (fechaKey && sedeCanon && idKey) ? (fechaKey+'|'+sedeCanon+'|'+idKey) : '';
  var rowIndex = fsKey? maps.keyToRowFS[fsKey] : null;

  if(!rowIndex){
    console.log('SOLICITUD: no existe fila, crear nueva');
    var insertAt = sheetRows.length; // append
    var newRow = { FECHA:solicitudPayload.meta.fechaTxt, SEDE:sedeCanon, CODIGO:it.code, PRODUCTO:it.product, CANTIDAD_SOLICITADA:it.quantity, CANTIDAD_ENTREGADA:null };
    sheetRows.push(newRow);
    console.log('Fila insertada en índice', insertAt+1, newRow);
  } else {
    console.log('SOLICITUD: fila encontrada en index', rowIndex+1, ' - actualizar CANTIDAD_SOLICITADA');
    sheetRows[rowIndex].CANTIDAD_SOLICITADA = it.quantity; // sobrescribir para la prueba
  }

  console.log('\nTras SOLICITUD la hoja tiene filas:');
  for(var i=1;i<sheetRows.length;i++) console.log(i+':', sheetRows[i]);

  // 2) Simular ENTREGA con mismos keys
  var entregaPayload = {
    meta: { fechaTxt:'17-11-2025', sede:'BELLO CAMPO', responsable:'Luis', tipo:'ENTREGADO' },
    items: [ { code:'ABC123', product:'Pan', quantity:5 } ]
  };

  maps = buildMaps(sheetRows);
  fechaKey=entregaPayload.meta.fechaTxt;
  sedeCanon=_canonSede(entregaPayload.meta.sede);
  it=entregaPayload.items[0];
  idKey=_pref(it.code,it.product);
  fsKey = (fechaKey && sedeCanon && idKey) ? (fechaKey+'|'+sedeCanon+'|'+idKey) : '';
  rowIndex = fsKey? maps.keyToRowFS[fsKey] : null;

  if(rowIndex){
    console.log('\nENTREGA: fila encontrada en index', rowIndex+1, ' - actualizar CANTIDAD_ENTREGADA y RESPONSABLE ENTREGA');
    sheetRows[rowIndex].CANTIDAD_ENTREGADA = it.quantity;
    sheetRows[rowIndex].RESPONSABLE_ENTREGA = entregaPayload.meta.responsable;
  } else {
    console.log('\nENTREGA: no se encontró fila. missing. Si meta.sinSolicitud y config lo permite, crear fila.');
  }

  console.log('\nEstado final de la hoja:');
  for(var j=1;j<sheetRows.length;j++) console.log(j+':', sheetRows[j]);
}

simulateSolAndEnt();
