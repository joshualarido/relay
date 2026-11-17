import * as React from "react";
import { Slot } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50",
  { variants: { variant: {
    default: "bg-primary text-primary-foreground hover:brightness-110",
    outline: "border border-[var(--control-border)] bg-transparent text-foreground hover:bg-secondary",
    ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
    destructive: "border border-destructive text-destructive hover:bg-secondary",
  } }, defaultVariants: { variant: "default" } },
);

export function Button({ className, variant, asChild = false, ...props }:
  React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Component = asChild ? Slot.Root : "button";
  return <Component data-slot="button" className={cn(buttonVariants({ variant, className }))} {...props} />;
}
