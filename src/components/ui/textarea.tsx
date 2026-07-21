import * as React from "react"
import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        data-slot="textarea"
        className={cn(
          "flex min-h-[60px] w-full rounded-[2px] border border-[#ABABAB] bg-white px-2 py-1.5 text-[13px] text-[#212529] shadow-none placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-[#0078D7] focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
