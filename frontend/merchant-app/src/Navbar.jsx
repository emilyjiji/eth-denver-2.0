import './Navbar.css';

function Navbar() {
  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <span className="navbar-logo">StreamPay</span>
        <div className="navbar-links">
          <a href="#" className="navbar-link navbar-link--cta">Sign in →</a>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
