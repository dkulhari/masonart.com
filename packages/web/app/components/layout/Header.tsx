import { Link, useRouteContext } from '@tanstack/react-router'
import { Heart, LayoutDashboard, Menu, ShoppingCart, User, X, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useCartItemCount, useCartHydration } from '~/stores/cart'
import { useWishlistCount, useWishlistActions, useWishlistStore } from '~/stores/wishlist'
import {
  ADMIN_PRODUCTS_SEARCH,
  staffAreaHref,
  staffAreaLabel,
} from '~/lib/admin-nav'
import { STYLE_OPTIONS } from '@chobii/shared'

/**
 * The header's own height, and the offset everything sticky below it uses.
 *
 * CollectionToolbar is `sticky top-16` — 4rem, this value. They are two
 * numbers that must agree, and nothing but this comment and a test connects
 * them: grow the header without moving the toolbar and the toolbar hides
 * behind it.
 *
 * The styles row is deliberately NOT counted here. It scrolls away with the
 * page rather than sticking, so the sticky box stays one row tall.
 */
export const HEADER_HEIGHT_CLASS = 'h-16'

/**
 * Header component for the chobii.art e-commerce platform.
 * Provides main navigation, cart access, and user authentication links.
 * Responsive design with mobile hamburger menu.
 */
export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const isHydrated = useCartHydration()
  const cartItemCount = useCartItemCount()
  const wishlistCount = useWishlistCount()
  const { load: loadWishlist } = useWishlistActions()
  const isWishlistLoaded = useWishlistStore((state) => state.isLoaded)

  // Session comes from the root route's beforeLoad; staff get an entry into
  // the staff area, labelled for what their role can actually reach (#362).
  const { session } = useRouteContext({ from: '__root__' }) as {
    session?: { user?: { role?: string } } | null
  }
  const staffLabel = staffAreaLabel(session?.user?.role)
  const staffHref = staffAreaHref(session?.user?.role)
  const staffSearch =
    staffHref === '/admin/products' ? ADMIN_PRODUCTS_SEARCH : undefined

  // Only show counts after hydration to avoid SSR mismatch (#498) — the
  // server cannot know either number.
  const displayCartCount = isHydrated ? cartItemCount : 0
  const displayWishlistCount = isHydrated ? wishlistCount : 0

  useEffect(() => {
    if (isHydrated && !isWishlistLoaded) void loadWishlist()
  }, [isHydrated, isWishlistLoaded, loadWishlist])

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((prev) => !prev)
  }

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false)
  }

  // Lock body scroll and wire Escape while the drawer is open, so the page
  // behind it cannot scroll away under the user's thumb (#348). Same approach
  // as MobileFiltersSheet on /posters.
  useEffect(() => {
    if (!isMobileMenuOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isMobileMenuOpen])

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container-wide">
        <div className="relative flex h-16 items-center justify-between">
          {/* Wordmark.
           *
           * Absolutely centred on desktop so it stays centred regardless of
           * how wide the nav and action clusters happen to be. Left-aligned on
           * mobile — centring on a narrow viewport squeezes the actions, and
           * mesonart's own mobile header is left-aligned too. */}
          <Link
            to="/"
            className="flex items-center space-x-2 md:absolute md:left-1/2 md:-translate-x-1/2"
            onClick={closeMobileMenu}
          >
            {/* One word, one weight. The `.art` used to be tinted with the
                brand orange; --primary is now the same near-black as the rest
                of the wordmark, so the split span earned nothing. */}
            <span className="font-heading text-xl font-medium tracking-tight text-foreground">
              chobii.art
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
            {staffLabel && staffHref && (
              <Link
                to={staffHref}
                search={staffSearch}
                className="flex items-center gap-1.5 rounded-pill border border-border px-3 py-1.5 text-nav font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <LayoutDashboard className="h-4 w-4" />
                {staffLabel}
              </Link>
            )}
            {/* Wishlist. The destination is the account area until Phase F
                builds the wishlist page proper — the parity work needs the
                affordance and the count, not the page. */}
            <Link
              to="/account"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={`Wishlist${displayWishlistCount > 0 ? `, ${displayWishlistCount} items` : ''}`}
            >
              <Heart className="h-5 w-5" />
              {displayWishlistCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {displayWishlistCount > 99 ? '99+' : displayWishlistCount}
                </span>
              )}
            </Link>
            <Link
              to="/cart"
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={`Shopping cart${displayCartCount > 0 ? `, ${displayCartCount} items` : ''}`}
            >
              <ShoppingCart className="h-5 w-5" />
              {displayCartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {displayCartCount > 99 ? '99+' : displayCartCount}
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
              aria-label={`Shopping cart${displayCartCount > 0 ? `, ${displayCartCount} items` : ''}`}
            >
              <ShoppingCart className="h-5 w-5" />
              {displayCartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {displayCartCount > 99 ? '99+' : displayCartCount}
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
        </div>

      </header>

      {/* Nav row 2 — styles.
       *
       * Generated from STYLE_OPTIONS in @chobii/shared, the same list the
       * schema, the API validation, the seed and the filter sidebar read.
       * Twelve hardcoded links here would restart the drift #395 ended.
       *
       * Scrolls rather than wraps: twelve links overflow a laptop, and three
       * wrapped lines of nav pushes the page content below the fold.
       *
       * OUTSIDE <header> on purpose. The header is `sticky top-0` and the
       * collection toolbar is `sticky top-16` — if this row were inside the
       * sticky box the header would stand 101px tall and swallow the
       * toolbar. Here it scrolls away and the sticky box stays one row. */}
      <nav
        aria-label="Shop by style"
        className="hidden border-b border-border bg-background md:block"
      >
        <div className="container-wide">
          <ul className="scrollbar-hide flex items-center gap-6 overflow-x-auto py-2">
            <li>
              <Link
                to="/posters"
                className="whitespace-nowrap text-nav text-muted-foreground transition-colors hover:text-foreground"
              >
                All Art
              </Link>
            </li>
            {STYLE_OPTIONS.map((style) => (
              <li key={style.id}>
                <Link
                  to="/posters"
                  search={{ styles: style.id }}
                  className="whitespace-nowrap text-nav text-muted-foreground transition-colors hover:text-foreground"
                >
                  {style.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      {/* Mobile Navigation
       *
       * Rendered as a real drawer rather than an expanded header. Previously
       * this was a bare <nav> inside the header, so it inherited the header's
       * translucent bg-background/60 + blur — fine for a 64px strip, illegible
       * for a ~360px panel over page content (#348).
       *
       * Deliberately a SIBLING of <header>, not a child: the header sets
       * backdrop-blur, and a backdrop-filter establishes a containing block
       * for fixed-position descendants. Nested here, the scrim resolved
       * against the 64px header box and collapsed to zero height instead of
       * covering the viewport.
       *
       * Mirrors the filter sheet on /posters: scrim, opaque panel, scroll
       * lock, Escape, dialog semantics.
       */}
      {isMobileMenuOpen && (
          <>
            {/* Scrim */}
            <div
              data-testid="mobile-nav-scrim"
              className="fixed inset-0 top-16 z-40 bg-black/50 md:hidden"
              onClick={closeMobileMenu}
              aria-hidden="true"
            />

            <nav
              id="mobile-nav"
              role="dialog"
              aria-modal="true"
              aria-label="Site menu"
              className="fixed inset-x-0 top-16 z-40 max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-border bg-background py-4 shadow-xl md:hidden"
            >
              <div className="container-wide flex flex-col space-y-3">
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
              {staffLabel && staffHref && (
                <MobileNavLink
                  to={staffHref}
                  search={staffSearch}
                  onClick={closeMobileMenu}
                >
                  <LayoutDashboard className="mr-2 inline h-4 w-4" />
                  {staffLabel}
                </MobileNavLink>
              )}
                <MobileNavLink to="/account" onClick={closeMobileMenu}>
                  <User className="mr-2 h-4 w-4" />
                  Account
                </MobileNavLink>
              </div>
            </nav>
          </>
        )}
    </>
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
      className="flex items-center text-nav font-medium text-muted-foreground transition-colors hover:text-foreground"
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
  search,
  children,
  onClick,
}: {
  to: string
  search?: Record<string, unknown>
  children: React.ReactNode
  onClick?: () => void
}) {
  return (
    <Link
      to={to}
      search={search}
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
