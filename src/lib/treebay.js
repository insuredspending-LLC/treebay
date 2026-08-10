import { base44 } from "@/api/base44Client";

export const CATEGORIES = [
  { name: "Trees", icon: "TreePine" },
  { name: "Shrubs", icon: "Shrub" },
  { name: "Flowers", icon: "Flower2" },
  { name: "Groundcover", icon: "Sprout" },
  { name: "Palms", icon: "PalmTree" },
  { name: "Native Plants", icon: "Leaf" },
  { name: "Ornamental Grasses", icon: "Wheat" },
];

export const BUYER_TYPES = [
  "Landscaper", "Landscape Designer", "General Contractor", "Developer",
  "Property Manager", "Municipal Buyer", "Commercial Customer", "Homeowner", "Other"
];

export const REPORT_REASONS = [
  { value: "fraud_or_scam", label: "Fraud or scam" },
  { value: "incorrect_information", label: "Incorrect information" },
  { value: "prohibited_content", label: "Prohibited content" },
  { value: "harassment", label: "Harassment" },
  { value: "spam", label: "Spam" },
  { value: "inappropriate_content", label: "Inappropriate content" },
  { value: "other", label: "Other" },
];

export const ORDER_STATUS_LABELS = {
  pending: "Pending",
  awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready_for_pickup: "Ready for Pickup",
  in_transit: "In Transit",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export const RFQ_STATUS_LABELS = {
  draft: "Draft", open: "Open", quotes_received: "Quotes Received",
  awarded: "Awarded", closed: "Closed", cancelled: "Cancelled",
};

export const QUOTE_STATUS_LABELS = {
  submitted: "Submitted", revised: "Revised", accepted: "Accepted",
  declined: "Declined", expired: "Expired", withdrawn: "Withdrawn",
};

export const PAYMENT_STATUS_LABELS = {
  pending: "Pending", authorized: "Authorized", paid: "Paid",
  failed: "Failed", refunded: "Refunded", partially_refunded: "Partially Refunded",
};

export const VERIFICATION_LABELS = { pending: "Pending", verified: "Verified", suspended: "Suspended" };

export function formatCurrency(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: v % 1 === 0 ? 0 : 2 });
}

export function formatNumber(n) {
  return (Number(n) || 0).toLocaleString("en-US");
}

export function shortDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt)) return "—";
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function relativeTime(d) {
  if (!d) return "";
  const dt = new Date(d).getTime();
  const diff = Date.now() - dt;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return shortDate(d);
}

// Determine the unit price for a given quantity using bulk tiers
export function priceForQuantity(product, qty) {
  if (!product) return 0;
  const tiers = (product.bulk_price_tiers || []).slice().sort((a, b) => a.min_qty - b.min_qty);
  let applicable = null;
  for (const t of tiers) {
    if (qty >= t.min_qty) applicable = t;
  }
  if (applicable) {
    if (applicable.request_quote) return null; // request quote
    return applicable.unit_price;
  }
  return product.unit_price || 0;
}

export function lineSubtotal(product, qty) {
  const p = priceForQuantity(product, qty);
  if (p === null) return null;
  return p * qty;
}

// Approx distance (miles) between two lat/lng-free city points — here a simple placeholder
// using precomputed coordinates for demo cities; returns null when unknown.
const CITY_COORDS = {
  "Midland, TX": [31.997, -102.078], "Weatherford, TX": [32.759, -97.797],
  "Austin, TX": [30.267, -97.743], "Dallas, TX": [32.777, -96.797], "Houston, TX": [29.76, -95.37],
  "San Antonio, TX": [29.424, -98.495], "Lubbock, TX": [33.577, -101.855], "Fort Worth, TX": [32.755, -97.331],
};
export function approxDistance(fromCity, toCity) {
  const a = CITY_COORDS[fromCity], b = CITY_COORDS[toCity];
  if (!a || !b) return null;
  const R = 3958.8;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const lat1 = a[0] * Math.PI / 180, lat2 = b[0] * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(x)));
}

export function cityState(p) {
  if (!p) return "";
  return [p.vendor_city, p.vendor_state].filter(Boolean).join(", ");
}

export function marketplaceLocation(profile) {
  return [profile?.city, profile?.state].filter(Boolean).join(", ");
}

export function genOrderNumber() {
  return "TB-" + Math.random().toString(36).slice(2, 8).toUpperCase() + Date.now().toString().slice(-4);
}

export async function createNotification(userId, type, title, body, refType, refId) {
  if (!userId) return;
  try {
    await base44.entities.Notification.create({
      user_id: userId, type, title, body, reference_type: refType, reference_id: refId, read: false,
    });
  } catch (e) { /* non-blocking */ }
}

export function classNames(...arr) {
  return arr.filter(Boolean).join(" ");
}

export function apiError(e) {
  return e?.response?.data?.error || e?.data?.error || e?.message || "Something went wrong. Please try again.";
}