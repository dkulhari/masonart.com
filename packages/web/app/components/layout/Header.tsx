import { Link, useRouteContext } from '@tanstack/react-router'
import {
  Heart,
  LayoutDashboard,
  Menu,
  Search,
  ShoppingCart,
  User,
  X,
  Sparkles,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '~/lib/utils'
import { useNavReveal } from '~/hooks/useNavReveal'
import { useChromeOffset } from '~/hooks/useChromeOffset'
import { useCartItemCount, useCartHydration, useCartStore } from '~/stores/cart'
import { useWishlistCount, useWishlistActions, useWishlistStore } from '~/stores/wishlist'
import {
  ADMIN_PRODUCTS_SEARCH,
  staffAreaHref,
  staffAreaLabel,
} from '~/lib/admin-nav'
import { STYLE_OPTIONS } from '@chobii/shared'
import { SearchDrawer } from './SearchDrawer'
import { AllArtMegaMenu } from './AllArtMegaMenu'

/**
 * The header's own height, and the offset everything sticky below it uses.
 *
 * CollectionToolbar is `sticky top-16` — 4rem, this value. They are two
 * numbers that must agree, and nothing but this comment and a test connects
 * them: grow the header without moving the toolbar and the toolbar hides
 * behind it.
 *
 * The styles row is deliberately NOT counted here. It sticks BELOW this box on
 * its own (#421) rather than inside it, so the sticky box itself stays one row
 * tall whatever the reveal is doing.
 *
 * What the toolbar offsets against is therefore not this constant alone but
 * `--chrome-offset` — this bar plus whatever of the styles row is currently
 * revealed, measured and published by `useChromeOffset`. Pinning the toolbar
 * to the collapsed height instead is what buried the Hide-filters button under
 * the revealed row; hardcoding a second number here is what put the toolbar
 * 37px behind the header in #401. Measure, publish, and let one number drive
 * both.
 */
export const HEADER_HEIGHT_CLASS = 'h-16'

/**
 * The two row-1 entries that are a sort, not a page.
 *
 * Both ids exist in `SORT_OPTIONS` (`salesCount-desc`, `createdAt-desc`) —
 * these are the same contract split at the hyphen, so a nav entry and the sort
 * dropdown always mean the same thing.
 *
 * `createdAt-desc` is also the collection's default, so New In and a bare
 * `/posters` land on the same list. Naming it anyway is the point: arriving
 * from a filtered or differently-sorted view, the link resets to newest rather
 * than quietly keeping whatever sort was in play.
 */
const BEST_SELLERS_SEARCH = { sortBy: 'salesCount', sortOrder: 'desc' }
const NEW_IN_SEARCH = { sortBy: 'createdAt', sortOrder: 'desc' }

/**
 * Header component for the chobii.art e-commerce platform.
 * Provides main navigation, cart access, and user authentication links.
 * Responsive design with mobile hamburger menu.
 */
export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  // The mega panel opens itself; the header only needs to know so it can
  // raise the scrim. The scrim cannot live inside the panel: the nav-rows
  // block carries a transform for its reveal, and a transform is a containing
  // block for fixed descendants — which is what collapsed a full-screen
  // overlay to zero height in #348 (#476).
  const [isAllArtOpen, setIsAllArtOpen] = useState(false)
  const isHydrated = useCartHydration()
  const cartItemCount = useCartItemCount()
  // The cart is a right slide-out drawer, not a page (#460). CartDrawer is
  // mounted in __root and reads its own open state off the store.
  const openCartDrawer = useCartStore((state) => state.openDrawer)
  const wishlistCount = useWishlistCount()
  const { load: loadWishlist } = useWishlistActions()
  const isWishlistLoaded = useWishlistStore((state) => state.isLoaded)

  // Scroll down leaves the compact bar — wordmark and actions; scroll up
  // brings both nav rows back wherever the page happens to be (#421).
  const isNavRevealed = useNavReveal()

  // The revealed nav rows push everything sticky below them down, rather
  // than landing on top of it — the collection toolbar's Hide-filters button
  // is the first casualty otherwise. Measured on the wrapper, so it covers
  // both rows at once and nothing has to know how many rows there are.
  const navRowsRef = useRef<HTMLDivElement>(null)
  useChromeOffset(navRowsRef, isNavRevealed)

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

  /**
   * `/` and Cmd/Ctrl-K open search.
   *
   * `/` must NOT hijack an ordinary keystroke: if focus is already in a field
   * the user is typing a slash, not asking for search.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTyping =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setIsSearchOpen(true)
        return
      }
      if (event.key === '/' && !isTyping) {
        event.preventDefault()
        setIsSearchOpen(true)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

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
      <header
        className={cn(
          'sticky top-0 z-50 w-full border-b border-border',
          // The bar is translucent so the page shows through as it scrolls
          // under — but a translucent bar over the mega panel's scrim reads
          // as dimmed chrome, which is not what mesonart does: their header
          // stays white while the panel is open. Go opaque for the duration.
          isAllArtOpen
            ? 'bg-background'
            : 'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60'
        )}
      >
        <div className="container-wide">
        {/* The compact bar. Wordmark + actions only — the pages row moved out
            below it (mesonart puts nav under the wordmark line, not beside
            it), which is also what frees this row to carry more links.
            `md:justify-end` because the wordmark is absolute at that width, so
            the actions cluster is the only child left in flow. */}
        <div className="relative flex h-16 items-center justify-between md:justify-end">
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
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Search"
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <Search className="h-5 w-5" />
            </button>
            {/* Wishlist. Public, like the list itself — a guest's saves are
                real and live in localStorage until they sign in (#477). */}
            <Link
              to="/wishlist"
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
            <button
              type="button"
              onClick={openCartDrawer}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={`Shopping cart${displayCartCount > 0 ? `, ${displayCartCount} items` : ''}`}
            >
              <ShoppingCart className="h-5 w-5" />
              {displayCartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {displayCartCount > 99 ? '99+' : displayCartCount}
                </span>
              )}
            </button>
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
            <button
              type="button"
              onClick={openCartDrawer}
              className="relative flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={`Shopping cart${displayCartCount > 0 ? `, ${displayCartCount} items` : ''}`}
            >
              <ShoppingCart className="h-5 w-5" />
              {displayCartCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                  {displayCartCount > 99 ? '99+' : displayCartCount}
                </span>
              )}
            </button>
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

      {/* Sibling of <header>, not a child: the header sets backdrop-blur,
          which establishes a containing block and collapses a nested fixed
          overlay to zero height (#348). */}
      <SearchDrawer
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />

      {/* The mega panel's scrim (#476). Sibling of <header> for the same
          reason the drawer's is — see the note on the state above.
          `z-40` puts it over the announcement bar and the page while the
          nav rows, which come later at the same level, and the header at
          z-50 keep painting above it. Pointer-events off, so moving the
          pointer out of the panel still closes it. */}
      <div
        aria-hidden="true"
        data-testid="all-art-mega-scrim"
        className={cn(
          'pointer-events-none fixed inset-0 z-40 bg-black/30 transition-opacity duration-500 motion-reduce:transition-none',
          isAllArtOpen ? 'opacity-100' : 'invisible opacity-0'
        )}
        style={{ transitionTimingFunction: 'cubic-bezier(0.6, 0, 0.4, 1)' }}
      />

      {/* Nav rows 1 and 2 — pages, then styles.
       *
       * Both live BELOW the wordmark line, the way mesonart stacks them, not
       * beside it. Row 1 used to share the 64px bar with the wordmark and the
       * cart, which capped it at four links; a row of its own is what makes
       * room for the rest of the page inventory (§3.5 of the parity analysis).
       *
       * OUTSIDE <header> on purpose. The header is `sticky top-0` and the
       * collection toolbar offsets against `HEADER_HEIGHT_CLASS` — if these
       * rows were inside the sticky box the header would stand ~140px tall and
       * swallow the toolbar (#401). Here they stick on their own account and
       * the sticky box stays one row.
       *
       * `sticky top-16` rather than plain flow (#421): a row that has scrolled
       * away can only come back at the top of the page, and the whole point is
       * that scrolling up returns it mid-grid. At scroll 0 the natural offset
       * is already 64px, so pinning changes nothing there.
       *
       * Collapsed the block translates up behind the header (z-40 under the
       * header's z-50) and goes `invisible`, which is what drops both rows'
       * links out of the tab order.
       *
       * Revealed it does not cover what is below it: the wrapper's measured
       * height — both rows, whatever they currently are — goes out as
       * `--chrome-offset` and the collection toolbar moves down by the same
       * amount, in the same 200ms. Measuring the wrapper rather than one row
       * is what keeps a second row from needing a second number. */}
      <div
        ref={navRowsRef}
        className={cn(
          'sticky top-16 z-40 hidden border-b border-border bg-background transition-[transform,opacity] duration-200 motion-reduce:transition-none md:block',
          isNavRevealed
            ? 'translate-y-0 opacity-100'
            : 'invisible -translate-y-full opacity-0'
        )}
      >
        {/* Nav row 1 — pages. Centred under the wordmark. */}
        <nav
          aria-label="Pages"
          data-testid="pages-nav"
          data-revealed={isNavRevealed}
          className="border-b border-border/60"
        >
          <div className="container-wide">
            <ul className="scrollbar-hide flex items-center justify-center gap-6 overflow-x-auto py-2">
              <li>
                <NavLink to="/posters" onClick={closeMobileMenu}>
                  Posters
                </NavLink>
              </li>
              {/* Best Sellers and New In are mesonart's own row-1 entries, and
                  neither needs a page of its own: both are `/posters` under a
                  sort the toolbar already offers, so the nav and the sort
                  dropdown cannot disagree about what either word means.
                  `SORT_OPTIONS` carries the same two ids.
                  Passing `search` wholesale also clears any active facets,
                  which is what a top-level nav entry should do. */}
              <li>
                <NavLink
                  to="/posters"
                  search={BEST_SELLERS_SEARCH}
                  onClick={closeMobileMenu}
                >
                  Best Sellers
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/posters"
                  search={NEW_IN_SEARCH}
                  onClick={closeMobileMenu}
                >
                  New In
                </NavLink>
              </li>
              <li>
                <NavLink to="/create" onClick={closeMobileMenu}>
                  <Sparkles className="mr-1.5 h-4 w-4" />
                  Create
                </NavLink>
              </li>
              <li>
                <NavLink to="/gallery" onClick={closeMobileMenu}>
                  Gallery
                </NavLink>
              </li>
              {/* Reviews is a destination on mesonart, not a PDP-only tab:
                  the catalogue's reviews are readable without first picking a
                  poster. Both nav trees carry it — see the mobile drawer
                  below, which is a separate list and the usual thing to
                  forget. */}
              <li>
                <NavLink to="/reviews" onClick={closeMobileMenu}>
                  Reviews
                </NavLink>
              </li>
              <li>
                <NavLink to="/about" onClick={closeMobileMenu}>
                  About
                </NavLink>
              </li>
            </ul>
          </div>
        </nav>

        {/* Nav row 2 — styles.
         *
         * Generated from STYLE_OPTIONS in @chobii/shared, the same list the
         * schema, the API validation, the seed and the filter sidebar read.
         * Twelve hardcoded links here would restart the drift #395 ended.
         *
         * Scrolls rather than wraps: twelve links overflow a laptop, and three
         * wrapped lines of nav pushes the page content below the fold. */}
        <nav
          aria-label="Shop by style"
          data-testid="styles-nav"
          data-revealed={isNavRevealed}
          // `relative` so the All Art panel's `absolute left-0 top-full`
          // resolves against this row — full width, dropping from under it.
          className="relative transition-[transform,opacity] duration-200 motion-reduce:transition-none"
        >
          <div className="container-wide">
            <ul className="scrollbar-hide flex items-center gap-6 overflow-x-auto py-2">
              {/* Not a link any more but a door: All Art opens the whole
                  filter vocabulary as a panel, the way mesonart's does
                  (#476). `static` so the panel measures against the row
                  rather than this list item. Clicking it still lands on an
                  unfiltered /posters. */}
              <li className="static">
                <AllArtMegaMenu
                  onOpenChange={setIsAllArtOpen}
                  onNavigate={closeMobileMenu}
                />
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
      </div>

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
              <MobileNavLink
                to="/posters"
                search={BEST_SELLERS_SEARCH}
                onClick={closeMobileMenu}
              >
                Best Sellers
              </MobileNavLink>
              <MobileNavLink
                to="/posters"
                search={NEW_IN_SEARCH}
                onClick={closeMobileMenu}
              >
                New In
              </MobileNavLink>
              <MobileNavLink to="/create" onClick={closeMobileMenu}>
                <Sparkles className="mr-2 h-4 w-4" />
                Create with AI
              </MobileNavLink>
              <MobileNavLink to="/gallery" onClick={closeMobileMenu}>
                Gallery
              </MobileNavLink>
              {/* The mobile half of the pair added above. */}
              <MobileNavLink to="/reviews" onClick={closeMobileMenu}>
                Reviews
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
                <MobileNavLink to="/wishlist" onClick={closeMobileMenu}>
                  <Heart className="mr-2 inline h-4 w-4" />
                  Wishlist
                </MobileNavLink>
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
      className="flex items-center whitespace-nowrap text-nav font-medium text-muted-foreground transition-colors hover:text-foreground"
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
