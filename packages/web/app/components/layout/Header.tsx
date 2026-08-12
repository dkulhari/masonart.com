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
import { useMobileNavScroll } from '~/hooks/useMobileNavScroll'
import { useChromeOffset } from '~/hooks/useChromeOffset'
import { useActivePromotion } from '~/hooks/useActivePromotion'
import type { ActivePromotion } from '~/components/layout/SaleStrip'
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
import { MobileTabBar } from './MobileTabBar'

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
 * A mobile bar icon's hit box — 35x44, measured off theirs (#596).
 *
 * Narrower than it is tall on purpose: 44px is the touch-target floor, but four
 * 44-wide boxes plus their gaps eat into the centred wordmark on a 390px
 * screen. Height carries the target, width carries the layout.
 *
 * No hover tint like the desktop cluster's: there is no pointer to hover with,
 * and a rounded-full plate under a 35-wide box is an oval.
 */
const MOBILE_ICON_CLASS =
  'flex h-11 w-[35px] items-center justify-center text-foreground'

/** Cart and wishlist counts, sized for the smaller box above. */
const MOBILE_BADGE_CLASS =
  'absolute right-0 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground'

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

  // One lookup, both nav trees. Absent promotion, absent link — see
  // SaleNavLink at the bottom of this file.
  const { promotion: activePromotion } = useActivePromotion()

  // Scroll down leaves the compact bar — wordmark and actions; scroll up
  // brings both nav rows back wherever the page happens to be (#421).
  const isNavRevealed = useNavReveal()

  // Mobile is position, not direction (#597): the top bar owns the top of the
  // page and the tab bar owns the rest. Separate hook because it is a separate
  // breakpoint — the rows above are md:block, the transform below is
  // md:translate-y-0.
  const { isTopMenuVisible, isBottomMenuVisible } = useMobileNavScroll()

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
          'sticky top-0 z-50 w-full border-b border-border transition-transform duration-300 ease-in-out md:translate-y-0',
          // The bar is translucent so the page shows through as it scrolls
          // under — but a translucent bar over the mega panel's scrim reads
          // as dimmed chrome, which is not what mesonart does: their header
          // stays white while the panel is open. Go opaque for the duration.
          isAllArtOpen
            ? 'bg-background'
            : 'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
          isTopMenuVisible || isMobileMenuOpen || isSearchOpen || isAllArtOpen
            ? 'translate-y-0 shadow-sm'
            : '-translate-y-full'
        )}
      >
        <div className="container-wide">
        {/* The compact bar. Wordmark + actions only — the pages row moved out
            below it (mesonart puts nav under the wordmark line, not beside
            it), which is also what frees this row to carry more links.

            56px on a phone, 64 from md up. Only the mobile row shrinks:
            `HEADER_HEIGHT_CLASS` is the number the collection toolbar pins
            against, and nothing sticky sits under this bar below md, so the
            two heights do not have to be one number (#596).

            `md:justify-end` because the wordmark is out of flow at every
            width: on mobile the two icon clusters are the flow children and
            justify-between separates them, but from md the desktop cluster is
            the only child left and justify-between would strand it at the left
            edge. */}
        <div className="relative flex h-14 items-center justify-between md:h-16 md:justify-end">
          {/* Mobile left cluster — [hamburger][search] (#596).
           *
           * First in the DOM as well as on screen, so the tab order runs
           * menu, search, wordmark, wishlist, cart the way it reads. */}
          <div
            data-testid="mobile-bar-left"
            className="flex items-center md:hidden"
          >
            <button
              type="button"
              onClick={toggleMobileMenu}
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-nav"
              className={MOBILE_ICON_CLASS}
            >
              {isMobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Search"
              className={MOBILE_ICON_CLASS}
            >
              <Search className="h-5 w-5" />
            </button>
          </div>

          {/* Wordmark.
           *
           * Absolutely centred at EVERY width, the way theirs is — it stays
           * centred regardless of how wide the clusters either side of it
           * happen to be, and a mobile bar with icons on both sides has no
           * other way to keep it on the middle of the screen. */}
          <Link
            to="/"
            className="absolute left-1/2 flex -translate-x-1/2 items-center space-x-2"
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

          {/* Mobile right cluster — [wishlist][cart] (#596).
           *
           * No Account icon: theirs has none up here either, and ours already
           * carries it twice below — the dock's sixth tab and the drawer
           * footer. A fifth icon in a 56px bar buys nothing and crowds the
           * wordmark. */}
          <div
            data-testid="mobile-bar-right"
            className="flex items-center md:hidden"
          >
            <Link
              to="/wishlist"
              onClick={closeMobileMenu}
              className={cn(MOBILE_ICON_CLASS, 'relative')}
              aria-label={`Wishlist${displayWishlistCount > 0 ? `, ${displayWishlistCount} items` : ''}`}
            >
              <Heart className="h-5 w-5" />
              {displayWishlistCount > 0 && (
                <span className={MOBILE_BADGE_CLASS}>
                  {displayWishlistCount > 99 ? '99+' : displayWishlistCount}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={openCartDrawer}
              className={cn(MOBILE_ICON_CLASS, 'relative')}
              aria-label={`Shopping cart${displayCartCount > 0 ? `, ${displayCartCount} items` : ''}`}
            >
              <ShoppingCart className="h-5 w-5" />
              {displayCartCount > 0 && (
                <span className={MOBILE_BADGE_CLASS}>
                  {displayCartCount > 99 ? '99+' : displayCartCount}
                </span>
              )}
            </button>
          </div>
          </div>
        </div>

      </header>

      {/* The mobile bottom tab bar (#542).
       *
       * Rendered from here rather than from __root so it can drive the two
       * drawers the header already owns — the mobile menu and SearchDrawer are
       * this component's `useState`, and a bar mounted at the root would have
       * had to duplicate both. Cart it opens through the store, like every
       * other surface does.
       *
       * A SIBLING of <header> for the same reason SearchDrawer is: the header
       * sets backdrop-blur, and a backdrop-filter is a containing block for
       * fixed descendants — nested, a `fixed bottom-0` bar would pin to the
       * bottom of the 64px header instead of the viewport (#348).
       *
       * The page-shell padding that keeps it off the last band of every page
       * is MOBILE_TAB_BAR_PADDING_CLASS, applied in __root. */}
      <MobileTabBar
        onOpenMenu={toggleMobileMenu}
        isMenuOpen={isMobileMenuOpen}
        onOpenSearch={() => setIsSearchOpen(true)}
        isVisible={isBottomMenuVisible}
      />

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
         * Wraps rather than scrolls. A sideways-scrolling row hides its own
         * tail: on a narrow window the last styles are simply off-screen with
         * nothing to say so, and `scrollbar-hide` removed even the scrollbar
         * that would have hinted at them. Wrapped, every style stays reachable
         * at every width, and the rows the reveal pushes down are measured by
         * useChromeOffset rather than assumed — so a second line moves the
         * collection toolbar with it instead of landing on top of it (#401). */}
        <nav
          aria-label="Shop by style"
          data-testid="styles-nav"
          data-revealed={isNavRevealed}
          // `relative` so the All Art panel's `absolute left-0 top-full`
          // resolves against this row — full width, dropping from under it.
          className="relative transition-[transform,opacity] duration-200 motion-reduce:transition-none"
        >
          <div className="container-wide">
            {/* Centred so a part-full wrapped line sits under the middle of
                the row rather than hanging off the left edge.

                Horizontal gap is theirs already — 24px, measured on their
                `header__menu`. What theirs has and ours did not is vertical
                room: their nav row stands 96px tall with 24px under each
                link, against our 8px of padding. py-4 + gap-y-4 gives the
                wrapped lines air instead of stacking them. */}
            <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-3 py-3 lg:gap-x-6 lg:gap-y-4 lg:py-4">
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
                    // Near-black, like theirs (rgb(23,23,23)) — and unlike the
                    // pages row, this one has no active state, so full
                    // foreground costs no signal. Hover lightens instead.
                    className="whitespace-nowrap text-nav text-foreground transition-colors hover:text-foreground/70"
                  >
                    {style.label}
                  </Link>
                </li>
              ))}
              {/* Appended after the generated list, never inside it: row 2 is
                  STYLE_OPTIONS and a Sale entry woven into that map would mean
                  either a fake style id or a special case in the loop. It is
                  also the only red thing in the row, which is the whole point
                  — see the --sale token. */}
              <SaleNavLink promotion={activePromotion} />
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
      {/* Scrim. Full viewport, not `top-14`: the panel it dims runs the whole
          height now, so a scrim that starts under the bar would leave the one
          band the drawer does not cover undimmed (#598). */}
      <div
        data-testid="mobile-nav-scrim"
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity duration-[600ms] motion-reduce:transition-none md:hidden',
          isMobileMenuOpen ? 'opacity-100' : 'invisible opacity-0'
        )}
        onClick={closeMobileMenu}
        aria-hidden="true"
      />

      <nav
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label="Site menu"
        data-testid="mobile-nav-drawer"
        // Mounted whether open or not. Rendered only while open — which is
        // what this was — there is no closed state to transition FROM, so
        // the panel appeared at its destination and the slide never ran.
        //
        // `invisible` is what keeps the closed panel's links out of the tab
        // order, the same call the desktop nav rows make. It also costs the
        // exit animation: visibility flips at once rather than easing. The
        // enter is the one that reads as motion, and a focusable menu behind
        // a closed drawer is the worse trade.
        //
        // z-50 and last in the tree: the header is `sticky z-50`, so an equal
        // z that comes later is what paints the full-height panel over it.
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-full max-w-[576px] flex-col bg-background shadow-xl transition-transform duration-[600ms] motion-reduce:transition-none md:hidden',
          isMobileMenuOpen ? 'translate-x-0' : 'invisible -translate-x-full'
        )}
        // Theirs, measured: transform .6s cubic-bezier(0.7, 0, 0.2, 1) —
        // fast off the mark, long settle. No Tailwind ease- matches it.
        style={{ transitionTimingFunction: 'cubic-bezier(0.7, 0, 0.2, 1)' }}
      >
        {/* Panel head — drag-handle pill centred, close at the right, as on
            theirs. The pill is decoration: the drawer has no drag gesture,
            and announcing a grabber that does nothing is worse than silence. */}
        <div className="relative flex h-14 shrink-0 items-center justify-end px-2">
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-3 h-1 w-10 -translate-x-1/2 rounded-full bg-border"
          />
          <button
            type="button"
            onClick={closeMobileMenu}
            className={MOBILE_ICON_CLASS}
            // Not "Close menu": the dock's toggle already answers to that
            // name while the drawer is open, and two buttons with one name
            // is ambiguous to a screen reader and to `getByRole`.
            aria-label="Close site menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* The list scrolls; the head above and the footer below stay put. */}
        <div className="flex-1 overflow-y-auto pb-4">
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
              {/* The drawer is a second, independent nav tree — patching only
                  the desktop row is the classic miss, and a phone would have
                  no way to reach the sale at all. */}
              <SaleMobileNavLink
                promotion={activePromotion}
                onClick={closeMobileMenu}
              />
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
        </div>
      </nav>
    </>
  )
}

/**
 * The red Sale link at the end of nav row 2 (#437).
 *
 * ## Absent, not disabled
 *
 * `null` renders nothing at all — no greyed entry, no placeholder. A Sale link
 * that outlives its promotion sends shoppers to a page with nothing on it, and
 * a greyed one advertises a discount that is not available. `undefined` — the
 * lookup still out — renders nothing for the same reason in the other
 * direction: flashing the link and withdrawing it is worse than showing it a
 * beat late.
 *
 * ## Why red
 *
 * `--sale` is the only warm colour left in the storefront and is reserved for
 * sale prices and sale tags. It reads as "discount" precisely because nothing
 * else on the page is red — which is also why this is the one link in the row
 * that does not take the near-black the styles take.
 */
export interface SaleNavLinkProps {
  /** `undefined` while unknown, `null` once known to be absent. */
  promotion?: ActivePromotion | null
}

export function SaleNavLink({ promotion }: SaleNavLinkProps) {
  if (!promotion) return null

  return (
    <li>
      <Link
        to="/sale"
        data-testid="sale-nav-link"
        className="whitespace-nowrap text-nav font-medium text-sale transition-colors hover:text-sale/70"
      >
        Sale
      </Link>
    </li>
  )
}

/** The same link in the mobile drawer, at the drawer's touch target size. */
export function SaleMobileNavLink({
  promotion,
  onClick,
}: SaleNavLinkProps & { onClick?: () => void }) {
  if (!promotion) return null

  return (
    <Link
      to="/sale"
      onClick={onClick}
      data-testid="sale-mobile-nav-link"
      className="flex items-center px-2 py-2 text-base font-medium text-sale transition-colors hover:text-sale/70"
    >
      Sale
    </Link>
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
