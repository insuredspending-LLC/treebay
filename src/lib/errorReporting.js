import { base44 } from "@/api/base44Client";

const sentFingerprints = new Set();

function errorMessage(error, fallback) {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return fallback;
  }
}

function errorStack(error) {
  return error instanceof Error ? error.stack || "" : "";
}

export async function reportClientError({
  error,
  message,
  componentStack = "",
  details = "TreEbay detected an unexpected client-side error. No form values were included.",
  impact = "blocked",
  reportType = "automatic_crash",
}) {
  const resolvedMessage = message || errorMessage(error, "Unknown client-side error");
  const route = window.location.pathname + window.location.search;
  const fingerprint = [reportType, route, resolvedMessage, componentStack.slice(0, 160)].join("|");

  if (sentFingerprints.has(fingerprint)) return { deduplicated: true };
  sentFingerprints.add(fingerprint);

  try {
    return await base44.entities.CrashReport.create({
      route,
      message: resolvedMessage,
      stack: errorStack(error),
      component_stack: componentStack || "",
      user_agent: navigator.userAgent || "",
      details,
      report_type: reportType,
      impact,
      status: "open",
    });
  } catch (reportingError) {
    sentFingerprints.delete(fingerprint);
    throw reportingError;
  }
}
