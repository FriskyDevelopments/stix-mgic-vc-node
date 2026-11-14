# Checklist — Panel de Rangel (4 Elementos)

Source: read-only review of Rangel's Notion, 2026-11-11. Machine-readable copy: `server/rangel-interview/checklist.json`.

## Questions for Rangel (Nebu asks these)

### Servicios

| ID | Question / fix | Answer type | Notion target |
|---|---|---|---|
| `servicios.masaje-relajante.precio` | ¿Cuánto cuesta «Masaje relajante»? Dime el precio en pesos (solo el número). | number | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8135-946a-c19de9a114c9`, property=`Precio MXN` |
| `servicios.masaje-relajante.duracion` | ¿Cuántos minutos dura «Masaje relajante»? | number | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8135-946a-c19de9a114c9`, property=`Duración (min)` |
| `servicios.masaje-relajante.activo` | ¿Ofreces «Masaje relajante» ahora mismo? (sí / no) | yes_no | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8135-946a-c19de9a114c9`, property=`Activo` |
| `servicios.masaje-relajante.notas` | ¿Algo que quieras que diga sobre «Masaje relajante»? (por ejemplo, para quién es o qué incluye; o dime «saltar») | text | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8135-946a-c19de9a114c9`, property=`Notas` |
| `servicios.descontracturante.precio` | ¿Cuánto cuesta «Descontracturante»? Dime el precio en pesos (solo el número). | number | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8151-bf9a-f1518870cf26`, property=`Precio MXN` |
| `servicios.descontracturante.duracion` | ¿Cuántos minutos dura «Descontracturante»? | number | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8151-bf9a-f1518870cf26`, property=`Duración (min)` |
| `servicios.descontracturante.activo` | ¿Ofreces «Descontracturante» ahora mismo? (sí / no) | yes_no | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8151-bf9a-f1518870cf26`, property=`Activo` |
| `servicios.descontracturante.notas` | ¿Algo que quieras que diga sobre «Descontracturante»? (por ejemplo, para quién es o qué incluye; o dime «saltar») | text | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8151-bf9a-f1518870cf26`, property=`Notas` |
| `servicios.piedras-calientes.precio` | ¿Cuánto cuesta «Piedras calientes»? Dime el precio en pesos (solo el número). | number | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8165-afc6-e91197b16203`, property=`Precio MXN` |
| `servicios.piedras-calientes.duracion` | ¿Cuántos minutos dura «Piedras calientes»? | number | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8165-afc6-e91197b16203`, property=`Duración (min)` |
| `servicios.piedras-calientes.activo` | ¿Ofreces «Piedras calientes» ahora mismo? (sí / no) | yes_no | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8165-afc6-e91197b16203`, property=`Activo` |
| `servicios.piedras-calientes.notas` | ¿Algo que quieras que diga sobre «Piedras calientes»? (por ejemplo, para quién es o qué incluye; o dime «saltar») | text | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8165-afc6-e91197b16203`, property=`Notas` |
| `servicios.reflexologia.precio` | ¿Cuánto cuesta «Reflexología»? Dime el precio en pesos (solo el número). | number | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8119-b097-d297df08e34b`, property=`Precio MXN` |
| `servicios.reflexologia.duracion` | ¿Cuántos minutos dura «Reflexología»? | number | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8119-b097-d297df08e34b`, property=`Duración (min)` |
| `servicios.reflexologia.activo` | ¿Ofreces «Reflexología» ahora mismo? (sí / no) | yes_no | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8119-b097-d297df08e34b`, property=`Activo` |
| `servicios.reflexologia.notas` | ¿Algo que quieras que diga sobre «Reflexología»? (por ejemplo, para quién es o qué incluye; o dime «saltar») | text | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-8119-b097-d297df08e34b`, property=`Notas` |
| `servicios.aromaterapia.precio` | ¿Cuánto cuesta «Aromaterapia»? Dime el precio en pesos (solo el número). | number | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-81c8-8ef6-ffcb17821dec`, property=`Precio MXN` |
| `servicios.aromaterapia.duracion` | ¿Cuántos minutos dura «Aromaterapia»? | number | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-81c8-8ef6-ffcb17821dec`, property=`Duración (min)` |
| `servicios.aromaterapia.activo` | ¿Ofreces «Aromaterapia» ahora mismo? (sí / no) | yes_no | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-81c8-8ef6-ffcb17821dec`, property=`Activo` |
| `servicios.aromaterapia.notas` | ¿Algo que quieras que diga sobre «Aromaterapia»? (por ejemplo, para quién es o qué incluye; o dime «saltar») | text | kind=`update_property`, database=`Servicios`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7`, page_id=`41544c9f-0eac-81c8-8ef6-ffcb17821dec`, property=`Notas` |

### Terapeutas

| ID | Question / fix | Answer type | Notion target |
|---|---|---|---|
| `terapeutas.1.nombre` | Empecemos con tu equipo 💆 ¿Cómo se llama la primera terapeuta (o terapeuta) que va en la página? | text | kind=`update_property`, database=`Terapeutas`, data_source_id=`4ef98c24-2fa6-456c-afe0-cea1448aaaaf`, page_id=`41544c9f-0eac-81f7-b2e5-e2ae40d22e60`, property=`Nombre` |
| `terapeutas.1.especialidad` | ¿Qué masajes da? Puedes decir varios: Masaje relajante, Descontracturante, Piedras calientes, Reflexología, Aromaterapia. | multi_select | kind=`update_property`, database=`Terapeutas`, data_source_id=`4ef98c24-2fa6-456c-afe0-cea1448aaaaf`, page_id=`41544c9f-0eac-81f7-b2e5-e2ae40d22e60`, property=`Especialidad` |
| `terapeutas.1.bio` | Cuéntame en dos o tres líneas quién es y cómo trabaja. Eso va en su tarjeta. | text | kind=`update_property`, database=`Terapeutas`, data_source_id=`4ef98c24-2fa6-456c-afe0-cea1448aaaaf`, page_id=`41544c9f-0eac-81f7-b2e5-e2ae40d22e60`, property=`Bio corta` |
| `terapeutas.1.activo` | ¿Quieres que salga ya en la página web? (sí / no) | yes_no | kind=`update_property`, database=`Terapeutas`, data_source_id=`4ef98c24-2fa6-456c-afe0-cea1448aaaaf`, page_id=`41544c9f-0eac-81f7-b2e5-e2ae40d22e60`, property=`Activo en sitio` |
| `terapeutas.1.foto` | Cuando tengas su foto, súbela tú en Notion: abre «Terapeutas», toca su ficha y cambia «Foto». (No generamos caras.) ¿Ya la subiste? (sí / no) | yes_no | kind=`manual`, database=`Terapeutas`, data_source_id=`4ef98c24-2fa6-456c-afe0-cea1448aaaaf`, page_id=`41544c9f-0eac-81f7-b2e5-e2ae40d22e60`, property=`Foto` |
| `terapeutas.otra` | ¿Hay otra persona en el equipo? Dime su nombre, o «no». | text | kind=`create_row`, database=`Terapeutas`, data_source_id=`4ef98c24-2fa6-456c-afe0-cea1448aaaaf`, title_property=`Nombre` |

### Citas

| ID | Question / fix | Answer type | Notion target |
|---|---|---|---|
| `citas.primera` | ¿Tienes alguna cita ya agendada que quieras anotar? Dime cuál (por ejemplo «Relajante con Ana, viernes 5 pm»), o «no». | text | kind=`create_row`, database=`Citas`, data_source_id=`a12f6703-712e-4197-b214-f8abf981d04b`, title_property=`Cita` |

### Movimientos administrativos

| ID | Question / fix | Answer type | Notion target |
|---|---|---|---|
| `movimientos.primero` | ¿Hay algún ingreso o gasto que quieras anotar? Dime el concepto (por ejemplo «Compra de aceites»), o «no». | text | kind=`create_row`, database=`Movimientos administrativos`, data_source_id=`c1d41174-ea48-4c92-bef3-46781669ac9e`, title_property=`Concepto` |

### Pendientes de Rangel

| ID | Question / fix | Answer type | Notion target |
|---|---|---|---|
| `pendientes.precios.hecho` | ¿Ya quedó «Definir duración y precio en MXN de cada servicio»? (sí / no) | yes_no | kind=`update_property`, database=`Pendientes de Rangel`, data_source_id=`8648c5db-e870-4502-b7d3-41d0131ad9b3`, page_id=`41544c9f-0eac-8150-88b3-c8d868b2dda6`, property=`Hecho` |
| `pendientes.precios.fecha` | ¿Para qué fecha quieres tener «Definir duración y precio en MXN de cada servicio»? (por ejemplo 30/11/2026, o «saltar») | date | kind=`update_property`, database=`Pendientes de Rangel`, data_source_id=`8648c5db-e870-4502-b7d3-41d0131ad9b3`, page_id=`41544c9f-0eac-8150-88b3-c8d868b2dda6`, property=`Fecha límite` |
| `pendientes.fichas.hecho` | ¿Ya quedó «Llenar la ficha de cada terapeuta (nombre, especialidad, bio corta)»? (sí / no) | yes_no | kind=`update_property`, database=`Pendientes de Rangel`, data_source_id=`8648c5db-e870-4502-b7d3-41d0131ad9b3`, page_id=`41544c9f-0eac-814f-ab6c-e52ab9c9faa0`, property=`Hecho` |
| `pendientes.fichas.fecha` | ¿Para qué fecha quieres tener «Llenar la ficha de cada terapeuta (nombre, especialidad, bio corta)»? (por ejemplo 30/11/2026, o «saltar») | date | kind=`update_property`, database=`Pendientes de Rangel`, data_source_id=`8648c5db-e870-4502-b7d3-41d0131ad9b3`, page_id=`41544c9f-0eac-814f-ab6c-e52ab9c9faa0`, property=`Fecha límite` |
| `pendientes.fotos.hecho` | ¿Ya quedó «Mandar la foto de cada terapeuta»? (sí / no) | yes_no | kind=`update_property`, database=`Pendientes de Rangel`, data_source_id=`8648c5db-e870-4502-b7d3-41d0131ad9b3`, page_id=`41544c9f-0eac-8159-b73b-d164b76d97ef`, property=`Hecho` |
| `pendientes.fotos.fecha` | ¿Para qué fecha quieres tener «Mandar la foto de cada terapeuta»? (por ejemplo 30/11/2026, o «saltar») | date | kind=`update_property`, database=`Pendientes de Rangel`, data_source_id=`8648c5db-e870-4502-b7d3-41d0131ad9b3`, page_id=`41544c9f-0eac-8159-b73b-d164b76d97ef`, property=`Fecha límite` |
| `pendientes.cuestionario.hecho` | ¿Ya quedó «Contestar el cuestionario de la página web»? (sí / no) | yes_no | kind=`update_property`, database=`Pendientes de Rangel`, data_source_id=`8648c5db-e870-4502-b7d3-41d0131ad9b3`, page_id=`41544c9f-0eac-810e-b84d-ebf19213fe46`, property=`Hecho` |
| `pendientes.cuestionario.fecha` | ¿Para qué fecha quieres tener «Contestar el cuestionario de la página web»? (por ejemplo 30/11/2026, o «saltar») | date | kind=`update_property`, database=`Pendientes de Rangel`, data_source_id=`8648c5db-e870-4502-b7d3-41d0131ad9b3`, page_id=`41544c9f-0eac-810e-b84d-ebf19213fe46`, property=`Fecha límite` |

### Marca 4 Elementos

| ID | Question / fix | Answer type | Notion target |
|---|---|---|---|
| `marca.tipografia` | Para la página web, ¿qué letra te gusta más? A) Jost Light, suave y moderna. B) Cinzel para títulos con Inter para el texto, más clásica. (A / B) | choice | kind=`append_note`, page_id=`41544c9f-0eac-818e-9a15-e1a5e8d0a49d` |
| `marca.logo` | ¿Tienes los archivos del logo (PNG o SVG)? Súbelos en la página «Marca 4 Elementos». ¿Ya están? (sí / no) | yes_no | kind=`append_note`, page_id=`41544c9f-0eac-818e-9a15-e1a5e8d0a49d` |

### Workspace

| ID | Question / fix | Answer type | Notion target |
|---|---|---|---|
| `workspace.paginas-sueltas` | Vi dos páginas vacías sin título fuera de tu Panel. ¿Las creaste tú y las quieres guardar? (sí / no) | yes_no | kind=`append_note`, page_id=`41544c9f-0eac-811d-ab8d-f9a2e399d810` |
| `workspace.paginas-inicio` | Notion trae unas páginas de ejemplo («Welcome to Notion», «To Do List», «Example sub-page»). ¿Las usas o las dejamos de lado? (sí las uso / no) | yes_no | kind=`append_note`, page_id=`41544c9f-0eac-811d-ab8d-f9a2e399d810` |

## Fixes for the team (need Francisco's GO)

### Muse

| ID | Question / fix | Answer type | Notion target |
|---|---|---|---|
| `fix.devin.db-title` | Rename database «Solicitudes para Devin» → «Solicitudes para Muse» (same ID). | none | kind=`manual`, data_source_id=`890a5388-82ca-4b62-a86a-29ad6d7afd20`, property=`title` |
| `fix.devin.property` | Rename property «Respuesta de Devin» → «Respuesta de Muse» (same property id %60%7DAT). | none | kind=`manual`, data_source_id=`890a5388-82ca-4b62-a86a-29ad6d7afd20`, property=`Respuesta de Devin` |
| `fix.devin.block.4bee` | Heading «Cómo pedirle ayuda a Devin» → rewrite for Muse. | none | kind=`manual`, block_id=`41544c9f-0eac-819f-8cf3-e57299834bee`, page_id=`41544c9f-0eac-811d-ab8d-f9a2e399d810` |
| `fix.devin.block.5317` | Step 1 mentions «Solicitudes para Devin» → rewrite for Muse. | none | kind=`manual`, block_id=`41544c9f-0eac-81ad-9030-d17d8c9a5317`, page_id=`41544c9f-0eac-811d-ab8d-f9a2e399d810` |
| `fix.devin.block.68f6` | Step 3 «Devin revisa cada hora» — also misleading: nothing polls this table → rewrite for Muse. | none | kind=`manual`, block_id=`41544c9f-0eac-813f-8c3b-fb2f2cbc68f6`, page_id=`41544c9f-0eac-811d-ab8d-f9a2e399d810` |
| `fix.devin.block.eb6b` | Step 4 mentions «Respuesta de Devin» → rewrite for Muse. | none | kind=`manual`, block_id=`41544c9f-0eac-8186-9600-f096ee07eb6b`, page_id=`41544c9f-0eac-811d-ab8d-f9a2e399d810` |
| `fix.devin.block.a827` | Closing paragraph «Devin nunca borra nada…» → rewrite for Muse. | none | kind=`manual`, block_id=`41544c9f-0eac-81bd-8c88-eb20337aa827`, page_id=`41544c9f-0eac-811d-ab8d-f9a2e399d810` |
| `fix.polling-step` | Replace the hourly-check promise with how Muse really picks up requests once the Muse↔Notion connection exists. | none | kind=`manual`, block_id=`41544c9f-0eac-813f-8c3b-fb2f2cbc68f6` |
| `fix.muse-connection` | Muse ↔ Notion connection not configured; method unknown. Needs Muse's Notion connector (OAuth, share «Panel de Rangel») or a dedicated integration token. | none | kind=`manual`, page_id=`41544c9f-0eac-811d-ab8d-f9a2e399d810` |

### Copiado desde FriskyDev

| ID | Question / fix | Answer type | Notion target |
|---|---|---|---|
| `fix.telegram-mentions` | 9 blocks in copied pages mention Telegram (historical). Decide: leave, or add a note that Rangel does not use Telegram. | none | kind=`manual`, page_id=`41544c9f-0eac-8153-a490-cf968af209ed` |

### Visual

| ID | Question / fix | Answer type | Notion target |
|---|---|---|---|
| `fix.covers` | Panel + 6 databases have no cover; add calm, face-free Unsplash/Notion covers (paused until GO). | none | kind=`manual`, page_id=`41544c9f-0eac-811d-ab8d-f9a2e399d810` |

### Terapeutas

| ID | Question / fix | Answer type | Notion target |
|---|---|---|---|
| `fix.placeholder-photo` | Foto placeholder is hosted on placehold.co; replace with a file uploaded to Notion or her real photo. | none | kind=`manual`, data_source_id=`4ef98c24-2fa6-456c-afe0-cea1448aaaaf`, page_id=`41544c9f-0eac-81f7-b2e5-e2ae40d22e60`, property=`Foto` |

### Servicios

| ID | Question / fix | Answer type | Notion target |
|---|---|---|---|
| `fix.servicios-gallery` | «Tarjetas» gallery shows page covers but no service row has one. | none | kind=`manual`, data_source_id=`db8fe3ff-d405-4ebf-a534-58b05820cee7` |
