import * as React from "react";
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { Text } from "./text";

const buttonVariants = cva("flex-row items-center justify-center rounded-xl", {
  variants: {
    variant: {
      default: "bg-primary",
      secondary: "border border-primary bg-transparent",
      destructive: "bg-transparent",
      ghost: "bg-transparent",
    },
    size: {
      default: "h-[52px] px-6",
      sm: "h-[44px] px-4",
      icon: "h-[52px] w-[52px]",
    },
  },
  defaultVariants: {
    variant: "default",
    size: "default",
  },
});

const buttonTextVariants = cva("font-barlow-semibold text-[15px]", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-primary",
      destructive: "text-destructive",
      ghost: "text-foreground",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

interface ButtonProps extends PressableProps, VariantProps<typeof buttonVariants> {
  label?: string;
  textClassName?: string;
}

const Button = React.forwardRef<React.ComponentRef<typeof Pressable>, ButtonProps>(
  (
    { className, textClassName, variant, size, label, children, style, disabled, ...props },
    ref,
  ) => {
    return (
      <Pressable
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled}
        style={(state) => {
          const { pressed } = state;
          const baseStyle: StyleProp<ViewStyle> = [
            pressed && !disabled ? { opacity: 0.72, transform: [{ scale: 0.98 }] } : null,
            disabled ? { opacity: 0.5 } : null,
          ];
          if (typeof style === "function") return [baseStyle, style(state)];
          return [baseStyle, style];
        }}
        {...props}
      >
        {label ? (
          <Text className={cn(buttonTextVariants({ variant }), textClassName)}>{label}</Text>
        ) : (
          children
        )}
      </Pressable>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants, buttonTextVariants };
