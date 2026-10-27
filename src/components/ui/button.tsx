import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md font-sans normal-case border border-transparent bg-clip-padding text-[15px] font-semibold whitespace-nowrap transition-[color,background-color,border-color,transform] duration-150 outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Court green buttons (docs/design-system.md §6): primary turf, secondary white
        // with an input border, accent shuttle for the single key action on a screen.
        default: "bg-primary text-primary-foreground hover:bg-turf-2",
        outline: "border-input bg-card text-foreground hover:bg-inset aria-expanded:bg-inset",
        secondary: "bg-inset text-secondary-foreground hover:bg-accent aria-expanded:bg-accent",
        accent: "bg-shuttle text-shuttle-foreground hover:brightness-95",
        ghost: "text-foreground hover:bg-inset aria-expanded:bg-inset",
        destructive: "bg-over-strong text-destructive-foreground hover:brightness-95 focus-visible:ring-destructive",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Controls are 42px on desktop; sm and xs are for dense toolbars (timeline header, rows).
        default:
          "h-(--control-h) gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-[18px]",
        xs: "h-7 gap-1 rounded-sm px-2 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 gap-2 px-3 text-sm has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        lg: "h-11 gap-2 px-6 text-base has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4 [&_svg:not([class*='size-'])]:size-5",
        icon: "size-(--control-h) [&_svg:not([class*='size-'])]:size-5",
        "icon-xs": "size-7 rounded-sm [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9",
        "icon-lg": "size-11 [&_svg:not([class*='size-'])]:size-5",
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
