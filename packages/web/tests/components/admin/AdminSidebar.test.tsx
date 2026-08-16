/**
 * Admin chrome return-path tests (#362)
 *
 * Staff reported no obvious way back to the customer site once inside
 * /admin. The way out has to survive both a collapsed sidebar (icon only,
 * so the accessible name has to come from somewhere other than the label)
 * and mobile widths, where the sidebar is off-canvas entirely and
 * MobileAdminHeader is the only chrome on screen.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({ state: { location: { pathname: '/admin/products' } } }),
}))

vi.mock('~/lib/auth-client', () => ({
  signOut: vi.fn(),
}))

import { AdminSidebar, MobileAdminHeader } from '~/components/admin/AdminSidebar'

const contentManager = {
  name: 'Cara Manager',
  email: 'test-content-manager@chobii.art',
  role: 'content-manager',
}

const admin = {
  name: 'Ada Admin',
  email: 'admin@chobii.art',
  role: 'admin',
}

describe('AdminSidebar return path', () => {
  it('offers a way back to the store when expanded', () => {
    render(<AdminSidebar user={admin} collapsed={false} />)

    const link = screen.getByRole('link', { name: /view store/i })
    expect(link).toHaveAttribute('href', '/')
  })

  it('keeps the way back reachable and named when collapsed', () => {
    render(<AdminSidebar user={admin} collapsed={true} />)

    // Label text is hidden at 72px wide, so the accessible name has to
    // survive on the element itself.
    const link = screen.getByRole('link', { name: /view store/i })
    expect(link).toHaveAttribute('href', '/')
  })

  it('offers the way back to content managers too', () => {
    render(<AdminSidebar user={contentManager} collapsed={false} />)

    expect(screen.getByRole('link', { name: /view store/i })).toHaveAttribute(
      'href',
      '/'
    )
  })
})

describe('AdminSidebar photo approvals entry (#605)', () => {
  it('links admins to the photo approvals queue', () => {
    render(<AdminSidebar user={admin} collapsed={false} />)

    expect(screen.getByRole('link', { name: /approvals/i })).toHaveAttribute(
      'href',
      '/admin/approvals'
    )
  })

  it('hides approvals from content managers', () => {
    // /api/admin/approvals is requireAdmin — a visible link would be a 403
    // waiting to happen.
    render(<AdminSidebar user={contentManager} collapsed={false} />)

    expect(screen.queryByRole('link', { name: /approvals/i })).toBeNull()
  })
})

describe('MobileAdminHeader', () => {
  it('titles the staff area for what a content manager can reach', () => {
    render(<MobileAdminHeader role="content-manager" />)

    expect(screen.getByText('Manage Content')).toBeInTheDocument()
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
  })

  it('titles the staff area "Manage Store" for admins', () => {
    render(<MobileAdminHeader role="super-admin" />)

    expect(screen.getByText('Manage Store')).toBeInTheDocument()
  })

  it('always offers the way back to the store', () => {
    render(<MobileAdminHeader role="content-manager" />)

    expect(screen.getByRole('link', { name: /view store/i })).toHaveAttribute(
      'href',
      '/'
    )
  })
})
