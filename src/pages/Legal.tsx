import { Link, Navigate, useParams } from 'react-router-dom';
import { Mail, MapPin, MessageCircle } from 'lucide-react';
import { BUSINESS, LEGAL_PAGES, fullAddress, whatsappUrl, type LegalSlug } from '../data/business';
import { FREE_SHIPPING_FROM, cn, formatCOP } from '../lib/utils';

/**
 * Políticas de la tienda. Todo el texto vive aquí, con los datos del negocio
 * sacados de `data/business.ts` para que nunca queden dos versiones del NIT o
 * del correo.
 *
 * Texto base redactado con la Ley 1581 de 2012 (datos personales), su
 * Decreto 1377 de 2013 y la Ley 1480 de 2011 (Estatuto del Consumidor).
 * Conviene que un abogado lo revise antes de publicar la tienda.
 */

const UPDATED = '27 de octubre de 2026';

/** Un bloque es un párrafo (string) o una lista (string[]). */
type Block = string | string[];
interface Section { title: string; body: Block[] }
interface Policy { title: string; intro: string; sections: Section[] }

const who = `${BUSINESS.name}, identificada con NIT ${BUSINESS.nit}, con domicilio en ${fullAddress}`;
const contact = `el correo ${BUSINESS.email} o el WhatsApp ${BUSINESS.whatsapp}`;

const POLICIES: Record<LegalSlug, Policy> = {
  terminos: {
    title: 'Términos y condiciones',
    intro: `Estos términos regulan el uso de esta tienda en línea y las compras que hagas en ella. Al navegar o comprar aceptas lo que aquí se describe. La tienda es operada por ${who}.`,
    sections: [
      {
        title: '1. Uso del sitio',
        body: [
          'Puedes navegar libremente por el catálogo. Para comprar debes ser mayor de edad o contar con la autorización de tu representante legal.',
          'Te comprometes a entregar información verdadera y actualizada, y a no usar el sitio para fines ilegales o que afecten su funcionamiento.',
        ],
      },
      {
        title: '2. Productos, fotos y disponibilidad',
        body: [
          'Las fotos son de nuestros productos reales, pero el color puede verse un poco distinto según la pantalla y la luz. Las presentaciones y tonos pueden cambiar según el lote del fabricante.',
          'Un producto puede agotarse mientras navegas. Solo apartamos las unidades cuando inicias el pago; si no alcanza el inventario, te lo avisamos antes de cobrar.',
          'Los productos marcados como "Precio por confirmar" aún no están a la venta.',
        ],
      },
      {
        title: '3. Precios',
        body: [
          'Todos los precios están en pesos colombianos (COP) e incluyen IVA cuando aplica. El costo del envío se muestra por separado antes de pagar.',
          'Los precios y promociones pueden cambiar sin aviso, pero el precio que respetamos es el que aparece en tu pedido al momento de pagarlo. Si por un error evidente un precio se publica muy por debajo de su valor real, te contactaremos para confirmar o anular el pedido y devolver tu dinero.',
        ],
      },
      {
        title: '4. Proceso de compra y pagos',
        body: [
          'Agregas productos al carrito, ingresas tus datos de contacto y entrega, eliges el envío y pagas en la pasarela segura de Wompi (Bancolombia). Allí puedes usar tarjeta débito o crédito, PSE, Nequi y otros medios que la pasarela habilite.',
          'Nosotros no vemos ni guardamos los datos de tu tarjeta o de tu cuenta bancaria: los procesa directamente la pasarela de pagos.',
          'El pedido queda confirmado cuando la pasarela aprueba el pago. Te avisaremos por correo o WhatsApp.',
        ],
      },
      {
        title: '5. Cupones y promociones',
        body: [
          'Cada cupón o promoción tiene sus propias condiciones (vigencia, monto mínimo, productos incluidos) y no es acumulable con otros salvo que se diga lo contrario. No son canjeables por dinero.',
        ],
      },
      {
        title: '6. Derecho de retracto',
        body: [
          'Por ser una compra a distancia, tienes derecho a retractarte dentro de los cinco (5) días hábiles siguientes a la entrega del producto (artículo 47 de la Ley 1480 de 2011). Debes devolver el producto en las mismas condiciones en que lo recibiste, sin uso y en su empaque original. Los costos de transporte de la devolución corren por tu cuenta, y te devolvemos el dinero en un plazo máximo de treinta (30) días calendario.',
          'Según la misma ley, el retracto no aplica, entre otros casos, a bienes de uso personal. Por higiene, esto incluye los productos cosméticos, de manicura y de pestañas que hayan sido abiertos o usados.',
        ],
      },
      {
        title: '7. Reversión del pago',
        body: [
          'Si pagaste con tarjeta u otro medio electrónico, puedes pedir la reversión del pago (artículo 51 de la Ley 1480 de 2011) cuando hayas sido víctima de fraude, la operación no haya sido solicitada, no recibas el producto, o el producto no corresponda a lo pedido o tenga defectos. Debes presentar la queja ante nosotros y ante el emisor del medio de pago dentro de los cinco (5) días hábiles siguientes a la fecha en que conociste el hecho o recibiste el producto, y devolver el producto si lo recibiste.',
        ],
      },
      {
        title: '8. Envíos, cambios y garantías',
        body: [
          'Los tiempos y condiciones de entrega están en la política de Envíos y entregas. Los cambios y garantías, en la política de Cambios, devoluciones y garantías. Ambas hacen parte de estos términos.',
        ],
      },
      {
        title: '9. Propiedad intelectual',
        body: [
          'El diseño del sitio, los textos y las fotos son de Natalia Sánchez o se usan con autorización. Las marcas de los productos (Masglo, Ópalo, Cristal Style, ILÚ, entre otras) pertenecen a sus respectivos titulares; las mostramos solo para identificar lo que vendemos.',
        ],
      },
      {
        title: '10. Ley aplicable y quejas',
        body: [
          `Estos términos se rigen por las leyes de Colombia. Si tienes una queja, escríbenos primero a ${contact} y te responderemos dentro de los quince (15) días hábiles siguientes. También puedes acudir a la Superintendencia de Industria y Comercio (www.sic.gov.co).`,
        ],
      },
    ],
  },

  privacidad: {
    title: 'Política de privacidad y tratamiento de datos personales',
    intro: `En cumplimiento de la Ley 1581 de 2012 y el Decreto 1377 de 2013, ${who}, es responsable del tratamiento de los datos personales que recibe a través de esta tienda, de su WhatsApp y de su local físico.`,
    sections: [
      {
        title: '1. Responsable del tratamiento',
        body: [[
          `Nombre: ${BUSINESS.name}`,
          `NIT: ${BUSINESS.nit}`,
          `Dirección: ${fullAddress}`,
          `Correo: ${BUSINESS.email}`,
          `WhatsApp: ${BUSINESS.whatsapp}`,
        ]],
      },
      {
        title: '2. Qué datos recolectamos',
        body: [
          [
            'Datos de identificación y contacto: nombre, tipo y número de documento, correo electrónico y teléfono.',
            'Datos de entrega: dirección, ciudad, departamento y notas para el mensajero.',
            'Datos de tus compras: productos, valores, estado de los pedidos y comunicaciones con nosotros.',
            'Datos técnicos mínimos que tu navegador guarda para que la tienda funcione (ver la Política de cookies).',
          ],
          'No recolectamos datos sensibles (salud, origen, creencias, biométricos). No guardamos los datos de tu tarjeta ni de tu cuenta bancaria: los procesa directamente la pasarela de pagos.',
        ],
      },
      {
        title: '3. Para qué usamos tus datos',
        body: [[
          'Procesar, cobrar, facturar y entregar tus pedidos.',
          'Comunicarnos contigo sobre el estado de tu compra, cambios, garantías y servicio al cliente.',
          'Crear y administrar tu cuenta, si decides registrarte.',
          'Enviarte novedades, promociones y lanzamientos, solo si nos autorizas. Puedes pedir que dejemos de enviarlos cuando quieras.',
          'Cumplir obligaciones legales, contables y tributarias, y atender requerimientos de autoridades.',
          'Prevenir fraudes y proteger la seguridad de la tienda.',
        ]],
      },
      {
        title: '4. Con quién compartimos tus datos',
        body: [
          'Solo compartimos lo necesario para cumplir las finalidades anteriores, con proveedores que deben proteger tus datos:',
          [
            'La pasarela de pagos Wompi (Bancolombia), para procesar tu pago.',
            'Empresas de mensajería y transporte, para entregar tu pedido.',
            'Proveedores de alojamiento web, correo y herramientas tecnológicas que sostienen la tienda.',
            'Autoridades, cuando la ley lo exija.',
          ],
          'No vendemos ni alquilamos tus datos personales.',
        ],
      },
      {
        title: '5. Tus derechos',
        body: [
          'Como titular de tus datos tienes derecho a:',
          [
            'Conocer, actualizar y rectificar tus datos.',
            'Pedir prueba de la autorización que nos diste.',
            'Saber cómo hemos usado tus datos.',
            'Revocar la autorización o pedir que eliminemos tus datos, cuando no exista un deber legal o contractual de conservarlos.',
            'Acceder gratis a tus datos.',
            'Presentar quejas ante la Superintendencia de Industria y Comercio, después de haber hecho tu consulta o reclamo ante nosotros.',
          ],
        ],
      },
      {
        title: '6. Cómo ejercer tus derechos',
        body: [
          `Escríbenos a ${contact} indicando tu nombre, documento, lo que solicitas y un dato de contacto para responderte.`,
          [
            'Consultas: respondemos en un máximo de diez (10) días hábiles, prorrogables por cinco (5) días hábiles más avisándote el motivo.',
            'Reclamos (corrección, actualización, supresión o revocatoria): respondemos en un máximo de quince (15) días hábiles, prorrogables por ocho (8) días hábiles más avisándote el motivo.',
          ],
        ],
      },
      {
        title: '7. Autorización',
        body: [
          'Al marcar la casilla de aceptación en el registro o en el pago, al escribirnos o al comprar en el local, nos autorizas a tratar tus datos según esta política. Los menores de edad solo pueden entregarnos datos con autorización de su representante legal.',
        ],
      },
      {
        title: '8. Seguridad y conservación',
        body: [
          'Usamos conexiones cifradas, acceso restringido al panel de la tienda y proveedores con medidas de seguridad reconocidas. Conservamos tus datos mientras tengas una relación con nosotros y durante el tiempo que exijan las normas contables y tributarias.',
        ],
      },
      {
        title: '9. Vigencia y cambios',
        body: [
          `Esta política rige desde el ${UPDATED}. Si la cambiamos de forma importante, lo publicaremos en esta página antes de aplicar el cambio.`,
        ],
      },
    ],
  },

  cookies: {
    title: 'Política de cookies',
    intro: 'Las cookies y el almacenamiento local son pequeños archivos que el sitio guarda en tu navegador. Aquí te contamos cuáles usamos y para qué.',
    sections: [
      {
        title: '1. Las que usamos',
        body: [
          'Solo usamos almacenamiento necesario para que la tienda funcione. Se guarda en tu propio navegador y no lo usamos para perfilarte ni para publicidad:',
          [
            'Carrito de compras: los productos que agregaste, para no perderlos si cierras la página.',
            'Favoritos: los productos que guardaste con el corazón.',
            'Sesión: para que no tengas que ingresar en cada visita.',
            'Preferencias: el tema claro u oscuro, tus búsquedas recientes y si ya cerraste un anuncio.',
          ],
        ],
      },
      {
        title: '2. Servicios de terceros',
        body: [[
          'Google Fonts: nos entrega las tipografías del sitio. Al cargarlas, Google recibe datos técnicos como tu dirección IP.',
          'Wompi (Bancolombia): cuando vas a pagar te lleva a su pasarela, que usa sus propias cookies de seguridad y prevención de fraude.',
        ]],
      },
      {
        title: '3. Lo que no usamos',
        body: [
          'Hoy no usamos cookies de publicidad ni de seguimiento entre sitios. Si en el futuro agregamos herramientas de analítica o publicidad, actualizaremos esta política y te pediremos autorización cuando corresponda.',
        ],
      },
      {
        title: '4. Cómo borrarlas',
        body: [
          'Puedes borrar o bloquear las cookies y el almacenamiento local desde la configuración de tu navegador (Chrome, Safari, Firefox, Edge). Si lo haces, se vaciarán tu carrito y tus favoritos, y tendrás que volver a ingresar.',
        ],
      },
    ],
  },

  envios: {
    title: 'Envíos y entregas',
    intro: 'Enviamos a todo Colombia desde nuestro local en Caldas, Antioquia.',
    sections: [
      {
        title: '1. Tiempos',
        body: [[
          'Despachamos dentro de las 24 horas hábiles siguientes a la confirmación del pago.',
          'Envío estándar: de 3 a 5 días hábiles, según la ciudad.',
          'Envío express: de 24 a 48 horas en ciudades principales.',
          'Zonas rurales o de difícil acceso pueden tardar un poco más; te avisamos si es tu caso.',
        ]],
      },
      {
        title: '2. Costo',
        body: [
          `El valor del envío se calcula y se muestra en el pago, antes de que confirmes. El envío estándar es gratis en compras desde ${formatCOP(FREE_SHIPPING_FROM)}, salvo que una promoción diga otra cosa.`,
        ],
      },
      {
        title: '3. Recoger en el local',
        body: [
          `Puedes elegir recoger tu pedido sin costo en ${BUSINESS.address}, ${BUSINESS.mall}, ${BUSINESS.city}. Horario: ${BUSINESS.hours.toLowerCase()}. Espera nuestro mensaje de "pedido listo" antes de venir y trae tu documento.`,
        ],
      },
      {
        title: '4. Al recibir',
        body: [
          'Revisa el paquete frente al mensajero. Si llega abierto, golpeado o mojado, déjalo anotado en la guía y escríbenos ese mismo día con fotos.',
          'Si nadie recibe el pedido en la dirección indicada, la transportadora hará otro intento o lo devolverá. El reenvío por datos de dirección incorrectos puede tener un costo adicional.',
        ],
      },
    ],
  },

  cambios: {
    title: 'Cambios, devoluciones y garantías',
    intro: 'Queremos que quedes feliz con tu compra. Si algo no salió bien, esto es lo que puedes hacer.',
    sections: [
      {
        title: '1. Cambios',
        body: [
          'Puedes cambiar un producto dentro de los 30 días siguientes a la entrega si está sin abrir, sin usar y en su empaque original, presentando tu número de pedido o factura.',
          'Por higiene, no aceptamos cambios de productos cosméticos, de manicura, de pestañas o de uso personal que hayan sido abiertos o usados, salvo que tengan un defecto.',
        ],
      },
      {
        title: '2. Garantía',
        body: [
          'Todos nuestros productos tienen la garantía legal que exige la Ley 1480 de 2011: deben servir para lo que fueron hechos y cumplir lo que anunciamos.',
          [
            'Equipos eléctricos (lámparas, ventiladores y similares): 12 meses por defectos de fabricación.',
            'Demás productos: el término que indique el fabricante o, si no lo indica, el que establece la ley.',
          ],
          'La garantía no cubre daños por mal uso, golpes, humedad, uso de voltaje equivocado, desgaste normal o reparaciones hechas por terceros.',
        ],
      },
      {
        title: '3. Cómo solicitarlo',
        body: [[
          `Escríbenos a ${contact} con tu número de pedido, una descripción del problema y fotos o video.`,
          'Te respondemos en máximo 15 días hábiles con la solución: reparación, cambio por el mismo producto o, si no es posible, devolución del dinero.',
          'Si el problema es un defecto o un error nuestro, nosotros asumimos el costo del envío.',
        ]],
      },
      {
        title: '4. Devolución del dinero',
        body: [
          'Cuando corresponda, devolvemos el dinero por el mismo medio con el que pagaste o por transferencia a una cuenta a tu nombre, en un plazo máximo de 30 días calendario. Si pagaste con tarjeta, el reflejo en tu extracto depende de tu banco.',
          'Para el derecho de retracto y la reversión del pago, revisa los Términos y condiciones.',
        ],
      },
    ],
  },
};

function BlockView({ block }: { block: Block }) {
  if (Array.isArray(block)) {
    return (
      <ul className="flex list-disc flex-col gap-1.5 pl-5 marker:text-clay">
        {block.map((item) => <li key={item}>{item}</li>)}
      </ul>
    );
  }
  return <p>{block}</p>;
}

export default function Legal() {
  const { slug } = useParams();
  const policy = POLICIES[slug as LegalSlug];
  if (!policy) return <Navigate to="/legal/terminos" replace />;

  return (
    <div className="container-x pb-[clamp(64px,7vw,110px)] pt-[clamp(24px,3vw,48px)]">
      <header className="mb-[clamp(24px,3vw,40px)] flex flex-col gap-3 border-b border-line pb-[clamp(24px,3vw,36px)]">
        <span className="kicker">Información legal</span>
        <h1 className="display text-h3 text-balance">{policy.title}</h1>
        <span className="text-cap text-mist">Última actualización: {UPDATED}</span>
      </header>

      <div className="flex flex-wrap items-start gap-[clamp(32px,5vw,72px)]">
        <nav aria-label="Políticas" className="flex flex-[1_1_220px] flex-col gap-1 lg:sticky lg:top-[150px] lg:max-w-[260px]">
          {LEGAL_PAGES.map((p) => (
            <Link
              key={p.slug}
              to={`/legal/${p.slug}`}
              aria-current={p.slug === slug ? 'page' : undefined}
              className={cn(
                'rounded px-3 py-2 text-body transition-colors',
                p.slug === slug ? 'bg-sand font-medium text-ink' : 'text-ash hover:bg-sand hover:text-ink',
              )}
            >
              {p.label}
            </Link>
          ))}
        </nav>

        <article className="flex min-w-0 max-w-[720px] flex-[3_1_480px] flex-col gap-8 text-body leading-relaxed text-ash">
          <p className="text-lead text-ink">{policy.intro}</p>
          {policy.sections.map((s) => (
            <section key={s.title} className="flex flex-col gap-3">
              <h2 className="display text-h5 text-ink">{s.title}</h2>
              {s.body.map((b, i) => <BlockView key={i} block={b} />)}
            </section>
          ))}

          <aside className="flex flex-col gap-3 rounded border border-line bg-surface p-5">
            <h2 className="display text-h5 text-ink">¿Dudas? Escríbenos</h2>
            <a href={whatsappUrl()} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 hover:text-clay">
              <MessageCircle size={16} strokeWidth={1.75} /> WhatsApp {BUSINESS.whatsapp}
            </a>
            <a href={`mailto:${BUSINESS.email}`} className="flex items-center gap-2.5 hover:text-clay">
              <Mail size={16} strokeWidth={1.75} /> {BUSINESS.email}
            </a>
            <span className="flex items-start gap-2.5">
              <MapPin size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" /> {fullAddress}
            </span>
            <span className="text-cap text-mist">{BUSINESS.name} · NIT {BUSINESS.nit}</span>
          </aside>
        </article>
      </div>
    </div>
  );
}
