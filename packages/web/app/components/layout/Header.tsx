import { Link } from '@tanstack/react-router'
import { Menu, ShoppingCart, User, X, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useCartItemCount } from '~/stores/cart'

/**
 * Header component for the MasonArt e-commerce platform.
 * Provides main navigation, cart access, and user authentication links.
 * Responsive design with mobile hamburger menu.
 */
export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const cartItemCount = useCartItemCount()

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((prev) => !prev)
  }

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false)
  }

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container-wide">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center space-x-2"
            onClick={closeMobileMenu}
          >
            <span className="text-xl font-bold tracking-tight text-foreground">
              Mason<span className="text-primary">Art</span>
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex md:items-center md:space-x-6">
            <NavLink to="/posters" onClick={closeMobileMenu}>
              Posters
            </NavLink>
            <NavLink to="/create" onClick={closeMobileMenu}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Create
            </NavLink>
            <NavLink to="/gallery" onClick={closeMobileMenu}>
              Gallery
            </NavLink>
            <NavLink to="/about" onClick={closeMobileMenu}>
              About
            </NavLink>
          </nav>

          {/* Desktop Actions */}
          <div className="hidden md:flex md:items-center md:space-x-4">
            <Link
              to="/cart"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={`Shopping cart${cartItemCount > 0 ? `, ${cartItemCount} items` : ''}`}
            >
              <ShoppingCart className="h-5 w-5" />
              {cartItemCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {cartItemCount > 99 ? '99+' : cartItemCount}
                </span>
              )}
            </Link>
            <Link
              to="/account"
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Account"
            >
              <User className="h-5 w-5" />
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center space-x-2 md:hidden">
            <Link
              to="/cart"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={`Shopping cart${cartItemCount > 0 ? `, ${cartItemCount} items` : ''}`}
            >
              <ShoppingCart className="h-5 w-5" />
              {cartItemCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {cartItemCount > 99 ? '99+' : cartItemCount}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={toggleMobileMenu}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <nav className="border-t border-border py-4 md:hidden">
            <div className="flex flex-col space-y-3">
              <MobileNavLink to="/posters" onClick={closeMobileMenu}>
                Posters
              </MobileNavLink>
              <MobileNavLink to="/create" onClick={closeMobileMenu}>
                <Sparkles className="mr-2 h-4 w-4" />
                Create with AI
              </MobileNavLink>
              <MobileNavLink to="/gallery" onClick={closeMobileMenu}>
                Gallery
              </MobileNavLink>
              <MobileNavLink to="/about" onClick={closeMobileMenu}>
                About
              </MobileNavLink>
              <div className="my-2 border-t border-border" />
              <MobileNavLink to="/account" onClick={closeMobileMenu}>
                <User className="mr-2 h-4 w-4" />
                Account
              </MobileNavLink>
            </div>
          </nav>
        )}
      </div>
    </header>
  )
}

/**
 * Desktop navigation link component with active state styling.
 */
function NavLink({
  to,
  children,
  onClick,
}: {
  to: string
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      activeProps={{
        className: 'text-foreground',
      }}
    >
      {children}
    </Link>
  )
}

/**
 * Mobile navigation link component with larger touch target.
 */
function MobileNavLink({
  to,
  children,
  onClick,
}: {
  to: string
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center px-2 py-2 text-base font-medium text-muted-foreground transition-colors hover:text-foreground"
      activeProps={{
        className: 'text-foreground',
      }}
    >
      {children}
    </Link>
  )
}
