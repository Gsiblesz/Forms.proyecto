// Definición de formularios tipo "Google Forms" con pestaña de sheet y color
// Puedes ajustar los colores y, más adelante, los catálogos de productos

window.FORMS = [
  {
    id: "tata-libertad",
    title: "LA TATA DE LA LIBERTAD",
    sheetTab: "LA TATA DE LA LIBERTAD",
    color: "#b8f1c4", // verde suave
    catalog: [], // catálogo plano opcional
    description: "Formulario de Operaciones de Manufactura.\n\nEntrega de producto terminado a tiendas, sedes y ventas al mayor",
    sedes: ["SL","LPG","SC","SCH","PB-2","E PB-2","LG","VM","BC"],
    familias: [
      "CONGELADOS DE HOJALDRE",
      "DONAS Y PERLAS",
      "HORNEADO FRESCO",
      "EMPAQUETADO",
      "MERMA"
    ],
    groups: [
      {
        label: "Lista 1: Donas Regulares y Rellenas",
        products: [
          "DONA REGULAR GLASEADA 60 GR 1 UND",
          "DONA REGULAR CHOCOLATE 60 GR 1 UND",
          "DONA REGULAR CHOCO CHISPAS 60 GR 1 UND",
          "DONA REGULAR CHOCO MANI 60 GR 1 UND",
          "DONA REGULAR VAINILLA 60 GR 1 UND",
          "DONA REGULAR BERRY GOOD 60 GR 1 UND",
          "DONA REGULAR PIE DE LIMON 60 GR 1 UND",
          "DONA REGULAR CHOCOLATE BLANCO 60 GR 1 UND",
          "DONA REGULAR MAPPLE 60 GR 1 UND",
          "DONA RELLENA DE VAINILLA 60 GR 1 UND",
          "DONA RELLENA DE CHOCOLATE 60 GR 1 UND",
          "DONA RELLENA DE BUFITO 60 GR 1 UND",
          "DONA RELLENA CREMA DE MANI 60 GR 1 UND",
          "MINI DONA REGULAR GLASEADA 30 GR 1 UND"
        ]
      },
      {
        label: "Lista 2: Mini Donas, Perlas y Donas Plain",
        products: [
          "MINI DONA REGULAR CHOCOLATE 30 GR 1 UND",
          "MINI DONA REGULAR CHOCO CHISPAS 30 GR 1 UND",
          "MINI DONA REGULAR CHOCO MANI 30 GR 1 UND",
          "MINI DONA REGULAR VAINILLA 30 GR 1 UND",
          "MINI DONA REGULAR BERRY GOOD 30 GR 1 UND",
          "MINI DONA REGULAR PIE DE LIMON 30 GR 1 UND",
          "MINI DONA REGULAR CHOCOLATE BLANCO 30 GR 1 UND",
          "PERLA DE NUTELLA 30 GR 1 UND",
          "PERLA DE BUFITO 30 GR 1 UND",
          "DONA PAVLOVA",
          "DONA REGULAR PLAIN 60 GR 1 UND ST",
          "DONA RELLENA PLAIN 60 GR 1 UND ST",
          "MINI DONA PLAIN 30 GR 1 UND ST",
          "PERLA PLAIN 30 G UND",
          "CAJA DE PALMERITAS 120 GR 8 UND"
        ]
      },
      {
        label: "Lista 3: Tequeños, Croissants y Cruffins",
        products: [
          "TEQUEÑOS 30 UND",
          "TEQUEÑOS 15 UND",
          "MINI CROISSANT SIMPLE 1 UND",
          "CROISSANT SIMPLE 120 GR 1 UND",
          "CROISSANT CHOCO-LECHE 160 GR 1 UND",
          "CROISSSANT CHOCO-OSCURO 160 GR 1 UND",
          "HOJALDRE DE MANZANA 160 GR 1 UND",
          "CUAIMA 65 GR 1 UND",
          "MINI CROISSANT CON PISTACHO 1 UND",
          "CRUFFIN DE PECANS 1 UND",
          "CRUFFIN DE PISTACHOS 1 UND",
          "CRUFFIN DE CAFE Y AVELLANAS 1 UND",
          "CROISSANT SIMPLE 120 GR 1 UND ST",
          "CROISSANT CHOCO LECHE 160 GR 1 UND ST",
          "CROISSSANT CHOCO OSCURO 160 GR 1 UND ST",
          "HOJALDRE DE MANZANA 160 GR 1 UND ST"
        ]
      },
      {
        label: "Lista 4: Croissants, Cruffins, Panes y Bagels",
        products: [
          "MINI CROISSANT 1 UND ST",
          "CRUFFIN PLAIN ST 1 UND",
          "PAN TIPO CHINO 45 G 6UND",
          "PAN INTEGRAL 700 GR 1 UND",
          "BAGEL EVERYTHING 105 GR 4 UND",
          "BAGEL PLAIN 105 GR 4 UND",
          "BAGEL AMAPOLA 105 G 4 UND",
          "BAGEL AJONJOLI 105 GR 4 UND",
          "BAGEL SPICY 105 GR 4 UND",
          "BAGEL BLUEBERRY 105 GR 4 UND",
          "MINI BAGEL EVERYTHING 45 GR 5 UND",
          "MINI BAGEL PLAIN 45 GR 5 UND",
          "MINI BAGEL AMAPOLA 45 GR 5 UND",
          "MINI BAGEL AJONJOLI 45 GR 5 UND",
          "MINI BAGEL SPICY 45 GR 5 UND",
          "PANETONE GRANDE 400 GR"
        ]
      },
      {
        label: "Lista 5: Panes Especiales y Baguettes",
        products: [
          "MINI PANETONE 90 GR",
          "BAGEL CHIPS 200 G",
          "BABKA DE CHOCOLATE 840G",
          "BAGELS INTEGRAL CON TOOPING DE AVENA",
          "BABKA DE COFFE CAKE 840 GR 1 UND",
          "PAN JALLAH 600 GR 1 UND",
          "PAN TIPO CHINO 12 UND",
          "CHOCOCOOKIES PAQ 5 UND",
          "CANILLA ARTESANAL 210 G 1 UND WAB",
          "CANILLON ARTESANAL 310 G 1 UND WAB",
          "PAN CUADRADO MASA MADRE 1 K",
          "PAN DE A LOCHA 80 GR 1 UND",
          "CANILLA 240 GR 1 UND",
          "MINI CANILLA 120 GR 1 UND",
          "BAGUETTE 320 GR 1 UND"
        ]
      },
      {
        label: "Lista 6: Baguetitos, Galletas y Pastelitos de Hojaldre",
        products: [
          "BAGUITO 140 GR 1 UND",
          "DEMI BAGUETTE 140 GR 1 UND",
          "PAN DE DIOS 45 GR 1 UND",
          "GALLETA DE AVENA 33 GR 1 UND",
          "MASA DE CHOCOCOOKIES CONGELADAS 1 K",
          "DONA REGULAR COOKIES & CREAM 60 GR 1 UND",
          "CENTRICO GLASEADOS 1 CAJA 10 UND",
          "PASTELITO DE HOJALDRE CARNE MOLIDA 1 UND",
          "PASTELITO DE HOJALDRE DE POLLO 1 UND",
          "PASTELITO DE HOJALDRE RICOTA Y ESPINACA 1 UND",
          "PASTELITO DE HOJALDRE CARNE MOLIDA CONGELADO 1 UND ST",
          "PASTELITO DE HOJALDRE DE POLLO CONGELADO 1 UND ST",
          "PASTELITO DE HOJALDRE RICOTA Y ESPINACA 1 UND ST",
          "PAN TIPO CHINO 15 UND 20 G"
        ]
      }
    ]
  },
  {
    id: "congelados-hojaldre",
    title: "CONGELADOS HOJALDRE",
    sheetTab: "CONGELADOS HOJALDRE",
    color: "#c9eef7", // celeste
    description: "Formulario de Operaciones de Manufactura.\n\nEntrega de producto terminado a tienda.",
    sedes: ["SL","LPG","SC","SCH","PB-2","E PB-2","LG","VM","BC"],
    catalog: [
      { id: "TEQUEÑOS (15 UND)", name: "TEQUEÑOS (15 UND)" },
      { id: "TEQUEÑOS (30 UND)", name: "TEQUEÑOS (30 UND)" },
      { id: "CROISSANT SIMPLE 120 GR 1 UND ST", name: "CROISSANT SIMPLE 120 GR 1 UND ST" },
      { id: "CROISSANT CHOCO LECHE 160 GR 1 UND ST", name: "CROISSANT CHOCO LECHE 160 GR 1 UND ST" },
      { id: "CROISSANT CHOCO OSCURO 160 GR 1 UND ST", name: "CROISSANT CHOCO OSCURO 160 GR 1 UND ST" },
      { id: "HOJALDRE DE MANZANA 160 GR 1 UND ST", name: "HOJALDRE DE MANZANA 160 GR 1 UND ST" },
      { id: "MINI CROISSANT 1 UND ST", name: "MINI CROISSANT 1 UND ST" },
      { id: "CRUFFIN PLAIN ST 1 UND", name: "CRUFFIN PLAIN ST 1 UND" }
    ]
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
