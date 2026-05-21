import React, { useState } from 'react';
import './ProductDetail.css';

function ProductDetail({ product, onBack, onAddToCart, similarProducts }) {
  const [quantity, setQuantity] = useState(1);

  const handleAddToCart = () => {
    onAddToCart(product, quantity);
    alert(`已添加 ${quantity} 件 ${product.name} 到购物车`);
  };

  return (
    <div className="product-detail">
      <button className="back-btn" onClick={onBack}>
        ← 返回列表
      </button>

      <div className="detail-content">
        <div className="detail-image">
          <img src={product.image} alt={product.name} />
        </div>

        <div className="detail-info">
          <h1 className="detail-title">{product.name}</h1>
          <p className="detail-category">{product.category}</p>

          <div className="detail-price-section">
            <span className="detail-price">¥{product.price.toFixed(2)}</span>
            <span className="detail-stock">库存: {product.stock} 件</span>
          </div>

          <div className="detail-specs">
            <h3>产品规格</h3>
            <table>
              <tbody>
                <tr>
                  <td>型号</td>
                  <td>{product.model}</td>
                </tr>
                <tr>
                  <td>内径</td>
                  <td>{product.specs.innerDiameter}</td>
                </tr>
                <tr>
                  <td>外径</td>
                  <td>{product.specs.outerDiameter}</td>
                </tr>
                <tr>
                  <td>宽度</td>
                  <td>{product.specs.width}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="detail-description">
            <h3>产品描述</h3>
            <p>{product.description}</p>
          </div>

          <div className="detail-actions">
            <div className="quantity-selector">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                disabled={quantity <= 1}
              >
                -
              </button>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                min="1"
                max={product.stock}
              />
              <button
                onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                disabled={quantity >= product.stock}
              >
                +
              </button>
            </div>
            <button className="detail-add-btn" onClick={handleAddToCart}>
              加入购物车
            </button>
          </div>
        </div>
      </div>

      {similarProducts && similarProducts.length > 0 && (
        <div className="similar-products">
          <h3>相似产品推荐</h3>
          <div className="similar-grid">
            {similarProducts.map(item => (
              <div key={item.id} className="similar-card" onClick={() => onAddToCart(item)}>
                <img src={item.image} alt={item.name} />
                <p>{item.name}</p>
                <p>型号: {item.model}</p>
                <span>¥{item.price.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default ProductDetail;
