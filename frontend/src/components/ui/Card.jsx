import React from "react";
import clsx from "clsx";

export function Card({ as: Tag = "section", className, children, ...rest }) {
  return (
    <Tag className={clsx("card", className)} {...rest}>
      {children}
    </Tag>
  );
}

export function CardHeader({ title, subtitle, action, icon: Icon }) {
  return (
    <header className="card-header">
      <div className="card-heading">
        {Icon ? (
          <span className="card-icon">
            <Icon size={16} />
          </span>
        ) : null}
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="card-action">{action}</div> : null}
    </header>
  );
}

export default Card;
