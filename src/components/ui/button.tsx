"use client"

import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

// House-style Aero button: flat grey BAR_GRAD fill, real raised Win32 bevel
// (light top/left, dark bottom/right — winBevel()), 3px radius — matches
// rpx/Btn.tsx and rpx/styles.ts exactly (kept as literal values here since
// this file can't import from rpx without a circular dependency; if
// BAR_GRAD/winBevel's values change, update both). Severity/emphasis is
// signalled by label/text colour, not a solid colour block or a different
// radius — no variant here uses rounded-lg or a press-down transform, both
// of which used to visibly clash with the gradient Btn used everywhere else
// in the app.
const AERO_BASE =
  "bg-[linear-gradient(180deg,#EAEAEA_0%,#D4D4D4_100%)] border-t-white border-l-white border-r-[#B0B0B0] border-b-[#B0B0B0] hover:bg-[#D2D2D2] hover:bg-none"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-[3px] border bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: `${AERO_BASE} text-[#212529]`,
        // Same house look as the grey "Btn" — this is what renders in every
        // ordinary Dialog/AlertDialog Close/Cancel slot, the single most
        // frequent shadcn-Button call site in the app.
        outline:
          "bg-white border-t-white border-l-white border-r-[#B0B0B0] border-b-[#B0B0B0] text-[#212529] hover:bg-[#F1F3F4] aria-expanded:bg-[#F1F3F4]",
        secondary: `${AERO_BASE} text-[#212529]`,
        ghost:
          "border-transparent hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive: `${AERO_BASE} text-[#C0392B]`,
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 px-2 text-xs in-data-[slot=button-group]:rounded-[3px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-[3px] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 in-data-[slot=button-group]:rounded-[3px] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 in-data-[slot=button-group]:rounded-[3px]",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
