import { Link, useRouteContext } from '@tanstack/react-router'
import {
  ChevronLeft,
  ChevronRight,
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
import { Button, buttonVariants } from '~/components/ui/Button'
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
import { AllArtMegaMenu, MEGA_COLUMNS } from './AllArtMegaMenu'
import { SOCIAL_LINKS } from '~/lib/socialLinks'
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
 * One drawer row, at mesonart's measured scale.
 *
 * Measured on their `menu-drawer`: 24px, weight 300, letter-spacing -0.6px,
 * colour rgb(23,23,23), padding 10px 0. Ours was 16px muted — a phone menu
 * reading like a settings list rather than the shop's own type.
 *
 * A constant rather than a class on `MobileNavLink` alone: All Art and the
 * Back control are buttons, not links, and they belong on the same rhythm.
 */
/**
 * The drawer's motion, as inline style rather than Tailwind utilities.
 *
 * mesonart's, measured: `transform .6s cubic-bezier(0.7, 0, 0.2, 1)` — fast
 * off the mark, long settle. The same 600ms and the same curve the cart drawer
 * and the mobile facet sheet run on; `--ease-drawer` is that curve.
 *
 * WHY NOT `duration-[600ms]`
 *
 * Because it silently did nothing. The class sat in the markup and no rule was
 * ever generated for it — `.duration-100/200/300/500/700` exist in the built
 * CSS and no arbitrary-value duration does — so the panel inherited the 150ms
 * that `transition-transform` ships with and slid in four times too fast
 * against the two drawers it is supposed to match. An inline duration cannot
 * be dropped by a scanner.
 *
 * `motion-reduce:transition-none` still wins: it sets `transition-property:
 * none`, which no duration can revive.
 */
const DRAWER_MOTION = {
  transitionDuration: '600ms',
  transitionTimingFunction: 'var(--ease-drawer)',
} as const

const MOBILE_DRAWER_LINK_CLASS =
  'flex w-full items-center py-2.5 text-2xl font-light tracking-[-0.6px] text-foreground transition-colors hover:text-foreground/70'

/**
 * The account control in the drawer's pinned footer (#600).
 *
 * A pill, as theirs is, and not on the 24px row rhythm above it: the footer is
 * a different register — one action, not another destination in the list. Full
 * width because it is the only control on its line.
 *
 * The storefront's own outline pill rather than a hand-rolled one: this was a
 * bordered div with a flat `hover:bg-foreground` swap, so the drawer's only
 * action animated differently from every other button on the site — including
 * the cart drawer's own View Cart directly opposite it. `buttonVariants` brings
 * the measured wipe and the 56px `pill` scale with it.
 */
const MOBILE_DRAWER_ACTION_CLASS = cn(
  buttonVariants({ variant: 'outline', size: 'pill' }),
  'w-full'
)

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

  // All Art's second panel inside the drawer (#599). Closing the drawer
  // resets it, so reopening never lands mid-tree on a panel the user left
  // behind two navigations ago.
  const [isMobileAllArtOpen, setIsMobileAllArtOpen] = useState(false)

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
  // Which of the two the drawer footer's account control is (#600). Read off
  // the same session MobileTabBar reads, so the dock and the drawer cannot
  // send the same visitor to two different places.
  const isSignedIn = Boolean(session?.user)
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
    setIsMobileAllArtOpen(false)
  }

  // Lock body scroll and wire Escape while the drawer is open, so the page
  // behind it cannot scroll away under the user's thumb (#348). Same approach
  // as MobileFiltersSheet on /posters.
  useEffect(() => {
    if (!isMobileMenuOpen) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Escape unwinds one level at a time: out of All Art first, out of the
    // drawer only from the top level. Closing both at once loses the place
    // the user was in for a key that means "back".
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isMobileAllArtOpen) {
          setIsMobileAllArtOpen(false)
          return
        }
        setIsMobileMenuOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isMobileMenuOpen, isMobileAllArtOpen])

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
          // Tint, timing and curve are the cart drawer's backdrop, not a
          // second opinion: both are the same gesture on the same site, and
          // bg-black/50 against the cart's bg-foreground/70 read as two
          // different scrims depending on which edge you opened.
          'fixed inset-0 z-40 bg-foreground/70 transition-opacity motion-reduce:transition-none md:hidden',
          isMobileMenuOpen ? 'opacity-100' : 'invisible opacity-0'
        )}
        style={DRAWER_MOTION}
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
          'fixed inset-y-0 left-0 z-50 flex w-full max-w-[576px] flex-col bg-background shadow-2xl transition-transform motion-reduce:transition-none md:hidden',
          // The cart drawer's panel treatment, mirrored: same 576px cap, same
          // shadow, same 34px radius on the page-facing edge and square where
          // it meets the viewport — theirs is `0 34px 34px 0` because this is
          // the `drawer--start` one. overflow-hidden so the scrolling list
          // cannot square the corners off as it passes under them.
          'overflow-hidden rounded-r-[var(--drawer-radius)]',
          isMobileMenuOpen ? 'translate-x-0' : 'invisible -translate-x-full'
        )}
        style={DRAWER_MOTION}
      >
        {/* Panel head — drag-handle pill centred, close at the right, as on
            theirs. The pill is decoration: the drawer has no drag gesture,
            and announcing a grabber that does nothing is worse than silence. */}
        <div className="relative flex shrink-0 items-center justify-end border-b border-border px-4 py-4">
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-3 h-1 w-10 -translate-x-1/2 rounded-full bg-border"
          />
          {/*
            The cart drawer's close control, exactly: the outline pill's wipe
            on a 48px circle. This was a bare 35x44 icon box — the mobile BAR's
            affordance, borrowed into a modal surface where the cart, the
            Quickview and this drawer otherwise all close the same way.
          */}
          <Button
            variant="outline"
            onClick={closeMobileMenu}
            className="h-12 w-12 shrink-0 rounded-full p-0"
            // Not "Close menu": the dock's toggle already answers to that
            // name while the drawer is open, and two buttons with one name
            // is ambiguous to a screen reader and to `getByRole`.
            aria-label="Close site menu"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* The list scrolls; the head above and the footer below stay put.
            `relative` so the All Art panel, which covers exactly this area,
            measures against it rather than the whole drawer — the head stays
            reachable while the second panel is up. */}
        <div className="relative flex-1 overflow-hidden">
          <div
            data-testid="mobile-nav-list"
            className="h-full overflow-y-auto pb-4"
          >
            <div className="container-wide flex flex-col">
              {/* All Art is a door, not a link — the same call the desktop
                  styles row makes (#476), except the phone gets the
                  vocabulary as a second sliding panel rather than a sheet. */}
              <button
                type="button"
                data-testid="mobile-nav-all-art"
                onClick={() => setIsMobileAllArtOpen(true)}
                aria-expanded={isMobileAllArtOpen}
                className={cn(MOBILE_DRAWER_LINK_CLASS, 'justify-between')}
              >
                All Art
                <ChevronRight className="h-5 w-5" />
              </button>
              <MobileNavLink
                to="/posters"
                search={BEST_SELLERS_SEARCH}
                onClick={closeMobileMenu}
              >
                Best Sellers
              </MobileNavLink>
              {/* Theirs says "New Arrivals". Ours says New In in the desktop
                  row, in the mega panel and in SORT_OPTIONS — one site
                  disagreeing with itself is the worse of the two. */}
              <MobileNavLink
                to="/posters"
                search={NEW_IN_SEARCH}
                onClick={closeMobileMenu}
              >
                New In
              </MobileNavLink>
              {/* The twelve styles, generated — none of them were reachable
                  on a phone before. From STYLE_OPTIONS for the reason nav row
                  2 is: twelve hardcoded links restart the drift #395 closed. */}
              {STYLE_OPTIONS.map((style) => (
                <MobileNavLink
                  key={style.id}
                  to="/posters"
                  search={{ styles: style.id }}
                  onClick={closeMobileMenu}
                >
                  {style.label}
                </MobileNavLink>
              ))}
              {/* Ours, not theirs — /create and /gallery have no mesonart
                  counterpart, and a phone is where the drawer is the only
                  way to either. */}
              <MobileNavLink to="/create" onClick={closeMobileMenu}>
                <Sparkles className="mr-2 h-5 w-5" />
                Create with AI
              </MobileNavLink>
              <MobileNavLink to="/gallery" onClick={closeMobileMenu}>
                Gallery
              </MobileNavLink>
              <MobileNavLink to="/reviews" onClick={closeMobileMenu}>
                Reviews
              </MobileNavLink>
              {/* The drawer is a second, independent nav tree — patching only
                  the desktop row is the classic miss, and a phone would have
                  no way to reach the sale at all. */}
              <SaleMobileNavLink
                promotion={activePromotion}
                onClick={closeMobileMenu}
              />
              {/* Theirs also carries Artists, Trade Program and Commission
                  Art. None of the three has a route here, and a nav entry
                  into a 404 is worse than an absent one — they land when the
                  pages do. */}
              <MobileNavLink to="/gift-cards" onClick={closeMobileMenu}>
                Gift Card
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
                  <LayoutDashboard className="mr-2 inline h-5 w-5" />
                  {staffLabel}
                </MobileNavLink>
              )}
              {/* Wishlist stays a row: unlike the account, it has no control
                  in the footer below. */}
              <MobileNavLink to="/wishlist" onClick={closeMobileMenu}>
                <Heart className="mr-2 inline h-5 w-5" />
                Wishlist
              </MobileNavLink>
            </div>
          </div>

          {/* All Art, panel two. Enters from the right over the list, the way
              theirs does, on the drawer's own curve and duration. Fed from
              MEGA_COLUMNS so the phone and the desktop panel cannot end up
              offering different facets. */}
          <div
            data-testid="mobile-nav-all-art-panel"
            aria-label="All Art"
            className={cn(
              'absolute inset-0 flex flex-col bg-background transition-transform motion-reduce:transition-none',
              isMobileAllArtOpen
                ? 'translate-x-0'
                : 'invisible translate-x-full'
            )}
            style={DRAWER_MOTION}
          >
            <div className="container-wide">
              <button
                type="button"
                onClick={() => setIsMobileAllArtOpen(false)}
                className={cn(MOBILE_DRAWER_LINK_CLASS, 'gap-2')}
              >
                <ChevronLeft className="h-5 w-5" />
                Back to menu
              </button>
            </div>
            <div className="flex-1 overflow-y-auto pb-4">
              <div className="container-wide flex flex-col">
                {MEGA_COLUMNS.map((column) => (
                  <div key={column.key} className="py-2">
                    {/* The heading is a destination in its own right where
                        the desktop panel makes it one; elsewhere it is a
                        label for a group with no page, so it stays text. */}
                    {column.headingSearch ? (
                      <MobileNavLink
                        to="/posters"
                        search={column.headingSearch}
                        onClick={closeMobileMenu}
                      >
                        {column.heading}
                      </MobileNavLink>
                    ) : (
                      <p className="py-2.5 text-2xl font-light tracking-[-0.6px] text-foreground">
                        {column.heading}
                      </p>
                    )}
                    {/* The options themselves are one step down: a stack of
                        24px rows would run to five screens of scroll. */}
                    <ul className="flex flex-col pl-4">
                      {column.links.map((link) => (
                        <li key={link.id}>
                          <Link
                            to="/posters"
                            search={link.search}
                            onClick={closeMobileMenu}
                            className="flex py-2 text-base font-light tracking-[-0.4px] text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* The pinned footer (#600).
         *
         * OUTSIDE the scrolling area above, which is what pins it: the links
         * travel under it and the account control stays on screen at the
         * bottom of a twenty-row list.
         *
         * Theirs opens with a country-and-currency row. Deliberately absent
         * here: the storefront prices in one currency only, and a selector
         * with one option is a control that cannot be used.
         *
         * The bar sits above the safe area, not in it — a footer flush to the
         * bottom edge puts the login pill under the home indicator. */}
        <div
          data-testid="mobile-nav-footer"
          className="shrink-0 border-t border-border px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4"
        >
          {/* Signed in it goes to the account area, signed out to login with
              the round trip pre-filled — the same contract the dock's account
              tab keeps, so the two cannot answer the same tap differently. */}
          {isSignedIn ? (
            <Link
              to="/account"
              onClick={closeMobileMenu}
              className={MOBILE_DRAWER_ACTION_CLASS}
            >
              <User className="h-4 w-4" />
              Account
            </Link>
          ) : (
            <Link
              to="/auth/login"
              search={{ redirect: '/account' }}
              onClick={closeMobileMenu}
              className={MOBILE_DRAWER_ACTION_CLASS}
            >
              <User className="h-4 w-4" />
              Log in
            </Link>
          )}

          {/* Same accounts as the page footer, from the same list — see
              ~/lib/socialLinks. Icon-only, so each carries its own name. */}
          <ul className="mt-4 flex items-center gap-2">
            {SOCIAL_LINKS.map(({ id, label, href, Icon }) => (
              <li key={id}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="flex h-11 w-11 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent"
                >
                  <Icon className="h-5 w-5" />
                </a>
              </li>
            ))}
          </ul>
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

/** The same link in the drawer, on the drawer's own 24px rhythm (#599). */
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
      // Everything but the colour comes from the shared row class: this is
      // the one entry that keeps --sale, for the reason SaleNavLink does.
      className="flex w-full items-center py-2.5 text-2xl font-light tracking-[-0.6px] text-sale transition-colors hover:text-sale/70"
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
 * One row of the mobile drawer.
 *
 * Carries `MOBILE_DRAWER_LINK_CLASS` — mesonart's measured 24px/300 at -0.6px
 * tracking — rather than styling each row inline, so the twelve generated
 * styles and the hand-written pages cannot end up on two different scales.
 *
 * No `activeProps`. At full-strength foreground there is nothing left for an
 * active state to say, which is the same call nav row 2 makes; and the drawer
 * closes on navigation, so the row it highlighted is off-screen anyway.
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
      className={MOBILE_DRAWER_LINK_CLASS}
    >
      {children}
    </Link>
  )
}
