import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type StorefrontLanguage = "zh" | "en";

const storefrontText = {
  zh: {
    header: {
      title: "轴承商城",
      products: "浏览产品",
      account: "账户",
      cart: "购物车",
      menu: "菜单",
    },
    product: {
      allCategories: "全部分类",
      searchPlaceholder: "搜索型号、尺寸或分类",
      stock: "库存",
      outOfStock: "缺货",
      innerDiameter: "内径",
      outerDiameter: "外径",
      width: "宽度",
      model: "型号",
      specs: "产品规格",
      description: "产品描述",
      addToCart: "加入购物车",
      backToList: "返回列表",
      similarProducts: "相似产品推荐",
      searchPrefix: "搜索",
    },
    cart: {
      title: "购物车",
      empty: "购物车是空的",
      close: "关闭",
      total: "合计",
      checkout: "去结算",
    },
    common: {
      cancel: "取消",
    },
  },
  en: {
    header: {
      title: "Bearing Store",
      products: "Products",
      account: "Account",
      cart: "Cart",
      menu: "Menu",
    },
    product: {
      allCategories: "All Categories",
      searchPlaceholder: "Search model, size, or category",
      stock: "Stock",
      outOfStock: "Out of stock",
      innerDiameter: "Inner Dia.",
      outerDiameter: "Outer Dia.",
      width: "Width",
      model: "Model",
      specs: "Specifications",
      description: "Description",
      addToCart: "Add to Cart",
      backToList: "Back to List",
      similarProducts: "Similar Products",
      searchPrefix: "Search",
    },
    cart: {
      title: "Shopping Cart",
      empty: "Your cart is empty",
      close: "Close",
      total: "Total",
      checkout: "Checkout",
    },
    common: {
      cancel: "Cancel",
    },
  },
} as const;

interface StorefrontLanguageContextValue {
  language: StorefrontLanguage;
  setLanguage: (language: StorefrontLanguage) => void;
  text: (typeof storefrontText)[StorefrontLanguage];
}

const StorefrontLanguageContext =
  createContext<StorefrontLanguageContextValue | null>(null);

function normalizeLanguage(value: string | null): StorefrontLanguage {
  return value === "en" ? "en" : "zh";
}

function readStoredLanguage(): StorefrontLanguage {
  if (typeof window === "undefined") {
    return "zh";
  }

  try {
    return normalizeLanguage(window.localStorage.getItem("lang"));
  } catch {
    return "zh";
  }
}

export function StorefrontLanguageProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [language, setLanguageState] = useState<StorefrontLanguage>("zh");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setLanguageState(readStoredLanguage());
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const setLanguage = useCallback((next: StorefrontLanguage) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem("lang", next);
    } catch {}
  }, []);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      text: storefrontText[language],
    }),
    [language, setLanguage]
  );

  return (
    <StorefrontLanguageContext.Provider value={value}>
      {children}
    </StorefrontLanguageContext.Provider>
  );
}

export function useStorefrontLanguage() {
  const value = useContext(StorefrontLanguageContext);
  if (!value) {
    throw new Error(
      "useStorefrontLanguage must be used within StorefrontLanguageProvider"
    );
  }
  return value;
}
