import React from "react";
import clsx from "clsx";

const VARIANTS = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
  subtle: "btn-subtle",
};

export default function Button({
  as: Tag = "button",
  variant = "secondary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  className,
  children,
  disabled,
  ...rest
}) {
  const props = Tag === "button" ? { type: rest.type || "button", disabled: disabled || loading } : {};
  return (
    <Tag className={clsx("btn", VARIANTS[variant], `btn-${size}`, className)} {...props} {...rest}>
      {loading ? <span className="spinner" aria-hidden /> : Icon ? <Icon size={size === "sm" ? 14 : 16} /> : null}
      {children ? <span>{children}</span> : null}
      {IconRight ? <IconRight size={size === "sm" ? 14 : 16} /> : null}
    </Tag>
  );
}
