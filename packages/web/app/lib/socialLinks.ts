import { Facebook, Instagram, Twitter } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * The storefront's social accounts, in one place (#600).
 *
 * Lifted out of `Footer.tsx` when the mobile drawer grew a footer of its own:
 * two surfaces with two hand-written copies of the hrefs is how a site ends up
 * pointing at different accounts from the top and the bottom of the same page.
 *
 * Three, not mesonart's four. Theirs also lists YouTube and Pinterest; we have
 * no accounts on either, and a link to an account that does not exist is worse
 * than an absent icon — the same call the drawer's inventory makes about the
 * pages we do not have (#599).
 *
 * The hrefs are the bare domains that were in the footer. They are wrong in
 * the sense that no handle is on them yet, but they are wrong in exactly one
 * place now, which is the point of this module.
 */
export interface SocialLink {
  /** Also the React key. */
  id: string
  /** The accessible name — these are icon-only links on both surfaces. */
  label: string
  href: string
  Icon: LucideIcon
}

export const SOCIAL_LINKS: readonly SocialLink[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    href: 'https://instagram.com',
    Icon: Instagram,
  },
  {
    id: 'facebook',
    label: 'Facebook',
    href: 'https://facebook.com',
    Icon: Facebook,
  },
  {
    id: 'twitter',
    label: 'Twitter',
    href: 'https://twitter.com',
    Icon: Twitter,
  },
]
