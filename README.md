# Tendeta · Cobra y devuelve el cambio

Juego educativo web para alumnado de Educación Primaria (6–12 años): el niño o la niña hace de cajero/a
en una tienda o un restaurante, cobra la compra y **devuelve el cambio**, con el teclado numérico o con
billetes y monedas. Practica el cálculo mental de la resta como **«escala ascendente»** (contar hacia delante
desde el precio hasta lo pagado), la composición de cantidades y los decimales con euros y céntimos.

- Bilingüe: **castellano** (idioma principal) y **valenciano**.
- Funciona en ordenador, tableta y móvil, con ratón, teclado o táctil, y **sin conexión** una vez cargado (PWA instalable).
- Sin publicidad, sin cuentas, sin cookies, sin analítica y sin peticiones externas: los datos se quedan en el dispositivo.

## Qué incluye

| | |
|---|---|
| **Escenarios** | Supermercado, Restaurante (menú del día, carta, mesas, cuenta a partes), Mercado (precio por kilo y medio kilo) y Horchatería (tamaños). Se añaden más con un JSON. |
| **Modos** | Cliente automático, Tienda libre (el jugador llena la cesta y elige cómo pagar), Reto (5 o 10 clientes, cronómetro opcional) y Práctica guiada (ejemplo resuelto + pistas que se retiran). |
| **Niveles 1–6** | Del euro entero hasta 10 € (1.º) a ofertas 2×1 / 3×2, descuentos del 10, 25 y 50 %, cuentas divididas, estimación previa y cambio con el mínimo de piezas (6.º). |
| **Respuesta** | Teclado numérico (coma desde el nivel 3) o cajón con billetes y monedas propios (tocar o arrastrar a la bandeja). |
| **Retroalimentación** | «Has devuelto 1,00 € de más», «Te faltan 0,20 €», confusión euros/céntimos, llevadas, ofertas… Pista con recta numérica y, tras el segundo intento, la solución paso a paso. |
| **Panel adulto** | Acceso con una multiplicación o manteniendo pulsado 3 s. Estadísticas por perfil, tipos de error, CSV, resumen imprimible, ajustes y **fichas imprimibles** (tiques, solucionario y dinero recortable). |
| **Bienestar** | Rondas cortas, sin vidas ni rachas ni premios al azar; pegatinas en orden fijo para decorar «Mi tienda»; aviso amable a los 10 minutos. |

El plan de diseño completo está en [`docs/PLAN.md`](docs/PLAN.md).

## Puesta en marcha

Requisitos: Node.js 20 o superior.

```bash
npm install
```

```bash
npm run dev
```

Abre `http://localhost:5173`. El service worker solo se registra en la versión de producción:

```bash
npm run build
```

```bash
npm run preview
```

## Tests

Tests unitarios (Vitest): formato y parseo de importes, cambio voraz frente a programación dinámica, llevadas,
conteo hacia delante, descuentos, errores, CSV, traducciones y **10 000 problemas aleatorios por nivel y escenario**.

```bash
npm test
```

Tests end-to-end (Playwright) en tamaño móvil y tableta: rondas completas con teclado y con dinero, tienda libre,
nivel 6, práctica guiada, panel adulto, valenciano, ausencia de scroll horizontal, ninguna petición externa y
funcionamiento sin conexión.

```bash
npx playwright install chromium
```

```bash
npm run e2e
```

## Integración continua y publicación

- **`.github/workflows/ci.yml`** (pull requests y ramas): comprueba tipos, pasa los tests unitarios, construye la
  PWA y verifica que existen el service worker, el manifiesto y los iconos, y ejecuta los tests e2e en móvil y tableta.
- **`.github/workflows/deploy.yml`** (cada `push` a `main` o lanzamiento manual): reutiliza la validación anterior y,
  si todo pasa, publica `dist/` en **GitHub Pages**.

La PWA se publica en `https://pove.github.io/tendeta/` y se puede instalar desde el navegador. Usa rutas relativas
(`base: './'`), así que funciona en cualquier subcarpeta; para otro servidor basta con copiar `dist/` tras
`npm run build` (conviene servir `sw.js` sin caché larga para que las actualizaciones lleguen enseguida).

## Añadir una tienda nueva

1. Crea `src/data/scenarios/<id>.json` con `id`, `name` y `tagline` (`es` y `va`), `icon`, `kind`
   (`basket` o `table`), `color`, opcionalmente `minStep` (redondeo de precios en céntimos) y `products`.
2. Cada producto tiene `id`, `name` (`es`/`va`), `icon` (emoji), `category`, `unit` (`u` o `kg`) y un
   rango de precio realista en céntimos `price: [min, max]` (o `sizes` con un rango por tamaño).
3. Añade la importación en `src/data/index.ts` y la categoría `cat.<categoría>` en `src/i18n/es.json` y `va.json`.

El generador intersecta cada rango con el del nivel, así que un producto solo aparece en los niveles en los
que su precio tiene sentido. Los tests comprueban automáticamente los nuevos datos.

## Idiomas

Los textos están en `src/i18n/es.json` (diccionario maestro) y `src/i18n/va.json`. Para añadir otro idioma
(por ejemplo inglés), crea `en.json` con las mismas claves y regístralo en `src/i18n/index.ts`.
Las frases que nombran a quien atiende la caja existen en femenino y masculino (`clave` y `clave.m`) y se
eligen al azar para evitar estereotipos.

## Estructura

```
src/core/       lógica pura en céntimos enteros (generador, pagos, llevadas, errores, estadísticas)
src/data/       niveles, escenarios y pegatinas (JSON)
src/i18n/       traducciones
src/state/      perfiles, ajustes y registro (localStorage protegido con try/catch)
src/services/   voz, sonido, aviso de pausa y service worker
src/ui/         componentes, pantallas y dibujos SVG propios (dinero, clientes, iconos, recta numérica)
tests/          Vitest · e2e/  Playwright · scripts/gen-icons.mjs  iconos PNG desde el SVG
```

## Privacidad

Pensado para menores (RGPD y LOPDGDD): no hay cuentas ni nombres reales (solo un apodo y un animal), no se usan
cookies ni analítica, no se hace ninguna petición de red durante el juego (fuentes e imágenes locales, con una
política CSP que lo impide) y todo se guarda solo en el navegador del dispositivo. El panel adulto incluye
**Borrar todos los datos**.

## Créditos y licencias

- Tipografía [Atkinson Hyperlegible](https://www.brailleinstitute.org/freefont/) © Braille Institute of America,
  bajo SIL Open Font License 1.1 (`src/assets/fonts/OFL-LICENSE.txt`).
- Billetes, monedas, personajes, iconos y logotipo: diseños propios en SVG. No reproducen los billetes ni las
  monedas reales del euro.
