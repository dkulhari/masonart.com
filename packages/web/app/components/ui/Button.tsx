/**
 * Button — the storefront's one button, measured from mesonart.com.
 *
 * WHY THIS FILE EXISTS
 *
 * Until this component there was no Button anywhere in packages/web. Every
 * button was bespoke inline Tailwind, which is exactly how the old orange
 * `bg-primary rounded-lg` spread across ~54 files by hand and why retiring it
 * was a sweep rather than an edit. New buttons go through here so the next
 * palette decision is one file again.
 *
 * The geometry is not invented: `--radius-pill` (3.75rem) and `--border-button`
 * (2px) are measured values, declared in globals.css and asserted in
 * tests/styles/design-tokens.test.ts.
 *
 * Anchors and TanStack `Link`s cannot be this component -- they render a
 * different element -- so `buttonVariants` is exported for them to consume:
 *
 *   <Link to="/posters" className={buttonVariants({ variant: 'outline' })}>
 *
 * That is deliberately not an `asChild` prop: it would pull in Radix Slot for
 * one call shape the className already covers.
 */

import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef } from 'react'
import { cn } from '~/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium text-button ' +
    'transition-colors duration-300 [transition-timing-function:var(--ease-fast)] ' +
    'disabled:pointer-events-none disabled:opacity-50 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        /** Their primary CTA: filled near-black pill, white label. */
        solid:
          'rounded-pill border-[length:var(--border-button)] border-primary bg-primary text-primary-foreground hover:bg-primary/85 hover:border-primary/85',
        /**
         * Their hero CTA ("SHOP All ART") and both collection-toolbar pills:
         * an outline pill that fills on hover.
         *
         * The fill is not a background colour change. Theirs is a circle —
         * `border-radius: 50%`, near-black, anchored off the pill's top-left
         * corner and far wider than the pill — that scales in on
         * `--ease-primary`, so the fill arrives as a wipe across the button
         * rather than a flat flash. The label follows 0.1s later, which is why
         * the text reads as being overtaken rather than changing with it.
         *
         * `isolate` plus `before:-z-10` keeps the circle behind bare text
         * children without wrapping them in a positioned span.
         */
        outline:
          'relative isolate overflow-hidden rounded-pill border-[length:var(--border-button)] border-primary bg-transparent text-primary ' +
          'before:absolute before:-left-1/4 before:-top-1/2 before:-z-10 before:h-[200%] before:w-[150%] before:scale-0 before:rounded-full before:bg-primary ' +
          'before:transition-transform before:duration-500 before:[transition-timing-function:var(--ease-primary)] ' +
          'hover:text-primary-foreground hover:delay-100 hover:before:scale-100 hover:before:delay-0',
        /**
         * Borderless, for toolbar and icon affordances. Keeps the 2px border
         * as transparent so a ghost and a solid button of the same size line
         * up on a row.
         */
        ghost:
          'rounded-pill border-[length:var(--border-button)] border-transparent text-foreground hover:bg-accent',
        /** Inline text action. No pill — it is a link that happens to act. */
        link: 'text-foreground underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-5',
        md: 'h-11 px-7',
        lg: 'h-12 px-8',
        /**
         * Their measured button: 56px tall, 26px of horizontal padding, label
         * at the body weight. Everything on mesonart that reads as a button —
         * hero CTA, collection toolbar, add-to-cart — is this size. Named for
         * the shape rather than a t-shirt letter because it is the scale, not
         * a step on a ladder.
         */
        pill: 'h-14 px-[26px] font-normal',
        icon: 'h-10 w-10 rounded-full p-0',
      },
    },
    defaultVariants: { variant: 'solid', size: 'md' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, type = 'button', ...props }, ref) {
    return (
      <button
        ref={ref}
        // Defaulted rather than left to the platform: a bare <button> inside a
        // form submits it, and most of ours sit inside one.
        type={type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    )
  }
)

export default Button
