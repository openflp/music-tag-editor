import * as React from "react"
import { cn } from "cn"
import { Tooltip as TooltipPrimitive } from "radix-ui"
import { ShortcutKeys } from "@/components/ui/kbd"

function TooltipProvider({
  delayDuration = 300,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      {...props}
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      skipDelayDuration={0}
      disableHoverableContent
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function splitTip(label: React.ReactNode): { text: React.ReactNode; keys: string[] } {
  if (typeof label !== "string") return { text: label, keys: [] }
  const match = label.match(/^(.*) · ([^·]+)$/)
  if (!match) return { text: label, keys: [] }
  const keys = match[2].trim().split(/\s*\+\s*|\s+/).filter(Boolean)
  if (!keys.length || keys.some((key) => key.length > 6)) return { text: label, keys: [] }
  return { text: match[1], keys }
}

function TooltipContent({
  className,
  sideOffset = 8,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const { text, keys } = splitTip(children)
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn("tip-bubble", className)}
        {...props}
      >
        <span className="tip-label">{text}</span>
        {keys.length ? <ShortcutKeys className="tip-keys" shortcut={keys.join("+")} /> : null}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

function Hint({
  label,
  side = "bottom",
  align = "center",
  className,
  pass = false,
  children,
}: {
  label: React.ReactNode
  side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"]
  align?: React.ComponentProps<typeof TooltipPrimitive.Content>["align"]
  className?: string
  pass?: boolean
  children: React.ReactElement
}) {
  const [open, setOpen] = React.useState(false)
  const hovering = React.useRef(false)
  const enter = () => {
    hovering.current = true
  }
  const leave = () => {
    hovering.current = false
    setOpen(false)
  }
  const host = {
    onPointerEnter: enter,
    onPointerLeave: leave,
    onPointerCancel: leave,
  }
  const trigger = pass ? (
    <TooltipTrigger asChild {...host}>{children}</TooltipTrigger>
  ) : (
    <TooltipTrigger asChild>
      <span className="hint-host" {...host}>{children}</span>
    </TooltipTrigger>
  )
  return (
    <Tooltip
      open={open}
      disableHoverableContent
      onOpenChange={(next) => {
        if (next && !hovering.current) return
        setOpen(next)
      }}
    >
      {trigger}
      <TooltipContent side={side} align={align} className={className}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export { Hint, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
