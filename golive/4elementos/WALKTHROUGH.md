# 4 Elementos — first-run walkthrough

Preview route in this repo: `/4elementos`. The Cloudflare demo serves the same screen at `/` after `./golive/4elementos/demo/preview.sh`. Both are a sample. Neither is production and neither uses the client's domain.

The account lives in `sessionStorage` under `4elementos.onboarding.v1`. Nothing is written to Notion. Prices are sample prices, not Rangel's.

Global chrome on every screen:

- Banner: "Muestra. No es producción y no usa el dominio del cliente."
- Skip link: "Saltar al contenido" (visible on focus).
- One `h1`. The title is copied below, per screen.
- `lang="es"` on the shell.
- Four decorative orbs, `aria-hidden`. They drift unless motion is reduced.
- Errors use `role="alert"` and start with "Falta algo para seguir."
- A visually hidden polite live region repeats the current title.

Steps: landing, welcome, studio, element, services, hours, channels, payments, review, activating, activated.

## landing

- Title: Cuatro elementos, un estudio
- Lede: Tierra, agua, fuego y aire. Esta es la primera vez de 4 Elementos: de la puerta a una cuenta de muestra activa.
- Primary: Entrar al estudio
- No back button. No step count.
- Next goes to welcome. Nothing is validated.
- Edge: a stored `activatedAt` skips this screen and opens activated. Corrupt JSON, a wrong version, or an unknown step opens landing with the empty draft (studio name "4 Elementos", services preselected, days Tuesday–Saturday, WhatsApp on, calls off).

## welcome

- Title: Lo que vamos a dejar listo
- Lede: El nombre de la casa, los servicios de muestra, los días y los canales. Nada se publica y no se escribe en Notion desde aquí.
- Primary: Seguir
- Back: Atrás, returns to landing.
- Body lists three beats: the name, the sample services and days, and WhatsApp via WAHA plus calls via Twilio, both with Marina.
- Edge: refresh keeps welcome.

## studio

- Title: El nombre de la casa
- Lede: Así va a aparecer el estudio en esta muestra. La letra se puede cambiar; Rangel todavía no confirmó la suya.
- Primary: Continuar
- Kicker: Paso 1 de 7
- Fields: "Nombre del estudio" (default "4 Elementos", autocomplete organization) and "Tu nombre" (empty, autocomplete name). Max 60 characters.
- Radios: "A. Jost, suave y moderna" and "B. Cinzel para los títulos". Default B. This does not update Notion.
- Errors: "Escribe el nombre del estudio, con al menos 2 letras." and "Escribe tu nombre." The invalid field gets `aria-invalid`.
- Edge: a name of only spaces or symbols fails. Control characters are stripped. Going back later keeps the name. Typing does not pull focus back to the heading.

## element

- Title: El elemento que abre
- Lede: Elige uno. Es el tono de esta cuenta, no un diagnóstico.
- Primary: Continuar
- Kicker: Paso 2 de 7
- Radiogroup, label "Elemento que abre la casa". Arrow keys move the selection.
- Tierra: "Lo que sostiene. Trabajo firme, pies en el suelo."
- Agua: "Lo que suelta. Ritmo lento, masaje que no empuja."
- Fuego: "Lo que calienta. Constancia, piedras, presencia."
- Aire: "Lo que aligera. Aroma y un respiro más abierto."
- Error: "Elige un elemento para seguir."
- The chosen card is not color alone: `aria-checked` and an inset bar.
- Edge: the step list will not open element until the studio step is valid.

## services

- Title: Lo que ofreces ahora
- Lede: Los precios son de muestra. No son los de tu lista: esos siguen vacíos hasta que los confirmes.
- Primary: Continuar
- Kicker: Paso 3 de 7
- Five checkboxes, all on by default: Masaje relajante (60 min, $900 MXN de muestra), Descontracturante (50, $950), Piedras calientes (75, $1100), Reflexología (45, $700), Aromaterapia (60, $850). Each line says "de muestra".
- Error: "Deja al menos un servicio activo."
- Edge: an unknown id in storage is ignored. Clearing every box blocks Continuar.

## hours

- Title: Los días de puerta abierta
- Lede: Marca los días en los que esta muestra puede enseñar una cita. El horario fino llega con el calendario.
- Primary: Continuar
- Kicker: Paso 4 de 7
- Checkboxes lunes through domingo. Default: martes, miércoles, jueves, viernes, sábado.
- Error: "Elige al menos un día."
- Edge: the real calendar module is owned by the other branch. This step only stores the days.

## channels

- Title: WhatsApp y teléfono
- Lede: WhatsApp sale por WAHA y la voz por Twilio, los dos a través de Marina. Las claves no se escriben en esta pantalla.
- Primary: Continuar
- Kicker: Paso 5 de 7
- WhatsApp checkbox, on by default: "WhatsApp por WAHA, a través de Marina". Optional field "Número de WhatsApp para mostrar".
- Calls checkbox, off by default: "Llamadas por Twilio, a través de Marina". Optional field "Teléfono del estudio para mostrar".
- You can continue with both numbers empty. Turning a channel off does not place a call or send WAHA.
- Errors: "El WhatsApp va en formato internacional, por ejemplo +52 55 0000 0000." and the same shape for the studio phone.
- Edge: `55 1234 5678` becomes `+525512345678` when you continue. `hola` does not. No API key, WAHA session, or Twilio token is collected here.

## payments

- Title: Cobro solo de prueba
- Lede: Stripe abre su propia página de pago. Aquí no se pide la tarjeta. Una llave live se rechaza.
- Primary: Continuar
- Kicker: Paso 6 de 7
- Copy on the screen: the charge button opens Stripe in test mode when an `sk_test_` key exists; returning from Stripe does not mean the payment is done; cancel leaves no charge, and a test payment that already landed is not undone.
- Checkbox, required: "Entiendo que esto no cobra de verdad."
- Error: "Confirma que este cobro es solo de prueba."
- Edge: there is no card field on this page.

## review

- Title: Revisa antes de activar
- Lede: Si algo no cuadra, vuelve atrás. Activar crea una cuenta de muestra en este navegador.
- Primary: Activar cuenta de muestra
- Kicker: Paso 7 de 7
- Table: Estudio, Responsable, Elemento, Letra, Servicios, Días, WhatsApp (WAHA), Llamadas (Twilio), Cobro ("Stripe, solo modo prueba").
- Edge: a step in the list opens only after every earlier step is valid. Activar moves to activating. It does not mark the account active yet. Refresh on activating returns here, so a half-played animation does not strand the account.

## activating

- Title: Abriendo el estudio
- Lede: Se deja lista la marca, la muestra de servicios y el aviso de que esto no es producción.
- Primary, when motion is reduced: Entrar al estudio
- When motion is allowed, that same control reads "Saltar animación" and the screen advances on its own after the beats.
- Beats, in order: Nombre de la casa, Servicios de muestra, Días abiertos, Canales con Marina, Cobro en modo prueba. Pending beats say "Pendiente." Ready beats say "Listo." The state is text, not only motion.
- Back returns to review and cancels the timer.
- Edge: `prefers-reduced-motion: reduce` shows every beat as Listo immediately, does not auto-advance, and keeps the orbs still. The class `elementos--still` does the same when the screen is forced still. The stylesheet sets `animation: none` under the media query.

## activated

- Title: El estudio está activo
- Lede: La cuenta de muestra ya puede enseñar un cobro de prueba y una pregunta a Marina. WhatsApp no se envía desde este botón.
- Primary: Probar cobro de muestra. The button adds the first selected service name, for example "Probar cobro de muestra: Masaje relajante".
- Second button: "Preguntarle a Marina, sin enviar WhatsApp". It posts `deliver: false`. It does not call WAHA.
- Note: "La respuesta, si llega, usa el webhook que Marina ya tiene. Esta página no cambia sus flujos ni manda WAHA por su cuenta."
- Account id shape: `4e-4elementos-202611120000` for studio "4 Elementos" at `2026-11-12T00:00:00.000Z`.
- "Empezar de nuevo" first changes to "Sí, borrar esta muestra". The second click clears storage and returns to landing. One click does not wipe the account.
- Edge: if the demo worker is not running, both actions say "No hay conexión con el demo. Arranca la vista previa y vuelve a intentar." A missing Stripe test key says the `sk_test_` key is missing and that nothing was charged. A live key is described as production and refused. Marina without a URL says the marina-chat webhook is missing.

## Payments outside the screens

Success and cancel are Worker pages, not steps in the flow.

- Before the signed webhook: "Estamos confirmando el pago de prueba". Reloading does not mark it paid.
- After `checkout.session.completed` with `payment_status=paid`: "Pago de prueba registrado".
- Cancel while pending: "El pago de prueba se canceló".
- Cancel after paid: "Este pedido ya estaba pagado en modo prueba". The status stays paid.
- A session id with markup is rejected and not printed.
- The Stripe success URL keeps the literal `{CHECKOUT_SESSION_ID}`. Encoding the braces would stop Stripe from filling them in.

## What this pass changed after walking the flow

- Focus no longer jumps to the title after a pointer click. Keyboard navigation still moves focus to the new title, and a failed step still moves focus to the alert.
- The primary action stays stuck to the bottom of the viewport so a long review does not hide Activar.
- Step chips that are not open yet are dimmed.
- The opening animation is not the only way out, and a refresh during it returns to review.
- Reset takes two clicks.
- Test-mode checkout refuses live keys, ignores unsigned webhooks, and will not treat the success URL as proof of payment.
- A 10-digit number is stored as Mexico `+52`, and a non-number is blocked with the field still editable.
