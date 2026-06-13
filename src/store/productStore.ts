import { create } from 'zustand';
import { getProducts } from '@/lib/productApi';
import type { Bearing } from '@/types';

interface ProductStore {
  products: Bearing[];
  selectedProduct: Bearing | null;
  loading: boolean;
  error: string | null;
  activeCategory: string;
  categories: string[];

  fetchProducts: (category?: string) => Promise<void>;
  setActiveCategory: (category: string) => void;
  setSelectedProduct: (product: Bearing | null) => void;
}

export const useProductStore = create<ProductStore>()((set) => ({
  products: [],
  selectedProduct: null,
  loading: true,
  error: null,
  activeCategory: '全部',
  categories: [],
  fetchProducts: async (category) => {
    set({ loading: true, error: null });
    try {
      const data = await getProducts(category);
      const nextState: Partial<ProductStore> = { products: data };
      if (!category || category === '全部') {
        nextState.categories = [
          '全部',
          ...Array.from(new Set(data.map((product) => product.category))),
        ];
      }
      set(nextState);
    } catch (error) {
      set({ error: '加载产品失败，请检查网络连接后重试' });
      console.error('获取产品失败:', error);
    } finally {
      set({ loading: false });
    }
  },

  setActiveCategory: (category) => {
    set({ activeCategory: category });
  },

  setSelectedProduct: (product) => {
    set({ selectedProduct: product });
  },

}));
