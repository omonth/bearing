import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Bearing, CartItem } from '@/types';

interface CartStore {
  items: CartItem[];
  showCart: boolean;
  addItem: (product: Bearing, quantity?: number) => void;
  removeItem: (productId: number) => void;
  updateQuantity: (productId: number, quantity: number) => void;
  clearCart: () => void;
  toggleCart: () => void;
  setShowCart: (show: boolean) => void;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      showCart: false,

      addItem: (product, quantity = 1) => {
        set((state) => {
          const existing = state.items.find(item => item.id === product.id);
          if (existing) {
            return {
              items: state.items.map(item =>
                item.id === product.id
                  ? { ...item, quantity: item.quantity + quantity }
                  : item
              ),
            };
          }
          return { items: [...state.items, { ...product, quantity }] };
        });
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter(item => item.id !== productId),
        }));
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
        } else {
          set((state) => ({
            items: state.items.map(item =>
              item.id === productId ? { ...item, quantity } : item
            ),
          }));
        }
      },

      clearCart: () => set({ items: [] }),

      toggleCart: () => set((state) => ({ showCart: !state.showCart })),

      setShowCart: (show) => set({ showCart: show }),
    }),
    {
      name: 'bearing-cart',
      partialize: (state) => ({ items: state.items }),
    }
  )
);

/** Reactive selector — only re-renders when items change (not on showCart toggle). */
export const useTotalPrice = () =>
  useCartStore((s) => s.items.reduce((total, item) => total + item.price * item.quantity, 0));

/** Reactive selector — only re-renders when items change (not on showCart toggle). */
export const useTotalCount = () =>
  useCartStore((s) => s.items.reduce((sum, item) => sum + item.quantity, 0));
