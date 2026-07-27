import { Link } from '@tanstack/react-router'
import { Facebook, Instagram, Twitter, Mail } from 'lucide-react'

/**
 * Footer component for the chobii.art e-commerce platform.
 * Contains navigation links, social media, newsletter signup,
 * and legal information.
 */
export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-background">
      <div className="container-wide py-12 md:py-16">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand & Description */}
          <div className="space-y-4">
            <Link to="/" className="inline-block">
              <span className="text-xl font-bold tracking-tight text-foreground">
                chobii<span className="text-primary">.art</span>
              </span>
            </Link>
            <p className="text-sm text-muted-foreground">
              Premium posters and frames for your space. Create custom AI-generated
              art or choose from our curated collection.
            </p>
            <div className="flex space-x-4">
              <SocialLink href="https://instagram.com" label="Instagram">
                <Instagram className="h-5 w-5" />
              </SocialLink>
              <SocialLink href="https://facebook.com" label="Facebook">
                <Facebook className="h-5 w-5" />
              </SocialLink>
              <SocialLink href="https://twitter.com" label="Twitter">
                <Twitter className="h-5 w-5" />
              </SocialLink>
            </div>
          </div>

          {/* Shop Links */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Shop</h3>
            <ul className="space-y-3">
              <li>
                <FooterLink to="/posters">All Posters</FooterLink>
              </li>
              <li>
                <FooterLink to="/posters?styles=abstract">Abstract Art</FooterLink>
              </li>
              <li>
                <FooterLink to="/posters?styles=botanical">Botanical</FooterLink>
              </li>
              <li>
                <FooterLink to="/posters?styles=minimalist">Minimalist</FooterLink>
              </li>
              <li>
                <FooterLink to="/create">Create with AI</FooterLink>
              </li>
            </ul>
          </div>

          {/* Company Links */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Company</h3>
            <ul className="space-y-3">
              <li>
                <FooterLink to="/about">About Us</FooterLink>
              </li>
              <li>
                <FooterLink to="/contact">Contact</FooterLink>
              </li>
              <li>
                <FooterLink to="/faq">FAQs</FooterLink>
              </li>
              <li>
                <FooterLink to="/shipping">Shipping Info</FooterLink>
              </li>
              <li>
                <FooterLink to="/returns">Returns & Refunds</FooterLink>
              </li>
            </ul>
          </div>

          {/* Newsletter */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Stay Updated</h3>
            <p className="text-sm text-muted-foreground">
              Subscribe to get special offers, new arrivals, and inspiration.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                // Newsletter subscription will be implemented later
              }}
              className="flex flex-col space-y-2 sm:flex-row sm:space-x-2 sm:space-y-0"
            >
              <label htmlFor="footer-email" className="sr-only">
                Email address
              </label>
              <input
                id="footer-email"
                type="email"
                placeholder="Enter your email"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                required
              />
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                <Mail className="mr-2 h-4 w-4" />
                Subscribe
              </button>
            </form>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="mt-12 flex flex-col items-center justify-between space-y-4 border-t border-border pt-8 md:flex-row md:space-y-0">
          <p className="text-sm text-muted-foreground">
            &copy; {currentYear} chobii.art. All rights reserved.
          </p>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2">
            <FooterLink to="/privacy">Privacy Policy</FooterLink>
            <FooterLink to="/terms">Terms of Service</FooterLink>
            <FooterLink to="/cookies">Cookie Policy</FooterLink>
          </div>
        </div>
      </div>
    </footer>
  )
}

/**
 * Footer navigation link component.
 */
function FooterLink({
  to,
  children,
}: {
  to: string
  children: React.ReactNode
}) {
  return (
    <Link
      to={to}
      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      {children}
    </Link>
  )
}

/**
 * Social media link component.
 */
function SocialLink({
  href,
  label,
  children,
}: {
  href: string
  label: string
  children: React.ReactNode
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      aria-label={label}
    >
      {children}
    </a>
  )
}
