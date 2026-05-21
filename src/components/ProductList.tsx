import type { Bearing } from '@/types';

interface ProductListProps {
  products: Bearing[];
  categories?: string[];
  activeCategory?: string;
  onCategoryChange?: (category: string) => void;
  onProductClick: (product: Bearing) => void;
  onAddToCart: (product: Bearing) => void;
}

export default function ProductList({
  products,
  categories,
  activeCategory,
  onCategoryChange,
  onProductClick,
  onAddToCart
}: ProductListProps) {
  const cats = categories || ['全部', ...Array.from(new Set(products.map(p => p.category)))];

  const filteredProducts = (!activeCategory || activeCategory === '全部')
    ? products
    : products.filter(p => p.category === activeCategory);

  return (
    <div className="product-list-container">
      <div className="category-filter">
        {cats.map(category => (
          <button
            key={category}
            className={`category-btn ${activeCategory === category ? 'active' : ''}`}
            onClick={() => onCategoryChange?.(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="product-grid">
        {filteredProducts.map(product => (
          <div key={product.id} className="product-card">
            <div className="product-image" onClick={() => onProductClick(product)}>
              <img src={product.image || '/placeholder.svg'} alt={product.name} onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }} />
              <div className="stock-badge">库存: {product.stock}</div>
            </div>
            <div className="product-info">
              <h3 className="product-name" onClick={() => onProductClick(product)}>
                {product.name}
              </h3>
              <p className="product-model">型号: {product.model}</p>
              <p className="product-category">{product.category}</p>
              <div className="product-specs">
                <span>内径: {product.specs?.innerDiameter}</span>
                <span>外径: {product.specs?.outerDiameter}</span>
              </div>
              <div className="product-footer">
                <span className="product-price">¥{product.price.toFixed(2)}</span>
                <button
                  className="add-to-cart-btn"
                  onClick={() => onAddToCart(product)}
                >
                  加入购物车
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
