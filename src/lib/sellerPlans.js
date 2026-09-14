export const SELLER_PLANS = [
  {
    id: "free",
    name: "Free Seller",
    price: 0,
    eyebrow: "Start selling",
    description: "Build a storefront and validate buyer demand.",
    features: [
      "Up to 5 active listings at launch",
      "Receive and review RFQ opportunities",
      "Core seller dashboard and messaging",
    ],
  },
  {
    id: "professional",
    name: "Professional Seller",
    price: 49,
    eyebrow: "Grow consistently",
    description: "For established nurseries managing an active catalog.",
    features: [
      "Up to 100 active listings at launch",
      "Seller analytics and priority RFQ tools",
      "Reduced-cost promotion opportunities",
    ],
  },
  {
    id: "business",
    name: "Business Seller",
    price: 149,
    eyebrow: "Scale operations",
    description: "For multi-location and high-volume sellers.",
    features: [
      "Unlimited active listings at launch",
      "Multi-location and team workflows",
      "Featured-placement credits and priority support",
    ],
  },
];

export const FEATURED_LISTING_PRODUCTS = [
  { id: "standard", name: "Standard boost", price: 15, duration: "7 days" },
  { id: "priority", name: "Priority boost", price: 30, duration: "7 days" },
  { id: "spotlight", name: "Spotlight placement", price: 50, duration: "7 days" },
];

export const VERIFIED_SELLER_PROGRAM = {
  annualPrice: 99,
  name: "Verified Seller program",
};

export const CURRENT_TEST_MARKETPLACE_FEE_PERCENT = 4;
export const TARGET_PRODUCTION_MARKETPLACE_FEE_PERCENT = 6;

export function getSellerPlan(planId) {
  return SELLER_PLANS.find((plan) => plan.id === planId) || SELLER_PLANS[0];
}
