/**
 * Kendt admin-password til E2E. global-setup sætter dette som ADMIN_PASSWORD før
 * seed (så den seedede admin har et kendt login OG mustChangePassword: false →
 * ingen tvungen-skift-redirect midt i testen). admin.spec udfylder samme værdi.
 * IKKE et produktions-default — kun til den lokale test-DB.
 */
export const E2E_ADMIN_PASSWORD = "e2e-admin-pw-123456";
