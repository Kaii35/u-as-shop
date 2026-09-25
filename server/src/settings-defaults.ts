/**
 * Parámetros que la dueña cambia desde el panel sin tocar código.
 *
 * Esta lista es la única fuente: el seed la siembra y `PUT /settings` solo
 * acepta claves que estén aquí. Así un error de tecleo responde 400 en vez de
 * crear en silencio un ajuste que ninguna parte del código lee nunca.
 */
export interface SettingDefinition {
  readonly key: string;
  readonly label: string;
  readonly group: 'tienda' | 'envios' | 'inventario' | 'promociones';
  readonly type: 'number' | 'text' | 'boolean';
  readonly value: number | string | boolean;
  readonly help?: string;
}

export const SETTING_DEFAULTS: readonly SettingDefinition[] = [
  {
    key: 'store.name',
    label: 'Nombre de la tienda',
    group: 'tienda',
    type: 'text',
    value: 'Aurelle',
  },
  {
    key: 'store.email',
    label: 'Correo de contacto',
    group: 'tienda',
    type: 'text',
    value: 'hola@aurelle.co',
  },
  {
    key: 'store.phone',
    label: 'WhatsApp de pedidos',
    group: 'tienda',
    type: 'text',
    value: '+57 300 000 0000',
  },
  {
    key: 'shipping.fee',
    label: 'Costo del envío',
    group: 'envios',
    type: 'number',
    value: 14900,
    help: 'En pesos. Es lo que se le cobra a la clienta cuando no alcanza el envío gratis.',
  },
  {
    key: 'shipping.freeFrom',
    label: 'Envío gratis desde',
    group: 'envios',
    type: 'number',
    value: 250000,
    help: 'Compra mínima en pesos para no cobrar envío. 0 lo deja siempre gratis.',
  },
  {
    key: 'inventory.defaultMinStock',
    label: 'Stock mínimo por defecto',
    group: 'inventario',
    type: 'number',
    value: 5,
    help: 'El que se le pone a un producto nuevo. Cada referencia puede tener el suyo.',
  },
  {
    key: 'inventory.coverageDays',
    label: 'Días de cobertura al reponer',
    group: 'inventario',
    type: 'number',
    value: 30,
    help: 'Cuántos días debe cubrir el pedido sugerido de las alertas de stock.',
  },
  {
    key: 'inventory.deadStockDays',
    label: 'Días para considerar stock parado',
    group: 'inventario',
    type: 'number',
    value: 60,
    help: 'Un producto activo sin una sola venta en este plazo sale en el panel.',
  },
  {
    key: 'promotions.popupEnabled',
    label: 'Mostrar el pop-up de promociones',
    group: 'promociones',
    type: 'boolean',
    value: true,
    help: 'Interruptor general. Apagado, ninguna promoción se anuncia en la portada.',
  },
] as const;

export const SETTING_KEYS = new Set(SETTING_DEFAULTS.map((s) => s.key));

export const findSetting = (key: string): SettingDefinition | undefined =>
  SETTING_DEFAULTS.find((s) => s.key === key);
