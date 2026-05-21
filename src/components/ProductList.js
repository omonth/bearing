import React from 'react';
import './ProductList.css';

function ProductList({ products, onProductClick, onAddToCart, categories: propCategories, activeCategory, onCategoryChange }) {
  const categories = propCategories && propCategories.length > 0
    ? propCategories
    : ['全部', ...new Set(products.map(p => p.category))];

  const selectedCategory = activeCategory || '全部';

  const filteredProducts = selectedCategory === '全部'
    ? products
    : products.filter(p => p.category === selectedCategory);

  return (
    <div className="product-list-container">
      <div className="category-filter">
        {categories.map(category => (
          <button
            key={category}
            className={`category-btn ${selectedCategory === category ? 'active' : ''}`}
            onClick={() => onCategoryChange && onCategoryChange(category)}
          >
            {category}
          </button>
        ))}
      </div>

      <div className="product-grid">
        {filteredProducts.map(product => (
          <div key={product.id} className="product-card">
            <div className="product-image" onClick={() => onProductClick(product)}>
              <img src={product.image} alt={product.name} />
              <div className="stock-badge">库存: {product.stock}</div>
            </div>
            <div className="product-info">
              <h3 className="product-name" onClick={() => onProductClick(product)}>
                {product.name}
              </h3>
              <p className="product-model">型号: {product.model}</p>
              <p className="product-category">{product.category}</p>
              <div className="product-specs">
                <span>内径: {product.specs.innerDiameter}</span>
                <span>外径: {product.specs.outerDiameter}</span>
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

export default ProductList;
