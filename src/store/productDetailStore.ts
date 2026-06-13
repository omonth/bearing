import { create } from 'zustand';
import { getProduct, getSimilarProducts } from '@/lib/productApi';
import type { Bearing } from '@/types';

interface ProductDetailStore {
  currentProduct: Bearing | null;
  similarProducts: Bearing[];
  detailLoading: boolean;

  fetchProductDetail: (id: number) => Promise<void>;
}

export const useProductDetailStore = create<ProductDetailStore>()((set) => ({
  currentProduct: null,
  similarProducts: [],
  detailLoading: false,

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
