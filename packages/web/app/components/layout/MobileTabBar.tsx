import { Link, useRouteContext } from '@tanstack/react-router'
import { LayoutGrid, Search } from 'lucide-react'
import { cn } from '~/lib/utils'
import { useCartHydration, useCartItemCount, useCartStore } from '~/stores/cart'

/**
 * The bottom tab bar's own height, and the bottom padding every page owes it.
 *
 * Two numbers that must agree, the way `HEADER_HEIGHT_CLASS` and the collection
 * toolbar's `sticky top-16` do. The bar is `fixed`, so it reserves no space of
 * its own: without this padding on the page shell it lands on top of the last
 * band of every page — the footer's bottom row is the first casualty.
 *
 * Imported by `__root.tsx` and applied to the page shell rather than hardcoded
 * there, so growing the bar moves the padding with it. `lg:pb-0` because the
 * bar itself is `lg:hidden` — see BAR_HEIGHT below.
 *
 * 3.875rem = 62px, measured off mesonart's own bar at 390px wide (bar top at
 * y=782 of an 844px viewport). `env(safe-area-inset-bottom)` is the notch
 * allowance the bar adds under its own content; it is 0 in a desktop browser
 * and non-zero on an iPhone, so the padding has to carry the same term.
 */
export const MOBILE_TAB_BAR_PADDING_CLASS =
  'pb-[calc(3.875rem+env(safe-area-inset-bottom))] lg:pb-0'

/**
 * Where a page's own fixed bottom bar has to sit so it stacks ON TOP of the
 * tab bar rather than painting over it.
 *
 * Same two numbers as MOBILE_TAB_BAR_PADDING_CLASS, so they move together.
 * No breakpoint prefix on purpose: the only consumer today, /create's generate
 * bar, is `md:hidden`, and this bar is `lg:hidden` — the tab bar is always
 * under it whenever it renders.
 *
 * Do NOT solve this by raising the tab bar above z-40. See the z-30 note below:
 * every scrim in the app is z-40 and every panel z-50, and a tab bar over an
 * open drawer offers taps that go nowhere.
 */
export const MOBILE_TAB_BAR_OFFSET_CLASS =
  'bottom-[calc(3.875rem+env(safe-area-inset-bottom))]'

/**
 * The bar's content row. Kept next to the padding class above, not inlined.
 *
 * 61 and not 62: the hairline top border is the 62nd pixel, and border-box
 * height on the row would not include it. Measured, the bar's top edge lands on
 * 782 of an 844px viewport either way — but at 62 the footer's last pixel goes
 * under the border.
 */
const BAR_HEIGHT = 'h-[61px]'

/**
 * Mobile primary navigation — the bottom tab bar (#542).
 *
 * Six destinations, thin line icon over a small label, pinned to the bottom of
 * the viewport on phones and tablets and gone from `lg` up, where the header's
 * own action cluster and nav rows already carry all six.
 *
 * ## It does not own any drawer state
 *
 * Menu and Search are the header's state, not ours — `Header` renders this
 * component as a sibling of `<header>` and hands down its own handlers, so the
 * hamburger and the tab both drive one drawer. Duplicating the state here is
 * what would let the header's Search and this one be open at the same time.
 * Cart is the exception only because it was already global: `CartDrawer` is
 * mounted in `__root` and reads `openDrawer` off the store (#460), so this
 * calls the same action every other surface does.
 *
 * ## Why z-30
 *
 * Every overlay in the app sits at z-40 (scrims) / z-50 (panels): the cart
 * drawer, the search drawer, the mobile menu, the mega-menu scrim and
 * `JoinGalleryModal`. A tab bar at z-40+ would paint over an open drawer's own
 * scrim and offer taps that go nowhere. z-30 puts it above page content and
 * under all of them, which is also where `ReviewToast` sits — that one clears
 * the bar with `bottom-24` rather than fighting it for the layer.
 */
export interface MobileTabBarProps {
  /** Opens the header's mobile menu drawer. */
  onOpenMenu: () => void
  /** Whether that drawer is currently open, for `aria-expanded`. */
  isMenuOpen: boolean
  /** Opens the header's `SearchDrawer`. */
  onOpenSearch: () => void
  /** Controls bottom bar visibility during scroll transitions. */
  isVisible?: boolean
}

export function MobileTabBar({
  onOpenMenu,
  isMenuOpen,
  onOpenSearch,
  isVisible = true,
}: MobileTabBarProps) {
  const isHydrated = useCartHydration()
  const cartItemCount = useCartItemCount()
  const openCartDrawer = useCartStore((state) => state.openDrawer)

  // Session comes from the root route's beforeLoad, the same lookup the header
  // makes. Signed out, Account points at the login page directly: /account is
  // behind the _authed guard, which would bounce there anyway — this just
  // spares the round trip and pre-fills the redirect back.
  const { session } = useRouteContext({ from: '__root__' }) as {
    session?: { user?: unknown } | null
  }
  const isSignedIn = Boolean(session?.user)

  // Only show the count after hydration, or the server pass and the first
  // client render disagree (#498).
  const displayCartCount = isHydrated ? cartItemCount : 0

  return (
    <nav
      aria-label="Primary"
      data-testid="mobile-tab-bar"
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 lg:hidden transition-transform duration-300 ease-in-out',
        isVisible || isMenuOpen ? 'translate-y-0' : 'translate-y-full'
      )}
    >
      <ul
        className={cn(
          'grid grid-cols-6',
          // Rounded top corners and a hairline, both measured: the bar's white
          // surface curves in over ~13px at each top edge and meets the page
          // with a single light line, no drop shadow. A border-top follows the
          // radius, so the two do not have to be reconciled by hand.
          'rounded-t-[14px] border-t border-border bg-background',
          // The notch. Padding rather than height so the content row stays
          // 61px whatever the device adds underneath it.
          'pb-[env(safe-area-inset-bottom)]'
        )}
      >
        <li>
          <TabLink to="/" label="Home" activeExact>
            <HomeIcon />
          </TabLink>
        </li>
        <li>
          <TabButton
            label="Menu"
            onClick={onOpenMenu}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
          >
            <MenuIcon />
          </TabButton>
        </li>
        <li>
          <TabButton label="Search" onClick={onOpenSearch}>
            <Search className={ICON_CLASS} strokeWidth={ICON_STROKE} />
          </TabButton>
        </li>
        <li>
          <TabLink to="/posters" label="Shop">
            <LayoutGrid className={ICON_CLASS} strokeWidth={ICON_STROKE} />
          </TabLink>
        </li>
        <li>
          <TabButton
            label="Cart"
            onClick={openCartDrawer}
            badge={displayCartCount}
          >
            <CartIcon />
          </TabButton>
        </li>
        <li>
          {isSignedIn ? (
            <TabLink to="/account" label="Account">
              <PersonIcon />
            </TabLink>
          ) : (
            <TabLink
              to="/auth/login"
              search={{ redirect: '/account' }}
              label="Account"
            >
              <PersonIcon />
            </TabLink>
          )}
        </li>
      </ul>
    </nav>
  )
}

/**
 * Measured off the bar: an 18px glyph in a 22px box, 1.5px stroke, over a 10px
 * label with 5px between them. The label really is 10px — cap height on the
 * reference is 7px, and Poppins' cap height is 0.7em.
 */
const ICON_CLASS = 'h-[22px] w-[22px]'
const ICON_STROKE = 1.5

const ITEM_CLASS = cn(
  'flex w-full flex-col items-center justify-center gap-[5px]',
  BAR_HEIGHT,
  'text-[10px] leading-none text-foreground'
)

function TabLink({
  to,
  search,
  label,
  activeExact,
  children,
}: {
  to: string
  search?: Record<string, unknown>
  label: string
  /** `/` matches every route as a prefix; only Home needs the exact test. */
  activeExact?: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      search={search}
      activeOptions={activeExact ? { exact: true } : undefined}
      className={ITEM_CLASS}
    >
      {children}
      <span>{label}</span>
    </Link>
  )
}

function TabButton({
  label,
  onClick,
  badge,
  children,
  ...rest
}: {
  label: string
  onClick: () => void
  /** Cart count. Rendered only when non-zero — an empty cart shows no dot. */
  badge?: number
  children: React.ReactNode
} & Omit<
  React.ComponentPropsWithoutRef<'button'>,
  'onClick' | 'children' | 'className' | 'type'
>) {
  return (
    <button type="button" onClick={onClick} className={ITEM_CLASS} {...rest}>
      <span className="relative">
        {children}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-medium leading-none text-primary-foreground">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>
      <span>{label}</span>
    </button>
  )
}

/**
 * The four icons lucide has no match for.
 *
 * All four are traced off the reference bar at 4x rather than eyeballed: each
 * glyph fills an 18×18 box inside the 22px icon box, which is what keeps the
 * six of them the same visual weight. Substituting the nearest lucide icon is
 * what made three of them wrong on the first pass — `House` has a pitched roof,
 * `Menu` has three equal rules, `User` is 4px narrower across the shoulders and
 * `ShoppingCart` overflows the box by a pixel each way.
 */
function TabIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={ICON_CLASS}
    >
      {children}
    </svg>
  )
}

/** A flat-sided arch with a rounded top and a small arched doorway. */
function HomeIcon() {
  return (
    <TabIcon>
      <path d="M3 18.2V11C3 7.6 7.2 3 12 3s9 4.6 9 8v7.2c0 1.6-1.4 2.8-3.6 2.8H14.5v-4.9a2.75 2.75 0 0 0-5.5 0V21H6.6C4.4 21 3 19.8 3 18.2Z" />
    </TabIcon>
  )
}

/** Three left-aligned rules — long, short, medium — 5px apart. */
function MenuIcon() {
  return (
    <TabIcon>
      <path d="M4.7 6.8h14.6" />
      <path d="M4.7 12h6.5" />
      <path d="M4.7 17.2h10.9" />
    </TabIcon>
  )
}

/** A hook, a trapezoid basket, two wheels. */
function CartIcon() {
  return (
    <TabIcon>
      <path d="M3 3c1.5 0 2.5.9 2.6 2.2" />
      <path d="M5.6 5.2h15.2l-2.3 9.6H9.8Z" />
      <circle cx="10.9" cy="19.6" r="1.4" />
      <circle cx="18" cy="19.6" r="1.4" />
    </TabIcon>
  )
}

/** A head over a wide open shoulder arc — no closed base, no torso box. */
function PersonIcon() {
  return (
    <TabIcon>
      <circle cx="12" cy="7.4" r="4.6" />
      <path d="M3.2 21a10 10 0 0 1 17.6 0" />
    </TabIcon>
  )
}
