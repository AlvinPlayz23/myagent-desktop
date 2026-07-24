import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../util'

/* Ported from t3code's ui/button.tsx, trimmed to the variants this app uses and
   rebuilt on a plain <button> (no base-ui render prop). */
export const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium outline-none transition-[background-color,box-shadow,transform] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    defaultVariants: { size: 'default', variant: 'default' },
    variants: {
      size: {
        default: 'h-8 px-3 text-sm',
        sm: 'h-7 gap-1.5 px-2.5 text-xs',
        lg: 'h-9 px-4 text-sm',
        icon: 'size-8',
        'icon-sm': 'size-7',
        'icon-xs': "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3.5"
      },
      variant: {
        default: 'border-primary bg-primary text-primary-foreground shadow-xs hover:bg-primary/90',
        destructive:
          'border-destructive bg-destructive text-white shadow-xs hover:bg-destructive/90',
        outline: 'border-input bg-popover text-foreground shadow-xs hover:bg-accent',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost:
          "border-transparent text-foreground hover:bg-accent [&_svg:not([class*='text-'])]:text-muted-foreground",
        link: 'border-transparent text-primary underline-offset-4 hover:underline'
      }
    }
  }
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type, ...props }: ButtonProps): JSX.Element {
  return (
    <button
      type={type ?? 'button'}
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
