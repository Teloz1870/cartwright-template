import type {
  HTMLAttributes,
  ReactNode,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/**
 * AdminTable* — komposable Polaris-tabel-primitiver (IKKE config-drevet). Bevidst
 * choice: OrdersWorkspace + BulkProductTable own bespoke `Set`-based selection;
 * composable tags let them keep that logic while getting Polaris hover rows +
 * hairline dividers for free. Selection lives in the bespoke components — not here.
 */
export function AdminTable({
  children,
  className,
  minWidth,
}: {
  children: ReactNode;
  className?: string;
  minWidth?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn("w-full text-left text-sm", className)}
        style={minWidth ? { minWidth } : undefined}
      >
        {children}
      </table>
    </div>
  );
}

export function AdminThead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-sol-glass-border-dark text-xs uppercase tracking-wide text-sol-muted">
      {children}
    </thead>
  );
}

type ThProps = ThHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right" | "center";
};
export function AdminTh({ align = "left", className, children, ...rest }: ThProps) {
  return (
    <th
      className={cn(
        "px-4 py-3 font-medium",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export function AdminTbody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-sol-glass-border-dark">{children}</tbody>;
}

type TrProps = HTMLAttributes<HTMLTableRowElement> & { selected?: boolean };
export function AdminTr({ children, selected, className, ...rest }: TrProps) {
  return (
    <tr
      className={cn(
        "transition hover:bg-sol-cream/70",
        selected && "bg-sol-accent/5",
        className,
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

type TdProps = TdHTMLAttributes<HTMLTableCellElement> & {
  align?: "left" | "right" | "center";
};
export function AdminTd({ align = "left", className, children, ...rest }: TdProps) {
  return (
    <td
      className={cn(
        "px-4 py-3 text-sol-ink",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

/** An empty-state row spanning all columns. */
export function AdminTableEmpty({
  colSpan,
  children,
}: {
  colSpan: number;
  children: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-10 text-center text-sm text-sol-muted">
        {children}
      </td>
    </tr>
  );
}
