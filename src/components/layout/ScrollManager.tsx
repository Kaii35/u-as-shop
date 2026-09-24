import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Sube al inicio al cambiar de página y respeta anclas (/#categorias). */
export function ScrollManager() {
  const { pathname, search, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const t = window.setTimeout(() => {
        const el = document.getElementById(hash.slice(1));
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior: 'smooth' });
      }, 60);
      return () => window.clearTimeout(t);
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  // Cambios de filtros (search) no reinician el scroll.
  void search;
  return null;
}
