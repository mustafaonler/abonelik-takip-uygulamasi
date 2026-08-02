import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { toErrorMessage } from '../lib/errors';
import type { Category, ServiceTemplate } from '../types';

// ═══════════════════════════════════════════════════════════════════════════
// useServiceTemplates — "hazır şablondan ekle" akışının veri kaynağı
//
// Her ikisi de global katalog (service_templates salt-okunur, categories'te
// user_id IS NULL satırları herkese açık). Kullanıcıya özel kategoriler de
// RLS sayesinde aynı sorguda gelir.
// ═══════════════════════════════════════════════════════════════════════════

export interface UseServiceTemplatesResult {
  templates: ServiceTemplate[];
  categories: Category[];
  /** category_id → Category, kart üzerinde ikon/renk göstermek için. */
  categoryById: Map<string, Category>;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useServiceTemplates(): UseServiceTemplatesResult {
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mountedRef = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [templatesRes, categoriesRes] = await Promise.all([
        supabase
          .from('service_templates')
          .select('*')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),

        supabase
          .from('categories')
          .select('*')
          .order('sort_order', { ascending: true }),
      ]);

      if (!mountedRef.current) return;

      if (templatesRes.error) throw templatesRes.error;
      if (categoriesRes.error) throw categoriesRes.error;

      setTemplates((templatesRes.data ?? []) as ServiceTemplate[]);
      setCategories((categoriesRes.data ?? []) as Category[]);
      setError(null);
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      console.error('[useServiceTemplates] Yükleme hatası:', err);
      setError(toErrorMessage(err));
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  return { templates, categories, categoryById, loading, error, refetch: load };
}
