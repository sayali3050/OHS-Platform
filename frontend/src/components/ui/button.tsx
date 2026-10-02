import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/utils/cn";

const button = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 select-none",
  {
    variants: {
      variant: {
        // Signal amber is the single loud colour: reserved for the primary action on a screen.
        primary: "bg-signal text-signal-ink hover:bg-signal/90 active:bg-signal/80",
        secondary: "bg-ink text-bg hover:bg-ink/90",
        outline: "border border-line bg-surface text-ink hover:bg-sunken",
        ghost: "text-ink hover:bg-sunken",
        danger: "bg-danger text-white hover:bg-danger/90",
        link: "text-info underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-9 px-3 text-sm rounded-md",
        md: "h-11 px-4 text-[15px] rounded-md",   // 44px: comfortable touch target
        lg: "h-14 px-6 text-base rounded-md",
        icon: "h-10 w-10 rounded-md",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    if (asChild) {
      // Slot needs exactly one child element, so no spinner in this mode.
      return <Slot ref={ref} className={cn(button({ variant, size }), className)} {...props}>{children}</Slot>;
    }
    return (
      <button ref={ref} className={cn(button({ variant, size }), className)} disabled={disabled || loading}
        aria-busy={loading || undefined} {...props}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";
