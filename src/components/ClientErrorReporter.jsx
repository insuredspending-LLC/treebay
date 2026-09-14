import { useEffect } from "react";
import { reportClientError } from "@/lib/errorReporting";

const MAX_AUTOMATIC_REPORTS_PER_SESSION = 5;

export default function ClientErrorReporter() {
  useEffect(() => {
    let reportCount = 0;

    const capture = (payload) => {
      if (reportCount >= MAX_AUTOMATIC_REPORTS_PER_SESSION) return;
      reportCount += 1;
      reportClientError(payload).catch(() => {
        // Error reporting must never create a second user-facing error.
      });
    };

    const handleError = (event) => {
      const error = event.error || new Error(event.message || "Unhandled browser error");
      capture({
        error,
        details: "Automatically captured from an unhandled browser error.",
      });
    };

    const handleRejection = (event) => {
      const reason = event.reason;
      const error = reason instanceof Error ? reason : new Error(typeof reason === "string" ? reason : "Unhandled promise rejection");
      capture({
        error,
        details: "Automatically captured from an unhandled promise rejection.",
      });
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
