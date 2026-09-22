/**
 * Admin UI primitives (Polaris skin). The only permitted source of buttons/cards/
 * badges/tables/fields in admin pages — no new inline class strings.
 */
export { default as AdminButton } from "./AdminButton";
export { default as AdminCard } from "./AdminCard";
export { default as AdminBadge, orderStatusTone, type BadgeTone } from "./AdminBadge";
export { default as AdminPageHeader } from "./AdminPageHeader";
export { default as EmptyState } from "./EmptyState";
export {
  AdminTable,
  AdminThead,
  AdminTh,
  AdminTbody,
  AdminTr,
  AdminTd,
  AdminTableEmpty,
} from "./AdminTable";
export { AdminField, AdminInput, AdminSelect, AdminTextarea } from "./AdminField";
