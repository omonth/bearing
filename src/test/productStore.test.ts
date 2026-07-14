import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProductStore } from '@/store/productStore';
import type { Bearing } from '@/types';

const mockProducts: Bearing[] = [
  { id: 1, name: { zh: '轴承 A', en: 'Bearing A' }, model: 'A1', price: 10, image: '', category: '深沟球轴承', specs: { innerDiameter: 10, outerDiameter: 30, width: 9 }, stock: 50, description: { zh: '测试轴承 A', en: 'Test bearing A' } },
  { id: 2, name: { zh: '轴承 B', en: 'Bearing B' }, model: 'B1', price: 20, image: '', category: '圆柱滚子轴承', specs: { innerDiameter: 20, outerDiameter: 40, width: 12 }, stock: 30, description: { zh: '测试轴承 B', en: 'Test bearing B' } },
];

// Mock the API module
vi.mock('@/lib/productApi', () => ({
  getProducts: vi.fn((category?: string) => {
    if (category && category !== '全部') {
      return Promise.resolve(mockProducts.filter(p => p.category === category));
    }
    return Promise.resolve(mockProducts);
  }),
}));

describe('productStore', () => {
  beforeEach(() => {
    useProductStore.setState({
      products: [],
      selectedProduct: null,
      loading: true,
      activeCategory: '全部',
      categories: [],
    });
  });

  it('should start with default state', () => {
    const state = useProductStore.getState();
    expect(state.products).toHaveLength(0);
    expect(state.loading).toBe(true);
    expect(state.activeCategory).toBe('全部');
  });

  it('should fetch products', async () => {
    await useProductStore.getState().fetchProducts();
    const state = useProductStore.getState();
    expect(state.products).toHaveLength(2);
    expect(state.categories).toEqual(['全部', '深沟球轴承', '圆柱滚子轴承']);
    expect(state.loading).toBe(false);
  });

  it('should fetch products by category', async () => {
    await useProductStore.getState().fetchProducts('深沟球轴承');
    const state = useProductStore.getState();
    expect(state.products).toHaveLength(1);
    expect(state.products[0].model).toBe('A1');
  });

  it('should set active category', () => {
    useProductStore.getState().setActiveCategory('圆柱滚子轴承');
    expect(useProductStore.getState().activeCategory).toBe('圆柱滚子轴承');
  });

  it('should set selected product', () => {
    useProductStore.getState().setSelectedProduct(mockProducts[0]);
    expect(useProductStore.getState().selectedProduct?.model).toBe('A1');
    useProductStore.getState().setSelectedProduct(null);
    expect(useProductStore.getState().selectedProduct).toBeNull();
  });

  it('should set loading to false on error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getProducts } = await import('@/lib/productApi');
    vi.mocked(getProducts).mockRejectedValueOnce(new Error('Network error'));

    await useProductStore.getState().fetchProducts();

    expect(useProductStore.getState().loading).toBe(false);
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
