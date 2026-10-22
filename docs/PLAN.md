# Tendeta · Plan de implementación

> juego de cajero/a para practicar el dinero y el cambio (Primaria, 6–12 años).

Este documento recoge las decisiones de diseño y arquitectura tomadas antes de programar y
cómo se valida cada criterio de aceptación de la especificación.

---

## 1. Decisiones de stack

| Tema | Decisión | Motivo |
|---|---|---|
| Lenguaje | TypeScript estricto | Tipos para el dinero (céntimos enteros) y los datos JSON. |
| Bundler | Vite | Rápido, sitio estático, `base: './'` para GitHub Pages en subcarpeta. |
| UI | DOM nativo con un micro-helper `h()` (≈60 líneas) | Sin framework: carga mínima, Chromebooks modestos. Cada pantalla es una función que pinta en `#app`. |
| Estilos | CSS propio con *custom properties* | Paleta como tokens, `prefers-reduced-motion`, tamaño de letra escalable. |
| Tipografía | Atkinson Hyperlegible (woff2 latin 400/700 alojados en el repo, licencia OFL) | Diseñada para lectores con baja visión; distingue bien 1/l/I y 0/O. Cero peticiones externas. |
| PWA | Manifest + service worker propio generado por un plugin de Vite | Precaché de **todos** los ficheros del build con versión por hash; sin dependencias de Workbox. |
| Sonido | Web Audio sintetizado (sin ficheros) | Suave, ligero, silencio por defecto. |
| Voz | Web Speech API con degradación silenciosa | Lee precios, consignas y el conteo hacia adelante. |
| Tests | Vitest (núcleo) + Playwright (e2e móvil y tableta) | Lo exige la especificación. |
| Persistencia | `localStorage` envuelto en `try/catch` | Funciona aunque falle (modo privado). |

## 2. Identidad visual

**Concepto:** una *tendeta* de barrio valenciana: toldo a rayas, papel de ticket, azulejo y naranjas.

| Token | Color | Uso |
|---|---|---|
| `--crema` | `#FFF6E9` | Fondo general (papel cálido, menos fatiga que el blanco). |
| `--paper` | `#FFFDF8` | Tarjetas y ticket. |
| `--tinta` | `#2B2340` | Texto (contraste 14:1 sobre crema). |
| `--tinta-suau` | `#5E5470` | Texto secundario (≥ 6:1). |
| `--blau` (azulejo) | `#1E5AA8` | Botones principales con texto blanco (6,6:1). |
| `--taronja` | `#F08A24` | Acento: toldo, foco, destacados (siempre con texto tinta). |
| `--verd` | `#23784A` | Acierto (texto blanco 5,3:1). |
| `--roig` (terracota) | `#C2412D` | Error amable (texto blanco 4,9:1). |
| `--groc` (mostassa) | `#F5C443` | Estrellas, monedas doradas. |

- **Toldo** a rayas naranja/crema con borde festoneado como cabecera de todas las pantallas.
- **Icono de la app:** fondo azulejo, toldo festoneado y una moneda dorada con el símbolo € dibujado como trazo (no depende de fuentes). Versiones SVG, 192, 512, *maskable* 512 y *apple-touch* 180 generadas desde el SVG con Playwright (`scripts/gen-icons.mjs`).
- **Personajes:** clientes SVG procedurales y diversos (6 tonos de piel, 8 peinados incl. hiyab y gorra, gafas, barba, canas), con 3 expresiones (neutral, contento, pensativo).
- **Dinero propio:**
  - Billetes con tamaño proporcional al valor, cifra grande, color propio **y** forma distintiva por valor (5 ● círculo, 10 ▲ triángulo, 20 ■ cuadrado, 50 ◆ rombo, 100 ★ estrella) para daltonismo, y la palabra **JOC/JUEGO**. Sin arquitectura, banderas, siglas ni mapas.
  - Monedas con diámetro proporcional al real, cobre / dorado / bimetálicas, cifra grande y unidad (c / €).

## 3. Arquitectura

```
src/
  core/        lógica pura y testeada (sin DOM)
    money.ts       denominaciones, formato «3,50 €», parseo, cambio voraz (óptimo), texto para voz
    rng.ts         PRNG con semilla (mulberry32) → problemas reproducibles e imprimibles
    borrow.ts      detección de «llevada» en la resta en columnas (céntimos)
    countup.ts     pasos del cajero: 7,40 → 7,50 → 8 → 10 → 20
    pricing.ts     lista de precios por ronda (nivel, escenario, ofertas)
    generator.ts   generador de problemas (cesta / mesa de restaurante)
    payment.ts     pagos realistas (sin piezas superfluas, «truco» 20,05 €)
    errors.ts      clasificación de errores (de más, de menos, llevada, euros/céntimos, porcentaje)
    estimate.ts    pregunta de estimación «¿más o menos de 5 €?»
    adaptive.ts    ajuste suave dentro del nivel
    stats.ts       estadísticas por perfil + CSV
  data/        JSON: niveles, escenarios (supermercat, restaurant, mercat, orxateria), pegatinas
  i18n/        es.json (maestro, por defecto), va.json + index.ts (estructura preparada para «en»)
  state/       almacenamiento seguro, ajustes, perfiles, registro
  services/    voz, sonido, bienestar (aviso a los 10 min), registro del SW
  ui/          helper DOM, SVG (dinero, clientes, iconos, recta numérica), componentes y pantallas
tests/         Vitest
e2e/           Playwright
```

### 3.1 Modelo de dinero

Todo en **céntimos enteros** (`type Cents = number`, siempre `Number.isInteger`). El formato y el parseo están
en `money.ts` y no usan coma flotante (`parseEuro("12,3") → 1230` por manipulación de cadenas).

### 3.2 Niveles (`levels.json`)

| Nivel | Líneas | Precio | Paso | Total máx. | Paga con | Dinero para devolver | Extra |
|---|---|---|---|---|---|---|---|
| 1 | 1–2 | 1–5 € | 1 € | 10 € | 5 € o 10 € | 1 €, 2 €, 5 € | — |
| 2 | 2–3 | 1–15 € | 1 € | 20 € (a veces 50 €) | 20 €, 50 € (y 10+5…) | 1, 2, 5, 10, 20 € | — |
| 3 | 2–4 | 0,50–15 € | 0,50 € | 50 € | 20 €, 50 € (+ monedas para redondear) | 50 c → 20 € | ×2, coma |
| 4 | 2–5 | 0,10–20 € | 0,10 € | 100 € | 50 €, 100 € (+ combinaciones) | 10 c → 50 € | ×2…×5 |
| 5 | 3–6 | 0,01–25 € | 1 c | 100 € | 50/100 € o 20+5 € | todo hasta 50 € | kg y ½ kg, suma oculta |
| 6 | 3–8 | 0,01–40 € | 1 c | 200 € | combinaciones «raras» (20,05 €) | todo | 2×1, 3×2, −10/25/50 %, cuenta dividida, estimación, mínimo de piezas |

Proporción objetivo de problemas **con llevada** creciente: 40 % → 85 %.

### 3.3 Generador

1. **Lista de precios por ronda**: para cada producto se intersecta su rango realista con el del nivel y se
   elige un múltiplo del paso. Productos sin intersección no aparecen (un pan nunca cuesta 40 €).
   Productos por kilo: precio/kg par (½ kg exacto). Tamaños (orxateria) ordenados de menor a mayor.
   En nivel 6 se marcan ofertas (2×1, 3×2) y descuentos con precios divisibles (25 % → múltiplo de 4…).
2. **Cesta / mesa**: se eligen líneas y cantidades hasta respetar mín./máx. de líneas y el total máximo.
   En restaurante se genera una mesa de 1–4 comensales con menú del día o carta; nivel 6 puede dividir
   la cuenta a partes iguales (solo si es divisible exacto).
3. **Pago realista**: se enumeran multiconjuntos de piezas del nivel y se filtran:
   suma > importe, **ninguna pieza sobra** (si quitas cualquiera, ya no llega), la pieza mayor como mucho
   un escalón por encima de la mínima que cubre el importe. Desde el nivel 3 se añade el «truco» de dar los
   céntimos (13,50 → paga 20,50 → cambio 7 €).
4. **Llevada**: se sortea si el problema debe ser con o sin llevada según el nivel y se escoge un pago
   compatible; si no hay, se regenera (máx. 60 intentos).
5. Validaciones garantizadas por tests (10 000 casos por nivel y escenario): pago ≥ total, cambio > 0,
   cambio expresable con el dinero del nivel, céntimos según nivel, enteros siempre.

### 3.4 Estrategia del cajero (`countup.ts`)

Desde el importe se salta al siguiente múltiplo del hito más pequeño que no se cumple
(5 c, 10 c, 50 c, 1 €, 5 €, 10 €, 20 €, 50 €, 100 €) sin pasarse de lo pagado.
Se dibuja como **recta numérica** con arcos «+10 c», «+50 c», «+2 €»… animados paso a paso (y leídos en voz alta).

### 3.5 Retroalimentación y errores

- Acierto: cliente contento, sonido suave, conteo hacia adelante.
- Error: «Has tornat 1,00 € de més» / «Et falten 0,20 €»; detección de confusión euros/céntimos
  (×100, ÷100, «3,7» frente a «0,37»), de llevada olvidada y de porcentaje no aplicado. Botón **Pista**
  (primer salto de la recta numérica) y segundo intento. Tras el segundo fallo: solución resuelta paso a paso.
- Tipos de error guardados por perfil para el panel adulto y para el **repaso**: la siguiente ronda
  prioriza el tipo de problema más fallado (p. ej., más problemas con llevada).

## 4. Pantallas y flujo

1. **Inicio**: selector de idioma (ES por defecto / VA), perfiles (alias + animal, aviso «sin nombres reales»),
   acceso adulto (mantener 3 s o multiplicación).
2. **Preparar partida**: escenario (4 tarjetas), modo (4), nivel (1–6 con curso orientativo), forma de responder
   (teclado / dinero). Primer uso de un nivel → propone la práctica guiada.
3. **Caja**: cliente + bocadillo, ticket que se «escanea» línea a línea, dinero del cliente sobre el mostrador;
   panel de respuesta (teclado o cajón + bandeja). En horizontal: caja a la izquierda, cajón a la derecha;
   en vertical: apilado.
4. **Tienda libre**: estantería con etiquetas de precio, cesta, selector de kg y tamaños, elección de pago.
5. **Resumen de ronda**: 1–3 estrellas, pegatina nueva (secuencia fija, sin azar) y aciertos.
6. **La meua tenda**: fachada para colocar pegatinas.
7. **Panel adulto**: estadísticas por perfil, CSV (`;`, coma decimal, BOM), imprimir resumen, ajustes, fichas
   imprimibles (tickets + solucionario + billetes y monedas recortables), borrar todos los datos.

## 5. Bienestar y privacidad

Rondas de 5 (configurable a 10), aviso amable a los 10 min, sin rachas, sin vidas, sin ranking, sin azar en premios.
Cero peticiones externas: fuentes, iconos y sonidos locales; sin cookies; datos solo en el dispositivo.

## 6. Fases y verificación

| Fase | Contenido | Verificación |
|---|---|---|
| 1 | Núcleo (dinero, generador, llevada, conteo, errores) + datos + i18n | Vitest: 10 000 casos por nivel/escenario |
| 2 | UI de caja: teclado, dinero, retroalimentación, rondas, 4 escenarios, 4 modos | Navegador + e2e |
| 3 | Panel adulto, CSV, fichas imprimibles, pegatinas | Navegador |
| 4 | PWA offline, voz, accesibilidad, iconos | e2e offline + auditoría de peticiones |

## 7. Matriz de criterios de aceptación

| Criterio | Cómo se cumple / verifica |
|---|---|
| Ronda completa en super y restaurante, libre y automático, 6 niveles | e2e + pruebas manuales |
| Tres formas de respuesta según nivel | `levels.json` → `money`, `decimalKey`, `traySum`; e2e con teclado y dinero |
| Sin problemas imposibles ni redondeos | Tests de 10 000 casos; céntimos enteros en todo el núcleo |
| Error indica cuánto sobra/falta, pista y solución | `errors.ts` + tests; UI de feedback |
| Todo traducido VA/ES | Test de paridad de claves y de nombres de productos |
| Offline y sin scroll horizontal en móvil | e2e con `context.setOffline(true)` y comprobación de `scrollWidth` |
| Panel adulto con estadísticas, CSV y fichas | Navegador + test de CSV |
| Sin peticiones de red tras la carga | e2e registra todas las peticiones: solo mismo origen |
| Dinero de diseño propio | SVG propios con «JOC/JUEGO» |
| Tests en verde | `npm test` y `npm run e2e` |


## 8. Idioma principal

El idioma del código fuemte es inglés. El principal de las claves, los elementos, productos, título, subtílulo, etc y UI es el Español, el segundo idioma que se puede elegir es el valenciano.