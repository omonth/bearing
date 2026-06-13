import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProductDetailStore } from '@/store/productDetailStore';

const mockProducts = [
  { id: 1, name: '轴承 A', model: 'A1', price: 10, image: '', category: '深沟球轴承', specs: { innerDiameter: 10, outerDiameter: 30, width: 9 }, stock: 50, description: '' },
  { id: 2, name: '轴承 B', model: 'B1', price: 20, image: '', category: '圆柱滚子轴承', specs: { innerDiameter: 20, outerDiameter: 40, width: 12 }, stock: 30, description: '' },
];

vi.mock('@/lib/productApi', () => ({
  getProduct: vi.fn((id: number) => {
    const product = mockProducts.find((item) => item.id === id);
    return Promise.resolve(product || null);
  }),
  getSimilarProducts: vi.fn(() => Promise.resolve([mockProducts[1]])),
}));

describe('productDetailStore', () => {
  beforeEach(() => {
    useProductDetailStore.setState({
      currentProduct: null,
      similarProducts: [],
      detailLoading: false,
    });
  });

  it('should start with default state', () => {
    const state = useProductDetailStore.getState();
    expect(state.currentProduct).toBeNull();
    expect(state.similarProducts).toHaveLength(0);
    expect(state.detailLoading).toBe(false);
  });

  it('should fetch product detail', async () => {
    await useProductDetailStore.getState().fetchProductDetail(1);
    const state = useProductDetailStore.getState();
    expect(state.currentProduct?.name).toBe('轴承 A');
    expect(state.similarProducts).toEqual([mockProducts[1]]);
    expect(state.detailLoading).toBe(false);
  });

  it('should set detail loading to false on error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getProduct } = await import('@/lib/productApi');
    vi.mocked(getProduct).mockRejectedValueOnce(new Error('Network error'));

    await useProductDetailStore.getState().fetchProductDetail(1);

    expect(useProductDetailStore.getState().detailLoading).toBe(false);
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
