import React from 'react';
import './Header.css';

function Header({ cartCount, onCartClick }) {
  return (
    <header className="header">
      <div className="header-content">
        <h1 className="logo">轴承商城</h1>
        <nav className="nav">
          <button className="nav-link">首页</button>
          <button className="nav-link">产品分类</button>
          <button className="nav-link">关于我们</button>
          <button className="cart-button" onClick={onCartClick}>
            <span className="cart-icon">🛒</span>
            {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
          </button>
        </nav>
      </div>
    </header>
  );
}

export default Header;
