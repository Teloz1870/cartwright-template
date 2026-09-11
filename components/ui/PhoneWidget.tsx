/**
 * Re-export shim — the implementation moved to the phone-widget plugin
 * (plugins/phone-widget/, cartwright-plugin-v1). This file keeps the
 * historical import path (`@/components/ui/PhoneWidget`) working unchanged
 * for existing scaffolds and the canaries (Solbrillen runs phoneWidget:true).
 */
export { PhoneWidget } from "@/plugins/phone-widget/components/PhoneWidget";
