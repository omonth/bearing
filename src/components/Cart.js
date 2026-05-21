import React from 'react';
import './Cart.css';

function Cart({ items, onClose, onRemove, onUpdateQuantity, totalPrice }) {
  return (
    <div className="cart-overlay" onClick={onClose}>
      <div className="cart-panel" onClick={(e) => e.stopPropagation()}>
        <div className="cart-header">
          <h2>购物车</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="cart-items">
          {items.length === 0 ? (
            <div className="empty-cart">
              <p>购物车是空的</p>
            </div>
          ) : (
            items.map(item => (
              <div key={item.id} className="cart-item">
                <img src={item.image} alt={item.name} className="cart-item-image" />
                <div className="cart-item-info">
                  <h4>{item.name}</h4>
                  <p className="cart-item-model">型号: {item.model}</p>
                  <p className="cart-item-price">¥{item.price.toFixed(2)}</p>
                </div>
                <div className="cart-item-actions">
                  <div className="cart-quantity">
                    <button onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}>
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}>
                      +
                    </button>
                  </div>
                  <button className="remove-btn" onClick={() => onRemove(item.id)}>
                    删除
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="cart-footer">
            <div className="cart-total">
              <span>总计:</span>
              <span className="total-price">¥{totalPrice.toFixed(2)}</span>
            </div>
            <button className="checkout-btn">结算</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default Cart;
