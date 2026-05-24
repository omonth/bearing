import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '@/store/cartStore';
import type { Bearing } from '@/types';

const mockBearing: Bearing = {
  id: 1,
  name: { zh: '深沟球轴承 6200', en: 'Deep Groove Ball Bearing 6200' },
  model: '6200',
  price: 15.00,
  image: '/images/6200.jpg',
  category: '深沟球轴承',
  specs: { innerDiameter: 10, outerDiameter: 30, width: 9 },
  stock: 100,
  description: { zh: '通用深沟球轴承', en: 'General purpose deep groove ball bearing' },
};

const mockBearing2: Bearing = {
  ...mockBearing,
  id: 2,
  name: { zh: '圆柱滚子轴承 NU205', en: 'Cylindrical Roller Bearing NU205' },
  model: 'NU205',
  price: 45.00,
};

describe('cartStore', () => {
  beforeEach(() => {
    useCartStore.setState({ items: [], showCart: false });
    localStorage.clear();
  });

  it('should start with empty cart', () => {
    const { items } = useCartStore.getState();
    expect(items).toHaveLength(0);
  });

  it('should add an item', () => {
    useCartStore.getState().addItem(mockBearing);
    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(1);
    expect(items[0].quantity).toBe(1);
  });

  it('should increment quantity when adding same item', () => {
    useCartStore.getState().addItem(mockBearing);
    useCartStore.getState().addItem(mockBearing, 2);
    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
  });

  it('should remove an item', () => {
    useCartStore.getState().addItem(mockBearing);
    useCartStore.getState().addItem(mockBearing2);
    useCartStore.getState().removeItem(1);
    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(2);
  });

  it('should update quantity', () => {
    useCartStore.getState().addItem(mockBearing);
    useCartStore.getState().updateQuantity(1, 5);
    const { items } = useCartStore.getState();
    expect(items[0].quantity).toBe(5);
  });

  it('should remove item when quantity set to 0', () => {
    useCartStore.getState().addItem(mockBearing);
    useCartStore.getState().updateQuantity(1, 0);
    const { items } = useCartStore.getState();
    expect(items).toHaveLength(0);
  });

  it('should clear the cart', () => {
    useCartStore.getState().addItem(mockBearing);
    useCartStore.getState().addItem(mockBearing2);
    useCartStore.getState().clearCart();
    const { items } = useCartStore.getState();
    expect(items).toHaveLength(0);
  });

  it('should calculate total price', () => {
    useCartStore.getState().addItem(mockBearing, 2);    // 2 * 15 = 30
    useCartStore.getState().addItem(mockBearing2, 1);   // 1 * 45 = 45
    const total = useCartStore.getState().getTotalPrice();
    expect(total).toBe(75);
  });

  it('should calculate total count', () => {
    useCartStore.getState().addItem(mockBearing, 3);
    useCartStore.getState().addItem(mockBearing2, 2);
    const count = useCartStore.getState().getTotalCount();
    expect(count).toBe(5);
  });

  it('should toggle cart visibility', () => {
    expect(useCartStore.getState().showCart).toBe(false);
    useCartStore.getState().toggleCart();
    expect(useCartStore.getState().showCart).toBe(true);
    useCartStore.getState().toggleCart();
    expect(useCartStore.getState().showCart).toBe(false);
  });

  it('should set cart visibility', () => {
    useCartStore.getState().setShowCart(true);
    expect(useCartStore.getState().showCart).toBe(true);
    useCartStore.getState().setShowCart(false);
    expect(useCartStore.getState().showCart).toBe(false);
  });
});
