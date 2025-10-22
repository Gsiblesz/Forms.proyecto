// Definición de formularios tipo "Google Forms" con pestaña de sheet y color
// Puedes ajustar los colores y, más adelante, los catálogos de productos

window.FORMS = [
  {
    id: "tata-libertad",
    title: "LA TATA DE LA LIBERTAD",
    sheetTab: "LA TATA DE LA LIBERTAD",
    color: "#b8f1c4", // verde suave
    catalog: [] // productos se cargarán luego
  },
  {
    id: "congelados-hojaldre",
    title: "CONGELADOS HOJALDRE",
    sheetTab: "CONGELADOS HOJALDRE",
    color: "#c9eef7", // celeste
    catalog: []
  },
  {
    id: "inventario-pt",
    title: "INVENTARIO PRODUCTO TERMINADO",
    sheetTab: "INVENTARIO PRODUCTO TERMINADO",
    color: "#e7e0f1", // lila
    catalog: []
  },
  {
    id: "horneado",
    title: "HORNEADO",
    sheetTab: "HORNEADO",
    color: "#ffd5d5", // rosado
    catalog: []
  },
  {
    id: "empaquetado",
    title: "EMPAQUETADO",
    sheetTab: "EMPAQUETADO",
    color: "#e6e6e6", // gris
    catalog: []
  }
];

// Utilidad para encontrar config por id o devolver la primera
window.getFormConfig = function(formId) {
  const list = window.FORMS || [];
  if (!list.length) return null;
  return list.find(f => f.id === formId) || list[0];
};
