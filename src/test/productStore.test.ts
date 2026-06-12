import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProductStore } from '@/store/productStore';

const mockProducts = [
  { id: 1, name: '轴承 A', model: 'A1', price: 10, image: '', category: '深沟球轴承', specs: { innerDiameter: 10, outerDiameter: 30, width: 9 }, stock: 50, description: '' },
  { id: 2, name: '轴承 B', model: 'B1', price: 20, image: '', category: '圆柱滚子轴承', specs: { innerDiameter: 20, outerDiameter: 40, width: 12 }, stock: 30, description: '' },
];

const mockCategories = ['深沟球轴承', '圆柱滚子轴承', '推力球轴承'];

// Mock the API module
vi.mock('@/lib/api', () => ({
  getProducts: vi.fn((category?: string) => {
    if (category && category !== '全部') {
      return Promise.resolve(mockProducts.filter(p => p.category === category));
    }
    return Promise.resolve(mockProducts);
  }),
  getCategories: vi.fn(() => Promise.resolve(mockCategories)),
  getProduct: vi.fn((id: number) => {
    const p = mockProducts.find(p => p.id === id);
    return Promise.resolve(p || null);
  }),
  getSimilarProducts: vi.fn(() => Promise.resolve([])),
}));

describe('productStore', () => {
  beforeEach(() => {
    useProductStore.setState({
      products: [],
      selectedProduct: null,
      loading: true,
      activeCategory: '全部',
      categories: [],
      currentProduct: null,
      similarProducts: [],
      detailLoading: false,
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
    expect(state.products[0].name).toBe('轴承 A');
  });

  it('should fetch categories', async () => {
    await useProductStore.getState().fetchCategories();
    const state = useProductStore.getState();
    expect(state.categories).toEqual(['全部', ...mockCategories]);
  });

  it('should set active category', () => {
    useProductStore.getState().setActiveCategory('圆柱滚子轴承');
    expect(useProductStore.getState().activeCategory).toBe('圆柱滚子轴承');
  });

  it('should set selected product', () => {
    useProductStore.getState().setSelectedProduct(mockProducts[0] as any);
    expect(useProductStore.getState().selectedProduct?.name).toBe('轴承 A');
    useProductStore.getState().setSelectedProduct(null);
    expect(useProductStore.getState().selectedProduct).toBeNull();
  });

  it('should fetch product detail', async () => {
    await useProductStore.getState().fetchProductDetail(1);
    const state = useProductStore.getState();
    expect(state.currentProduct?.name).toBe('轴承 A');
    expect(state.detailLoading).toBe(false);
  });

  it('should set loading to false on error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getProducts } = await import('@/lib/api');
    vi.mocked(getProducts).mockRejectedValueOnce(new Error('Network error'));

    await useProductStore.getState().fetchProducts();

    expect(useProductStore.getState().loading).toBe(false);
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
