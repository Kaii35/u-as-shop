import { brands, categories, products } from '../data/catalog';
import { formatCOP } from '../lib/utils';
import { Checkbox } from './ui/Input';

export const PRICE_MIN = 20_000;
export const PRICE_MAX = 400_000;

export interface FilterState {
  categories: string[];
  brands: string[];
  maxPrice: number;
  onlyStock: boolean;
  onlyOffers: boolean;
  minRating: number;
}

interface Props {
  value: FilterState;
  onToggleCategory: (slug: string) => void;
  onToggleBrand: (slug: string) => void;
  onChange: (patch: Partial<Omit<FilterState, 'categories' | 'brands'>>) => void;
  onClear: () => void;
}

const RATINGS: Array<[number, string]> = [[0, 'Todas'], [4, '4 o más'], [4.5, '4,5 o más']];

export function ProductFilters({ value, onToggleCategory, onToggleBrand, onChange, onClear }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Group title="Categoría">
        {categories.map((c) => (
          <Checkbox key={c.id} checked={value.categories.includes(c.slug)} onChange={() => onToggleCategory(c.slug)}>
            <span className="flex justify-between gap-2">{c.name}<span className="tnum text-meta text-mist">{products.filter((p) => p.categoryId === c.id).length}</span></span>
          </Checkbox>
        ))}
      </Group>
      <Group title="Marca">
        {brands.map((b) => (
          <Checkbox key={b.slug} checked={value.brands.includes(b.slug)} onChange={() => onToggleBrand(b.slug)}>
            <span className="flex justify-between gap-2">{b.name}<span className="tnum text-meta text-mist">{products.filter((p) => p.brand === b.name).length}</span></span>
          </Checkbox>
        ))}
      </Group>
      <Group title="Precio máximo" aside={<span className="tnum text-body font-semibold text-ink">{formatCOP(value.maxPrice)}</span>}>
        <input
          type="range"
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={10_000}
          value={value.maxPrice}
          onChange={(e) => onChange({ maxPrice: Number(e.target.value) })}
          aria-label="Precio máximo"
          className="w-full"
        />
        <div className="tnum flex justify-between text-meta text-mist"><span>{formatCOP(PRICE_MIN)}</span><span>{formatCOP(PRICE_MAX)}</span></div>
      </Group>
      <Group title="Valoración">
        {RATINGS.map(([v, l]) => <Checkbox key={v} radio checked={value.minRating === v} onChange={() => onChange({ minRating: v })}>{l}</Checkbox>)}
      </Group>
      <Group title="Disponibilidad">
        <Checkbox checked={value.onlyStock} onChange={(v) => onChange({ onlyStock: v })}>Solo productos disponibles</Checkbox>
        <Checkbox checked={value.onlyOffers} onChange={(v) => onChange({ onlyOffers: v })}>Solo en oferta</Checkbox>
      </Group>
      <button onClick={onClear} className="link-arrow self-start">Limpiar filtros</button>
    </div>
  );
}

function Group({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 flex w-full items-baseline justify-between text-meta font-semibold uppercase tracking-[.08em] text-ink">{title}{aside}</legend>
      {children}
    </fieldset>
  );
}
