import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, ArrowRight, Ban, Check, Clock, HelpCircle, Loader2, RefreshCw, TimerOff, X } from 'lucide-react';
import { cn, formatCOP } from '../lib/utils';
import { getPaymentStatus, readPaymentReference, type PaymentStatusResponse, type PublicPaymentStatus } from '../lib/payments';
import { useStore } from '../store/StoreContext';
import { Button } from '../components/ui/Button';

/**
 * Espera creciente entre consultas, en milisegundos. El último valor se repite.
 *
 * Un intervalo fijo y eterno castiga al servidor —y a la pasarela detrás— sin
 * necesidad: la mayoría de tarjetas resuelven en los primeros segundos, y lo
 * que tarda de verdad (PSE, transferencias) no va a llegar antes por
 * preguntarlo más veces.
 */
const DELAYS = [2_000, 3_000, 5_000, 8_000, 13_000, 21_000, 30_000];

/** Dos minutos sondeando. Pasado eso, decide la clienta con un botón. */
const POLL_BUDGET = 120_000;

interface Look {
  title: string;
  /** Segunda línea propia, cuando el mensaje del servidor no basta. */
  extra?: string;
  icon: typeof Check;
  circle: string;
  accent: string;
}

const LOOKS: Record<PublicPaymentStatus, Look> = {
  APPROVED: {
    title: 'Tu pago fue aprobado',
    extra: 'Ya estamos preparando tu pedido.',
    icon: Check,
    circle: 'bg-ok text-white',
    accent: 'text-ok',
  },
  PENDING: {
    title: 'Estamos confirmando tu pago',
    extra: 'Con PSE y transferencias es normal que tarde unos minutos. Apenas el banco responda el pedido se confirma solo en cuanto responda; puedes cerrar esta página.',
    icon: Clock,
    circle: 'bg-sand text-clay',
    accent: 'text-clay',
  },
  DECLINED: {
    title: 'Tu pago fue rechazado',
    extra: 'No se te cobró nada y tu carrito sigue como lo dejaste.',
    icon: X,
    circle: 'bg-sand text-danger',
    accent: 'text-danger',
  },
  VOIDED: {
    title: 'El pago se anuló',
    extra: 'Tu carrito sigue como lo dejaste, por si quieres intentarlo otra vez.',
    icon: Ban,
    circle: 'bg-sand text-ash',
    accent: 'text-ash',
  },
  ERROR: {
    title: 'No pudimos procesar tu pago',
    extra: 'Si ves un cobro en tu banco, escríbenos con el número de referencia y lo revisamos.',
    icon: AlertTriangle,
    circle: 'bg-sand text-danger',
    accent: 'text-danger',
  },
  EXPIRED: {
    title: 'Se venció el tiempo para pagar',
    extra: 'Liberamos los productos que teníamos apartados. Puedes volver a intentarlo desde tu carrito.',
    icon: TimerOff,
    circle: 'bg-sand text-ash',
    accent: 'text-ash',
  },
};

export default function PaymentResult() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useStore();

  // `id` lo añade Wompi a la URL de retorno; `ref` lo añade el checkout
  // simulado. Si no viene ninguno, queda la referencia que guardamos antes de
  // salir hacia la pasarela.
  const transactionId = params.get('id');
  const reference = params.get('ref') ?? params.get('reference') ?? readPaymentReference();

  const [payment, setPayment] = useState<PaymentStatusResponse | null>(null);
  const [polling, setPolling] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  /** Cambia al pulsar "Volver a consultar" y reinicia el sondeo. */
  const [round, setRound] = useState(0);

  useEffect(() => {
    if (!reference) {
      setPolling(false);
      return;
    }
    const controller = new AbortController();
    const startedAt = Date.now();
    let timer = 0;
    let attempt = 0;
    let cancelled = false;

    const tick = async (): Promise<void> => {
      try {
        const next = await getPaymentStatus(reference, transactionId, controller.signal);
        if (cancelled) return;
        setPayment(next);
        setFailure(null);
        if (next.status !== 'PENDING' || Date.now() - startedAt >= POLL_BUDGET) {
          setPolling(false);
          return;
        }
        timer = window.setTimeout(() => void tick(), DELAYS[Math.min(attempt++, DELAYS.length - 1)]);
      } catch (error) {
        if (cancelled || (error as Error)?.name === 'AbortError') return;
        setFailure((error as Error)?.message ?? 'No pudimos consultar tu pago.');
        setPolling(false);
      }
    };

    setPolling(true);
    void tick();

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [reference, transactionId, round]);

  /**
   * El carrito se vacía aquí y solo aquí: cuando consta que el pago se
   * aprobó. El `ref` evita repetirlo si el sondeo vuelve a pasar por APPROVED.
   */
  const emptied = useRef(false);
  useEffect(() => {
    if (payment?.status === 'APPROVED' && !emptied.current) {
      emptied.current = true;
      clearCart();
    }
  }, [payment?.status, clearCart]);

  const recheck = useCallback(() => setRound((r) => r + 1), []);

  // Sin referencia no hay nada que consultar. Mejor decirlo que dejar una
  // pantalla en blanco girando para siempre.
  if (!reference) {
    return (
      <Shell circle="bg-sand text-ash" icon={HelpCircle} title="No encontramos tu pago">
        <p className="max-w-[520px] text-lead leading-relaxed text-ash">
          Puede que hayas abierto esta página en otro navegador o después de cerrar la pestaña.
          Si tu pago se completó, el pedido aparece en tu cuenta.
        </p>
        <Actions>
          <Button onClick={() => navigate('/cuenta')}>Ver mis pedidos</Button>
          <Button variant="secondary" onClick={() => navigate('/tienda')}>Volver a la tienda</Button>
        </Actions>
      </Shell>
    );
  }

  if (!payment && polling) {
    return (
      <Shell circle="bg-sand text-clay" icon={Loader2} spin title="Consultando tu pago">
        <p className="text-lead text-ash">Un momento, estamos hablando con el banco.</p>
      </Shell>
    );
  }

  if (!payment) {
    return (
      <Shell circle="bg-sand text-danger" icon={AlertTriangle} title="No pudimos consultar tu pago">
        <p className="max-w-[520px] text-lead leading-relaxed text-ash">
          {failure ?? 'No obtuvimos respuesta del servidor.'} Tu pago puede haberse completado igual: vuelve a consultar en un momento.
        </p>
        <Reference value={reference} />
        <Actions>
          <Button onClick={recheck}><RefreshCw size={16} strokeWidth={1.5} /> Volver a consultar</Button>
          <Button variant="secondary" onClick={() => navigate('/tienda')}>Volver a la tienda</Button>
        </Actions>
      </Shell>
    );
  }

  const look = LOOKS[payment.status];
  const pendingStalled = payment.status === 'PENDING' && !polling;

  return (
    <Shell circle={look.circle} icon={look.icon} title={look.title} accent={look.accent} orderNumber={payment.orderNumber}>
      <p className="max-w-[520px] text-lead leading-relaxed text-ash">{payment.message}</p>
      {look.extra && <p className="max-w-[520px] text-body leading-relaxed text-mist">{look.extra}</p>}

      {payment.status === 'APPROVED' && (
        <dl className="mt-2 flex w-full max-w-[420px] flex-col gap-2 rounded-lg border border-line bg-white p-5 text-left">
          <Row label="Pedido" value={payment.orderNumber} />
          <Row label="Total pagado" value={formatCOP(payment.amount)} strong />
          {payment.methodType && <Row label="Medio de pago" value={methodLabel(payment.methodType)} />}
        </dl>
      )}

      {payment.status === 'PENDING' && (
        <p className="flex items-center gap-2 text-cap text-mist">
          {polling ? (
            <><Loader2 size={15} className="animate-spin" /> Seguimos consultando…</>
          ) : (
            <>Dejamos de consultar para no recargar el sistema. Puedes volver a intentarlo.</>
          )}
        </p>
      )}

      <Reference value={payment.reference} />

      <Actions>
        {payment.status === 'APPROVED' && (
          <>
            <Button onClick={() => navigate('/cuenta')}>Ver mi pedido <ArrowRight size={16} strokeWidth={1.5} /></Button>
            <Button variant="secondary" onClick={() => navigate('/tienda')}>Seguir comprando</Button>
          </>
        )}
        {(payment.status === 'DECLINED' || payment.status === 'ERROR' || payment.status === 'VOIDED' || payment.status === 'EXPIRED') && (
          <>
            <Button onClick={() => navigate('/checkout')}>Intentar de nuevo</Button>
            <Button variant="secondary" onClick={() => navigate('/tienda')}>Volver a la tienda</Button>
          </>
        )}
        {payment.status === 'PENDING' && (
          <>
            {pendingStalled && <Button onClick={recheck}><RefreshCw size={16} strokeWidth={1.5} /> Volver a consultar</Button>}
            <Button variant="secondary" onClick={() => navigate('/cuenta')}>Ver mis pedidos</Button>
            <Button variant="ghost" onClick={() => navigate('/tienda')}>Seguir comprando</Button>
          </>
        )}
      </Actions>

      {failure && (
        <p role="alert" className="flex items-center gap-2 text-cap text-danger">
          <AlertTriangle size={14} strokeWidth={1.8} /> {failure}
        </p>
      )}

      <p className="text-cap text-mist">
        ¿Algo no cuadra? <Link to="/cuenta" className="link-quiet">Escríbenos desde tu cuenta</Link> con este número de referencia.
      </p>
    </Shell>
  );
}

/** Marco común: un solo mensaje, centrado, legible desde 360 px. */
function Shell({ circle, icon: Icon, spin, title, accent, orderNumber, children }: {
  circle: string;
  icon: typeof Check;
  spin?: boolean;
  title: string;
  accent?: string;
  orderNumber?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      className="container-x flex flex-col items-center gap-4 py-[clamp(40px,8vw,120px)] text-center"
    >
      <span className={cn('flex h-[92px] w-[92px] items-center justify-center rounded-full', circle)}>
        <Icon size={30} strokeWidth={1.2} className={spin ? 'animate-spin' : undefined} />
      </span>
      {orderNumber && (
        <span className={cn('text-meta font-medium uppercase tracking-[.24em]', accent ?? 'text-clay')}>Pedido {orderNumber}</span>
      )}
      <h1 className="display text-h3">{title}</h1>
      {children}
    </motion.div>
  );
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex flex-wrap justify-center gap-2.5">{children}</div>;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="row-kv">
      <dt className="text-mist">{label}</dt>
      <dd className={cn('tnum text-ink', strong && 'font-semibold')}>{value}</dd>
    </div>
  );
}

function Reference({ value }: { value: string }) {
  return <p className="tnum text-cap text-mist">Referencia {value}</p>;
}

/** Nombres de los medios tal como los llama la gente, no como los llama la API. */
function methodLabel(methodType: string): string {
  const names: Record<string, string> = {
    CARD: 'Tarjeta',
    NEQUI: 'Nequi',
    PSE: 'PSE',
    BANCOLOMBIA_TRANSFER: 'Bancolombia',
    BANCOLOMBIA_COLLECT: 'Bancolombia',
    DAVIPLATA: 'Daviplata',
    PCOL: 'Corresponsal bancario',
    BNPL: 'Paga después',
  };
  return names[methodType] ?? 'Pasarela de pagos';
}
