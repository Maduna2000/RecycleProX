"use client"

import * as React from "react"
import { Collapsible } from "@base-ui/react/collapsible"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// Accordion Root - manages multiple collapsibles
interface AccordionProps {
  type?: 'single' | 'multiple'
  defaultValue?: string | string[]
  children: React.ReactNode
}

const AccordionContext = React.createContext<{
  type: 'single' | 'multiple'
  value: Set<string>
  onValueChange: (value: string) => void
}>({
  type: 'single',
  value: new Set(),
  onValueChange: () => {},
})

export function Accordion({ type = 'single', defaultValue, children }: AccordionProps) {
  const [value, setValue] = React.useState<Set<string>>(() => {
    if (Array.isArray(defaultValue)) return new Set(defaultValue)
    if (defaultValue) return new Set([defaultValue])
    return new Set()
  })

  const onValueChange = React.useCallback((itemValue: string) => {
    setValue((prev) => {
      const newValue = new Set(prev)
      if (newValue.has(itemValue)) {
        newValue.delete(itemValue)
      } else {
        if (type === 'single') {
          newValue.clear()
        }
        newValue.add(itemValue)
      }
      return newValue
    })
  }, [type])

  return (
    <AccordionContext.Provider value={{ type, value, onValueChange }}>
      <div>{children}</div>
    </AccordionContext.Provider>
  )
}

// Accordion Item - wraps Collapsible
interface AccordionItemProps {
  value: string
  children: React.ReactNode
  className?: string
}

const AccordionItemContext = React.createContext<{ value: string }>({ value: '' })

export function AccordionItem({ value, children, className }: AccordionItemProps) {
  return (
    <AccordionItemContext.Provider value={{ value }}>
      <div className={cn("border-b", className)}>{children}</div>
    </AccordionItemContext.Provider>
  )
}

// Accordion Trigger
interface AccordionTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode
}

export function AccordionTrigger({ children, className, style, ...props }: AccordionTriggerProps) {
  const { value: itemValue } = React.useContext(AccordionItemContext)
  const { value, onValueChange } = React.useContext(AccordionContext)
  const isOpen = value.has(itemValue)

  return (
    <Collapsible.Root open={isOpen} onOpenChange={() => onValueChange(itemValue)}>
      <Collapsible.Trigger
        className={cn(
          "flex w-full items-center justify-between py-4 font-medium transition-all",
          className
        )}
        style={style}
        {...props}
      >
        {children}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </Collapsible.Trigger>
    </Collapsible.Root>
  )
}

// Accordion Content
interface AccordionContentProps {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

export function AccordionContent({ children, className, style }: AccordionContentProps) {
  const { value: itemValue } = React.useContext(AccordionItemContext)
  const { value } = React.useContext(AccordionContext)
  const isOpen = value.has(itemValue)

  return (
    <Collapsible.Root open={isOpen}>
      <Collapsible.Panel className={cn("overflow-hidden transition-all", className)} style={style}>
        <div>{children}</div>
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
