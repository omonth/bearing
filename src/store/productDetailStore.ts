import { create } from 'zustand';
import { getProduct, getSimilarProducts } from '@/lib/productApi';
import type { Bearing } from '@/types';

interface ProductDetailStore {
  currentProduct: Bearing | null;
  similarProducts: Bearing[];
  detailLoading: boolean;
  detailError: string | null;

  fetchProductDetail: (id: number) => Promise<void>;
  clearError: () => void;
}

export const useProductDetailStore = create<ProductDetailStore>()((set) => ({
  currentProduct: null,
  similarProducts: [],
  detailLoading: false,
  detailError: null,

  fetchProductDetail: async (id) => {
    set({ detailLoading: true, detailError: null, currentProduct: null });
    try {
      const [product, similar] = await Promise.all([
        getProduct(id),
        getSimilarProducts(id),
      ]);
      set({ currentProduct: product, similarProducts: similar });
    } catch (error) {
      set({ detailError: error instanceof Error ? error.message : '加载产品失败' });
      console.error('获取产品详情失败:', error);
    } finally {
      set({ detailLoading: false });
    }
  },

  clearError: () => set({ detailError: null }),
}));
