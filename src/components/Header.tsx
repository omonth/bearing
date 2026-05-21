import Link from 'next/link';

interface HeaderProps {
  cartCount: number;
  onCartClick: () => void;
}

export default function Header({ cartCount, onCartClick }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-content">
        <Link href="/" className="logo">轴承商城</Link>
        <nav className="nav">
          <Link href="/" className="nav-link">首页</Link>
          <Link href="/" className="nav-link">产品分类</Link>
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
