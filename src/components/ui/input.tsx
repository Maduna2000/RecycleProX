import * as React from "react"
import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        data-slot="input"
        className={cn(
          // Sunken (winBevel(true)) — same recessed Win32 field as the
          // app's own `inp` token (components/rpx/styles.ts): dark
          // top/left, light bottom/right, instead of a flat uniform border.
          "flex h-[30px] w-full rounded-[2px] border-t border-l border-r border-b border-t-[#B0B0B0] border-l-[#B0B0B0] border-r-white border-b-white bg-white px-2 py-1 text-[13px] text-[#212529] shadow-none transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[#185ABD] focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
