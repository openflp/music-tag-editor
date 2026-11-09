import { cn } from "cn"

function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex h-5 w-fit min-w-5 items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-xs font-medium tracking-normal text-muted-foreground select-none [&_svg:not([class*='size-'])]:size-3",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

function ShortcutKeys({ shortcut, className }: { shortcut: string; className?: string }) {
  const keys = shortcut
    .split(/\s*\+\s*|\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (!keys.length) return null
  return (
    <KbdGroup className={className}>
      {keys.map((key, index) => (
        <Kbd key={`${key}-${index}`}>{key}</Kbd>
      ))}
    </KbdGroup>
  )
}

export { Kbd, KbdGroup, ShortcutKeys }
