# Formulario de Productos y Cantidades

Una página web simple (sin frameworks) para registrar múltiples productos con sus cantidades en varias filas, guardar localmente y exportar a CSV.

## ¿Qué contiene?
- `index.html`: La interfaz principal del formulario.
- `assets/styles.css`: Estilos limpios y modernos.
- `assets/app.js`: Lógica para agregar/eliminar filas, validar, guardar en localStorage y exportar CSV.

## Uso
1. Abre `index.html` en tu navegador.
2. Haz clic en "+ Agregar producto" para añadir filas.
3. Selecciona un producto y escribe una cantidad entera mayor o igual a 0.
4. Presiona "Guardar" para almacenar el registro localmente.
5. Usa "Exportar CSV" para descargar todos los registros guardados.
6. "Borrar registros" limpia el almacenamiento local.

## Personalización
- Edita el catálogo de productos en `assets/app.js` (`PRODUCT_CATALOG`).
- Puedes conectar a un backend reemplazando el `save()` por un `fetch()` a tu API.

### Ejemplo de integración con backend (opcional)
```js
async function saveToBackend(items) {
  const res = await fetch("https://tu-backend/render.app/api/submissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error("Error al guardar");
  return await res.json();
}
```

## Integración con Google Sheets (Apps Script)

URL actual desplegada (puede cambiar en futuras versiones):

```
https://script.google.com/macros/s/AKfycbzqI10HExaNc6XPhPFWgJT6Z1MGosym8xTHTDDhgP4-BuJsJ6k2b5bl7O2QFNnuCHXJRA/exec
```

Si se genera una nueva implementación en Apps Script, recuerda actualizar esta URL en `assets/app.js`, `app.js` y `menu.html` (función `resetSettingsUI`).

El proyecto incluye una sección de “Integración con Google Sheets” en la página para enviar cada registro a una Web App de Apps Script.

### Pasos rápidos
1. Crea (o abre) una Hoja en Google Sheets. Copia su ID (lo que está entre `/d/` y `/edit` en la URL).
2. Crea un proyecto en Apps Script (Drive → Nuevo → Más → Google Apps Script) y pega este código base en `Código.gs`:

```
function doPost(e) {
  try {
    const ss = SpreadsheetApp.openById('TU_SPREADSHEET_ID');
    const raw = e && e.postData ? e.postData.contents : null;
    const body = raw ? JSON.parse(raw) : {};
    // body = { id, at, items: [{ product, quantity }, ...] }

    const sheet = ss.getSheetByName('Entradas') || ss.insertSheet('Entradas');
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(['entry_id', 'timestamp', 'product_id', 'quantity', 'sede', 'responsable', 'fecha']);
    }

    const rows = (body.items || []).map(it => [
      body.id,
      body.at,
      it.product,
      it.quantity,
      body.meta?.sede || '',
      body.meta?.responsable || '',
      body.meta?.fecha || '',
    ]);
    if (rows.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, rows: rows.length }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

3. Implementa como Web App: Implementar → Nueva implementación → Tipo “Web app”.
   - Execute as: Tu cuenta
   - Who has access: “Anyone” o “Anyone with the link”
   - Autoriza y copia la URL que termina en `/exec`.

4. En `index.html`, sección “Integración con Google Sheets”:
   - Pega la URL `/exec` en “URL del Web App”.
   - (Opcional) Escribe un “Token secreto”. Si lo usas, añade la validación en Apps Script (ver abajo).
   - Marca “Enviar a Google Sheets al guardar” y pulsa “Guardar ajustes”.
   - Usa “Probar conexión”. Debe mostrar `HTTP 200 — { ok: true, ... }` y crear una fila PING.

### Token (opcional, recomendado)
En Apps Script, añade una validación antes de escribir:

```
const TOKEN = 'TU_TOKEN_SECRETO';

function doPost(e) {
  try {
    const raw = e && e.postData ? e.postData.contents : null;
    const body = raw ? JSON.parse(raw) : {};
    if (body.token !== TOKEN) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    // ... resto del código para escribir en la hoja ...
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

En la página, agrega el mismo token en el campo “Token secreto”. El frontend lo enviará en el cuerpo.

### Consejos y troubleshooting
- Si ves 401/403: revisa “Who has access” en el despliegue (usar Anyone/Anyone with the link) o que estés en el dominio correcto.
- Si “Probar conexión” dice `TypeError: fetch` o similar: puede ser CORS. El frontend envía `text/plain` para minimizar preflights; muchas veces funciona sin más. Aun así, si hubiera bloqueo, se puede usar `mode: 'no-cors'` (no permite leer la respuesta) o enrutar el envío vía un backend propio.
- Si cambias el script, vuelve a “Administrar implementaciones” y edita o crea una nueva versión; usa la nueva URL `/exec` si cambia.
- Las filas se escriben en la pestaña “Entradas”. Encabezados: `entry_id, timestamp, product_id, quantity`.

## Notas
- Los datos se guardan en `localStorage` bajo la clave `productos_registrados`.
- El CSV incluye: id de registro, timestamp ISO, id y nombre de producto y cantidad.
- Este proyecto es estático, puedes hospedarlo en cualquier hosting estático o abrir el archivo localmente.

## Publicar en Vercel (estático)
Este proyecto ya incluye `vercel.json` y `.vercelignore` para desplegar solo `index.html` y `assets/`.

Pasos:
1. Sube esta carpeta a un repo de GitHub.
2. En Vercel → Add New → Project → importa el repo.
  - Framework: Other/Static
  - Build Command: (vacío)
  - Output Directory: (vacío)
  - Root Directory: la raíz donde está `index.html`.
3. Deploy y abre la URL `.vercel.app`.

Nota: `backend/` y `frontend/` se excluyen del deploy mediante `.vercelignore`.
