import type { Issue, StepId } from './flow.ts'

export interface StepCopy {
  title: string
  lede: string
  primary: string
}

export const copy: {
  banner: string
  back: string
  skip: string
  reset: string
  resetConfirm: string
  steps: Record<StepId, StepCopy>
  issues: Record<Issue, string>
  pay: Record<string, string>
} = {
  banner: 'Muestra. No es producción y no usa el dominio del cliente.',
  back: 'Atrás',
  skip: 'Saltar animación',
  reset: 'Empezar de nuevo',
  resetConfirm: 'Sí, borrar esta muestra',
  steps: {
    landing: {
      title: 'Cuatro elementos, un estudio',
      lede: 'Tierra, agua, fuego y aire. Esta es la primera vez de 4 Elementos: de la puerta a una cuenta de muestra activa.',
      primary: 'Entrar al estudio',
    },
    welcome: {
      title: 'Lo que vamos a dejar listo',
      lede: 'El nombre de la casa, los servicios de muestra, los días y los canales. Nada se publica y no se escribe en Notion desde aquí.',
      primary: 'Seguir',
    },
    studio: {
      title: 'El nombre de la casa',
      lede: 'Así va a aparecer el estudio en esta muestra. La letra se puede cambiar; Rangel todavía no confirmó la suya.',
      primary: 'Continuar',
    },
    element: {
      title: 'El elemento que abre',
      lede: 'Elige uno. Es el tono de esta cuenta, no un diagnóstico.',
      primary: 'Continuar',
    },
    services: {
      title: 'Lo que ofreces ahora',
      lede: 'Los precios son de muestra. No son los de tu lista: esos siguen vacíos hasta que los confirmes.',
      primary: 'Continuar',
    },
    hours: {
      title: 'Los días de puerta abierta',
      lede: 'Marca los días en los que esta muestra puede enseñar una cita. El horario fino llega con el calendario.',
      primary: 'Continuar',
    },
    channels: {
      title: 'WhatsApp y teléfono',
      lede: 'WhatsApp sale por WAHA y la voz por Twilio, los dos a través de Marina. Las claves no se escriben en esta pantalla.',
      primary: 'Continuar',
    },
    payments: {
      title: 'Cobro solo de prueba',
      lede: 'Stripe abre su propia página de pago. Aquí no se pide la tarjeta. Una llave live se rechaza.',
      primary: 'Continuar',
    },
    review: {
      title: 'Revisa antes de activar',
      lede: 'Si algo no cuadra, vuelve atrás. Activar crea una cuenta de muestra en este navegador.',
      primary: 'Activar cuenta de muestra',
    },
    activating: {
      title: 'Abriendo el estudio',
      lede: 'Se deja lista la marca, la muestra de servicios y el aviso de que esto no es producción.',
      primary: 'Entrar al estudio',
    },
    activated: {
      title: 'El estudio está activo',
      lede: 'La cuenta de muestra ya puede enseñar un cobro de prueba y una pregunta a Marina. WhatsApp no se envía desde este botón.',
      primary: 'Probar cobro de muestra',
    },
  },
  issues: {
    studio_name: 'Escribe el nombre del estudio, con al menos 2 letras.',
    owner_name: 'Escribe tu nombre.',
    element: 'Elige un elemento para seguir.',
    services: 'Deja al menos un servicio activo.',
    days: 'Elige al menos un día.',
    whatsapp_number: 'El WhatsApp va en formato internacional, por ejemplo +52 55 0000 0000.',
    voice_number: 'El teléfono va en formato internacional, por ejemplo +52 55 0000 0000.',
    payments_ack: 'Confirma que este cobro es solo de prueba.',
  },
  pay: {
    stripe_key_missing: 'Falta la llave de prueba de Stripe (sk_test_…). No se cobró nada.',
    stripe_live_blocked: 'Esa llave es de producción. Este estudio solo acepta modo prueba.',
    stripe_key_invalid: 'La llave de Stripe no tiene forma de llave de prueba.',
    unknown_service: 'Ese servicio no está en la muestra.',
    stripe_rejected: 'Stripe no aceptó el cobro de prueba. No se cobró nada.',
    unsafe_checkout_url: 'La dirección de cobro no es de Stripe. No se abrió.',
    unauthorized: 'Este demo pide un token de acceso. No está en la página a propósito.',
    marina_not_configured: 'Marina no está conectada. Falta la URL de su webhook marina-chat.',
    marina_rejected: 'Marina no contestó. Sus flujos no se modificaron.',
    marina_voice_not_configured: 'Marina no publica un webhook de voz. La llamada no se hizo.',
    offline: 'No hay conexión con el demo. Arranca la vista previa y vuelve a intentar.',
  },
}

export const elementCopy: Record<'tierra' | 'agua' | 'fuego' | 'aire', { name: string; line: string }> = {
  tierra: { name: 'Tierra', line: 'Lo que sostiene. Trabajo firme, pies en el suelo.' },
  agua: { name: 'Agua', line: 'Lo que suelta. Ritmo lento, masaje que no empuja.' },
  fuego: { name: 'Fuego', line: 'Lo que calienta. Constancia, piedras, presencia.' },
  aire: { name: 'Aire', line: 'Lo que aligera. Aroma y un respiro más abierto.' },
}

export const dayCopy: Record<string, string> = {
  lun: 'Lunes',
  mar: 'Martes',
  mie: 'Miércoles',
  jue: 'Jueves',
  vie: 'Viernes',
  sab: 'Sábado',
  dom: 'Domingo',
}

export const activationBeats = [
  'Nombre de la casa',
  'Servicios de muestra',
  'Días abiertos',
  'Canales con Marina',
  'Cobro en modo prueba',
] as const
