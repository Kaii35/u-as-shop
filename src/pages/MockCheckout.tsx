import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Ban, Check, Clock, FlaskConical } from 'lucide-react';
import { cn, formatCOP } from '../lib/utils';
import { resolveMockPayment, type MockOutcome } from '../lib/payments';
import { Button } from '../components/ui/Button';

/**
 * Checkout simulado: la pantalla que hace de banco cuando
 * `PAYMENT_PROVIDER=mock`, que es el modo por defecto y el único con el que
 * esto se puede probar sin una cuenta de Wompi aprobada.
 *
 * Recorre el mismo camino que la pasarela real —volver con la referencia, que
 * la pantalla de retorno consulte el estado—; lo único falso es quién decide
 * el desenlace. Por eso la pantalla grita que es una simulación: confundirla
 * con un cobro real sería el peor malentendido posible de toda la tienda.
 */

const OUTCOMES: Array<{ id: MockOutcome; label: string; desc: string; icon: typeof Check; tone: string }> = [
  { id: 'APPROVED', label: 'Aprobar el pago', desc: 'El pedido queda pagado y se descuenta el inventario.', icon: Check, tone: 'text-ok' },
  { id: 'DECLINED', label: 'Rechazar', desc: 'Como cuando el banco niega la transacción.', icon: Ban, tone: 'text-danger' },
  { id: 'PENDING', label: 'Dejar pendiente', desc: 'Como una transferencia o un PSE que todavía no responde.', icon: Clock, tone: 'text-clay' },
];

export default function MockCheckout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const reference = params.get('ref') ?? '';
  // El monto llega en centavos, igual que se lo pasamos a la pasarela real.
  const cents = Number(params.get('monto'));
  const amount = Number.isFinite(cents) && cents > 0 ? cents / 100 : null;
  const back = params.get('volver') || '/pago/respuesta';

  const [working, setWorking] = useState<MockOutcome | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const choose = async (outcome: MockOutcome) => {
    setFailure(null);
    setWorking(outcome);
    try {
      await resolveMockPayment(reference, outcome);
      // Se vuelve con la referencia en la URL: la pantalla de retorno no
      // depende de que el navegador haya conservado el sessionStorage.
      const target = new URL(back, window.location.origin);
      target.searchParams.set('ref', reference);
      if (target.origin === window.location.origin) navigate(target.pathname + target.search, { replace: true });
      else window.location.assign(target.toString());
    } catch (error) {
      setWorking(null);
      setFailure((error as Error)?.message ?? 'No pudimos registrar el resultado simulado.');
    }
  };

  return (
    <div className="container-x mx-auto flex max-w-[560px] flex-col gap-5 py-[clamp(32px,6vw,72px)]">
      <div className="flex items-start gap-3 rounded-lg border border-clay/40 bg-clay-soft p-4">
        <FlaskConical size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-clay-dark" />
        <div className="flex flex-col gap-1">
          <span className="text-body font-semibold text-clay-dark">Esto es una simulación de pago</span>
          <span className="text-cap leading-relaxed text-ash">
            No se está cobrando nada, no hay banco al otro lado y no se mueve dinero.
            Esta pantalla existe para probar la tienda mientras la pasarela real no está activa.
          </span>
        </div>
      </div>

      <div className="card flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <span className="label-xs">Monto de la prueba</span>
          <span className="tnum display text-h3">{amount === null ? 'Sin monto' : formatCOP(amount)}</span>
          <span className="tnum text-cap text-mist">Referencia {reference || 'no recibida'}</span>
        </div>

        {reference ? (
          <>
            <span className="text-body text-ash">Elige qué debería responder el banco:</span>
            <div className="flex flex-col gap-2.5">
              {OUTCOMES.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  disabled={working !== null}
                  onClick={() => void choose(o.id)}
                  className={cn(
                    'flex items-center gap-3.5 rounded-lg border border-line p-4 text-left transition-colors',
                    'hover:border-ink/40 disabled:cursor-not-allowed disabled:opacity-45',
                    working === o.id && 'border-clay',
                  )}
                >
                  <o.icon size={18} strokeWidth={1.8} className={cn('shrink-0', o.tone)} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-body font-medium">{o.label}</span>
                    <span className="text-cap text-mist">{o.desc}</span>
                  </span>
                </button>
              ))}
            </div>
            {working && <span className="text-cap text-mist">Registrando el resultado…</span>}
          </>
        ) : (
          <p className="text-body leading-relaxed text-ash">
            Esta pantalla necesita la referencia del cobro en la dirección. Vuelve al checkout y confirma el pedido otra vez.
          </p>
        )}

        {failure && (
          <p role="alert" className="flex items-start gap-2 text-cap text-danger">
            <AlertTriangle size={14} strokeWidth={1.8} className="mt-0.5 shrink-0" /> {failure}
          </p>
        )}

        <Button variant="ghost" className="self-start px-0" onClick={() => navigate('/checkout')}>Volver al checkout</Button>
      </div>
    </div>
  );
}
