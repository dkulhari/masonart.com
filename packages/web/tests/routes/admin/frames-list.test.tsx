/**
 * /admin/frames — the frame catalogue, listed.
 *
 * The one thing worth pinning beyond "a table renders": archived frames are
 * SHOWN, dimmed, with a way back. The admin list endpoint goes out of its way
 * to return them, and a screen that filtered them out would make archiving a
 * one-way door through the only UI that can archive.
 *
 * The navigation assertions read the source off disk, matching
 * shipping-config.test.tsx. Route access and sidebar visibility are driven by
 * the same prefix list, so a screen the API admits a content-manager to while
 * the layout guard turns them away is a coherent-looking bug.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Only the router is stubbed, not the component.
 *
 * `Link` reads router context and throws without a provider, and
 * `createFileRoute` runs at module load. Standing up a real router to assert
 * that an archived row offers Unarchive would test TanStack, not this table.
 * The sibling admin-list suite avoids the problem by asserting on the source
 * text instead; rendering with a stubbed anchor pins the actual behaviour,
 * which is worth the four lines.
 */
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  Link: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    to?: string
    params?: Record<string, string>
    'aria-label'?: string
  }) => (
    <a href={props.to} aria-label={props['aria-label']}>
      {children}
    </a>
  ),
}))

import { FramesTable, type AdminFrame } from '~/routes/admin/frames/index'

afterEach(cleanup)

const FRAMES: AdminFrame[] = [
  {
    id: 'f1',
    name: 'Rolled Canvas',
    type: 'rolled',
    category: 'rolled',
    priceModifier: '1.00',
    priceAddition: '0.00',
    thumbnailUrl: '/frames/rolled.png',
    isActive: true,
    sortOrder: 0,
  },
  {
    id: 'f2',
    name: 'Stretch + Oak Frame',
    type: 'stretch-oak',
    category: 'framed',
    priceModifier: '1.40',
    priceAddition: '250.00',
    thumbnailUrl: '/frames/oak.png',
    isActive: false,
    sortOrder: 9,
  },
]

const noop = () => {}

const renderTable = (frames: AdminFrame[] = FRAMES) =>
  render(<FramesTable frames={frames} onArchive={noop} onUnarchive={noop} />)

/**
 * Rows are located by their `type` slug, which is unique by database
 * constraint. Locating by NAME does not work: the Rolled Canvas frame is
 * called the same thing as the rung it groups under, so its name appears twice
 * in its own row. That is correct on screen and ambiguous to a query.
 */
const rowByType = (type: string) => screen.getByText(type).closest('tr')!

describe('FramesTable', () => {
  it('lists every frame with its rung and both price columns', () => {
    renderTable()

    expect(rowByType('rolled').textContent).toContain('Rolled Canvas')

    const oak = rowByType('stretch-oak')
    expect(oak.textContent).toContain('Stretch + Oak Frame')
    expect(oak.textContent).toMatch(/1\.40/)
    expect(oak.textContent).toMatch(/250/)
  })

  it('shows the rung, so the admin can see how a frame will group', () => {
    renderTable()

    expect(rowByType('rolled').textContent).toMatch(/rolled canvas/i)
    expect(rowByType('stretch-oak').textContent).toMatch(/framed/i)
  })

  it('shows an archived frame rather than hiding it', () => {
    renderTable()
    expect(screen.getByText('Stretch + Oak Frame')).toBeInTheDocument()
  })

  it('offers the archived frame a way back', () => {
    renderTable()
    expect(rowByType('stretch-oak').textContent).toMatch(/unarchive/i)
  })

  it('offers an active frame the archive action, not unarchive', () => {
    renderTable()

    const row = rowByType('rolled')
    expect(row.textContent).toMatch(/archive/i)
    expect(row.textContent).not.toMatch(/unarchive/i)
  })

  it('marks the archived row as archived for a reader, not only by styling', () => {
    renderTable()

    // A dimmed row is invisible to a screen reader and to a colourblind admin.
    expect(rowByType('stretch-oak').textContent).toMatch(/archived/i)
  })

  it('renders an empty catalogue without throwing', () => {
    renderTable([])
    expect(screen.getByText(/no frames/i)).toBeInTheDocument()
  })
})

describe('navigation registration', () => {
  const read = (relative: string) =>
    readFileSync(join(process.cwd(), relative), 'utf8')

  const sidebar = read('app/components/admin/AdminSidebar.tsx')
  const adminNav = read('app/lib/admin-nav.ts')

  it('links /admin/frames from the sidebar', () => {
    expect(sidebar).toContain("href: '/admin/frames'")
  })

  it('files it with the other catalogue axes, not up with Orders', () => {
    const secondary = sidebar.slice(sidebar.indexOf('SECONDARY_NAV_ITEMS'))
    expect(secondary).toContain("href: '/admin/frames'")
  })

  it('lets a content-manager reach it, matching what the API already allows', () => {
    // The API gates /api/admin/frames with requireContentManager. If the route
    // guard disagreed, the screen would 403 for a role the endpoint serves.
    expect(adminNav).toContain("'/admin/frames'")
  })
})
