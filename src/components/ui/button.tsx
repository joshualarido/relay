import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
  { variants: { variant: {
    default: "bg-primary text-primary-foreground hover:bg-[color-mix(in_srgb,var(--primary)_88%,var(--foreground))]",
    outline: "border border-border bg-transparent text-foreground hover:border-[var(--control-border)] hover:bg-secondary",
    ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
    destructive: "border border-[color-mix(in_srgb,var(--destructive)_45%,transparent)] text-destructive hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)]",
  } }, defaultVariants: { variant: "default" } },
);

export function Button({ className, variant, asChild = false, ...props }:
  React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "button";
  return <Component data-slot="button" className={cn(buttonVariants({ variant, className }))} {...props} />;
}
