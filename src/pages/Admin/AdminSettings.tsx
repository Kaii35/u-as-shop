import { useEffect, useState } from 'react';
import { Boxes, Check, Megaphone, Store, Truck } from 'lucide-react';
import {
  ErrorState,
  FormError,
  PageHeader,
  Panel,
  Refreshing,
  Skeleton,
  money,
} from '../../components/admin/Primitives';
import { Button } from '../../components/ui/Button';
import { Checkbox, Input } from '../../components/ui/Input';
import { api } from '../../lib/api';
import { useAction, useResource } from '../../lib/useResource';
import { useAdminAuth } from '../../store/AdminAuth';
import type { Setting } from '../../lib/admin-types';
import SettingsTeam from './SettingsTeam';

/**
 * Ajustes.
 *
 * Son los parámetros que la dueña cambia sin llamar a nadie. Se agrupan como
 * los piensa ella —tienda, envíos, inventario, promociones— y se guardan en un
 * solo envío con lo que de verdad cambió: mandar la lista entera reescribiría
 * ajustes que nadie tocó y borraría lo que otra persona acabara de guardar.
 */

type SettingValue = Setting['value'];

const GROUP_ORDER: readonly string[] = ['tienda', 'envios', 'inventario', 'promociones'];

const GROUP_META: Record<
  string,
  { label: string; description: string; icon: typeof Store }
> = {
  tienda: {
    label: 'Tienda',
    description: 'Cómo se llama y dónde te escriben las clientas.',
    icon: Store,
  },
  envios: {
    label: 'Envíos',
    description: 'Cuánto cuesta llevar el pedido y desde cuánto sale gratis.',
    icon: Truck,
  },
  inventario: {
    label: 'Inventario',
    description: 'Cuándo avisa el panel de que hay que reponer.',
    icon: Boxes,
  },
  promociones: {
    label: 'Promociones',
    description: 'El interruptor general de los anuncios en la portada.',
    icon: Megaphone,
  },
};

/**
 * Qué ajustes son plata.
 *
 * La lista de claves cubre lo que hay hoy; el `help` con la palabra «pesos» es
 * la red por si mañana el servidor añade otro monto: más vale formatearlo de
 * más que mostrarle un «250000» crudo a quien cobra en pesos todos los días.
 */
const MONEY_KEYS = new Set(['shipping.fee', 'shipping.freeFrom']);
const isMoney = (setting: Setting): boolean =>
  controlType(setting) === 'number' &&
  (MONEY_KEYS.has(setting.key) || /pesos/i.test(setting.help ?? ''));

const controlType = (setting: Setting): 'number' | 'text' | 'boolean' =>
  setting.type ??
  (typeof setting.value === 'boolean'
    ? 'boolean'
    : typeof setting.value === 'number'
      ? 'number'
      : 'text');

/** Pesos enteros: ni decimales ni separadores. Los pone la vista, no la persona. */
const onlyDigits = (raw: string): number => {
  const digits = raw.replace(/\D/g, '');
  return digits === '' ? 0 : Number(digits);
};

/**
 * Campo de dinero.
 *
 * En reposo se lee «$250.000»; al entrar a escribir se queda el número pelado.
 * Obligar a teclear los puntos de miles sería pedirle a la dueña que formatee
 * a mano lo que el panel ya sabe formatear.
 */
function MoneyField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');

  return (
    <Input
      aria-label={label}
      inputMode="numeric"
      className="w-40"
      inputClassName="tnum text-right"
      value={editing ? raw : money(value)}
      onFocus={() => {
        setRaw(value === 0 ? '' : String(value));
        setEditing(true);
      }}
      onBlur={() => setEditing(false)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '');
        setRaw(digits);
        onChange(digits === '' ? 0 : Number(digits));
      }}
    />
  );
}

function SettingRow({
  setting,
  value,
  onChange,
}: {
  setting: Setting;
  value: SettingValue;
  onChange: (value: SettingValue) => void;
}) {
  const type = controlType(setting);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 last:border-0">
      <div className="min-w-[180px] flex-1">
        <label className="text-body font-medium text-ink">{setting.label}</label>
        {/* La clave técnica va de apoyo, en pequeño: sirve para cuadrar con el
            contrato cuando algo no coincide, no para leer todos los días. */}
        <p className="text-meta text-mist">{setting.key}</p>
        {setting.help && <p className="mt-1 max-w-prose text-cap text-ash">{setting.help}</p>}
      </div>

      <div className="shrink-0">
        {type === 'boolean' ? (
          <Checkbox checked={value === true} onChange={(checked) => onChange(checked)}>
            {value === true ? 'Activado' : 'Apagado'}
          </Checkbox>
        ) : type === 'number' ? (
          isMoney(setting) ? (
            <MoneyField
              label={setting.label}
              value={typeof value === 'number' ? value : 0}
              onChange={onChange}
            />
          ) : (
            <Input
              aria-label={setting.label}
              inputMode="numeric"
              className="w-28"
              inputClassName="tnum text-right"
              value={typeof value === 'number' ? String(value) : ''}
              onChange={(e) => onChange(onlyDigits(e.target.value))}
            />
          )
        ) : (
          <Input
            aria-label={setting.label}
            className="w-60"
            value={typeof value === 'string' ? value : String(value)}
            onChange={(e) => onChange(e.target.value)}
          />
        )}
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const { user } = useAdminAuth();

  const settings = useResource<Setting[]>(
    (signal) => api.get<Setting[]>('/api/admin/settings', undefined, signal),
    [],
  );

  // Copia local para poder reemplazarla con lo que devuelve el PUT sin tener
  // que volver a pedir la lista entera.
  const [items, setItems] = useState<Setting[]>([]);
  const [draft, setDraft] = useState<Record<string, SettingValue>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings.data) setItems(settings.data);
  }, [settings.data]);

  const save = useAction(async (patch: Record<string, SettingValue>) =>
    api.put<Setting[]>('/api/admin/settings', patch),
  );

  const valueOf = (setting: Setting): SettingValue =>
    setting.key in draft ? (draft[setting.key] as SettingValue) : setting.value;

  const changed = items.filter(
    (setting) => setting.key in draft && !Object.is(draft[setting.key], setting.value),
  );

  const edit = (key: string, value: SettingValue) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    // Solo lo que cambió: así dos personas pueden tocar ajustes distintos sin
    // pisarse, y un 400 nombra el ajuste que de verdad estaba mal.
    const patch: Record<string, SettingValue> = {};
    for (const setting of changed) patch[setting.key] = draft[setting.key] as SettingValue;

    const result = await save.run(patch);
    if (!result) return;
    setItems(result);
    setDraft({});
    setSaved(true);
    window.setTimeout(() => setSaved(false), 3000);
  };

  const groups = GROUP_ORDER.filter((group) => items.some((s) => s.group === group)).concat(
    // Un grupo que el servidor añada mañana no se queda sin pintar.
    [...new Set(items.map((s) => s.group))].filter((group) => !GROUP_ORDER.includes(group)),
  );

  return (
    <>
      <PageHeader
        title="Ajustes"
        subtitle="Los parámetros de la tienda. Lo que cambies aquí se aplica de inmediato."
      />

      {settings.first ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : settings.error ? (
        <ErrorState message={settings.error} onRetry={settings.reload} />
      ) : (
        <Refreshing active={settings.loading}>
          <div className="flex flex-col gap-4">
            {groups.map((group) => {
              const meta = GROUP_META[group];
              const Icon = meta?.icon ?? Store;
              return (
                <Panel
                  key={group}
                  title={meta?.label ?? group}
                  description={meta?.description}
                  bodyClassName="p-0"
                  actions={<Icon size={16} strokeWidth={2} className="text-mist" />}
                >
                  {items
                    .filter((setting) => setting.group === group)
                    .map((setting) => (
                      <SettingRow
                        key={setting.key}
                        setting={setting}
                        value={valueOf(setting)}
                        onChange={(value) => edit(setting.key, value)}
                      />
                    ))}
                </Panel>
              );
            })}
          </div>
        </Refreshing>
      )}

      {/* La barra solo aparece cuando hay algo que guardar, y se queda pegada
          abajo: en una lista larga el botón no puede estar fuera de la vista. */}
      {changed.length > 0 && (
        <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white p-3 shadow-pop">
          <div className="min-w-0">
            <p className="text-body font-medium text-ink">
              {changed.length === 1
                ? '1 ajuste sin guardar'
                : `${changed.length} ajustes sin guardar`}
            </p>
            <p className="truncate text-cap text-mist">
              {changed.map((setting) => setting.label).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FormError message={save.error} />
            <Button
              size="sm"
              variant="secondary"
              disabled={save.pending}
              onClick={() => {
                setDraft({});
                save.clearError();
              }}
            >
              Descartar
            </Button>
            <Button size="sm" loading={save.pending} onClick={() => void submit()}>
              Guardar cambios
            </Button>
          </div>
        </div>
      )}

      {saved && changed.length === 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-body text-ok">
          <Check size={15} strokeWidth={2.5} />
          Ajustes guardados. La tienda ya los está usando.
        </p>
      )}

      {/*
        Equipo solo para ADMIN. Esto es comodidad, no seguridad: sirve para no
        enseñar botones que van a responder 403. Quien de verdad protege estas
        rutas es la API con `requireAdmin` en cada una de ellas.
      */}
      {user?.role === 'ADMIN' && <SettingsTeam currentUserId={user.id} />}
    </>
  );
}
