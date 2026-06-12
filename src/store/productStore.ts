import { create } from 'zustand';
import { getProducts, getCategories, getProduct, getSimilarProducts } from '@/lib/api';
import type { Bearing } from '@/types';

interface ProductStore {
  products: Bearing[];
  selectedProduct: Bearing | null;
  loading: boolean;
  error: string | null;
  activeCategory: string;
  categories: string[];
  currentProduct: Bearing | null;
  similarProducts: Bearing[];
  detailLoading: boolean;

  fetchProducts: (category?: string) => Promise<void>;
  fetchCategories: () => Promise<void>;
  setActiveCategory: (category: string) => void;
  setSelectedProduct: (product: Bearing | null) => void;
  fetchProductDetail: (id: number) => Promise<void>;
}

export const useProductStore = create<ProductStore>()((set) => ({
  products: [],
  selectedProduct: null,
  loading: true,
  error: null,
  activeCategory: '全部',
  categories: [],
  currentProduct: null,
  similarProducts: [],
  detailLoading: false,

  fetchProducts: async (category) => {
    set({ loading: true, error: null });
    try {
      const data = await getProducts(category);
      set({ products: data });
    } catch (error) {
      set({ error: '加载产品失败，请检查网络连接后重试' });
      console.error('获取产品失败:', error);
    } finally {
      set({ loading: false });
    }
  },

  fetchCategories: async () => {
    try {
      const cats = await getCategories();
      set({ categories: ['全部', ...cats] });
    } catch {}
  },

  setActiveCategory: (category) => {
    set({ activeCategory: category });
  },

  setSelectedProduct: (product) => {
    set({ selectedProduct: product });
  },

  fetchProductDetail: async (id) => {
    set({ detailLoading: true });
    try {
      const [product, similar] = await Promise.all([
        getProduct(id),
        getSimilarProducts(id),
      ]);
      set({ currentProduct: product, similarProducts: similar });
    } catch (error) {
      console.error('获取产品详情失败:', error);
    } finally {
      set({ detailLoading: false });
    }
  },
}));
