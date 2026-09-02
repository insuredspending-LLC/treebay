import { base44 } from "@/api/base44Client";

const IMG = {
  oak: "https://media.base44.com/images/public/6a77a39c9b7e1d39b7705b42/3632a60b5_generated_image.png",
  sage: "https://media.base44.com/images/public/6a77a39c9b7e1d39b7705b42/cb667f85c_generated_image.png",
  grass: "https://media.base44.com/images/public/6a77a39c9b7e1d39b7705b42/af97ee049_generated_image.png",
  agave: "https://media.base44.com/images/public/6a77a39c9b7e1d39b7705b42/3f272394d_generated_image.png",
};

const VENDORS = [
  { business_name: "West Texas Tree Farm", contact_name: "Sam Greene", phone: "(817) 555-0100", address: "123 Farm Rd", city: "Weatherford", state: "TX", zip_code: "76086", website: "", description: "Field-grown shade and ornamental trees. Family operated since 1986.", service_area: "North & Central Texas", pickup_available: true, delivery_available: true, wholesale_available: true, verification_status: "verified" },
  { business_name: "Lone Star Nursery Supply", contact_name: "Maria Lopez", phone: "(512) 555-0200", address: "456 Greenway", city: "Austin", state: "TX", zip_code: "78701", website: "", description: "Container shrubs, native plants, and groundcover for commercial projects.", service_area: "Central Texas", pickup_available: true, delivery_available: true, wholesale_available: true, verification_status: "verified" },
  { business_name: "Hill Country Growers", contact_name: "Dale Brooks", phone: "(210) 555-0300", address: "789 Hill Rd", city: "San Antonio", state: "TX", zip_code: "78201", website: "", description: "Drought-tolerant natives, ornamental grasses, and succulents.", service_area: "South & Central Texas", pickup_available: true, delivery_available: false, wholesale_available: false, verification_status: "pending" },
];

const PRODUCTS = [
  // West Texas Tree Farm
  { vendor: 0, common_name: "Live Oak", botanical_name: "Quercus virginiana", category: "Trees", caliper: '4"', container_size: "", current_height: "10-12 ft", quantity_available: 43, unit_price: 265, minimum_order_quantity: 1, wholesale_eligible: true, native_status: true, foliage_type: "evergreen", sun_requirement: "full sun", water_requirement: "medium", usda_zones: "7-10", mature_height: "40-80 ft", mature_spread: "60-100 ft", description: "Sturdy, long-lived shade tree with a broad spreading canopy. Field-grown, 4-inch caliper.", bulk_price_tiers: [{ min_qty: 10, max_qty: 24, unit_price: 245 }, { min_qty: 25, max_qty: 49, unit_price: 225 }, { min_qty: 50, max_qty: 0, unit_price: 0, request_quote: true }], images: [IMG.oak], featured: true },
  { vendor: 0, common_name: "Shumard Red Oak", botanical_name: "Quercus shumardii", category: "Trees", caliper: '3"', current_height: "10-14 ft", quantity_available: 28, unit_price: 210, wholesale_eligible: true, native_status: true, foliage_type: "deciduous", sun_requirement: "full sun", water_requirement: "medium", usda_zones: "5-9", mature_height: "80 ft", mature_spread: "50 ft", description: "Fast-growing red oak with brilliant fall color.", bulk_price_tiers: [{ min_qty: 10, max_qty: 0, unit_price: 195 }], images: [IMG.oak] },
  { vendor: 0, common_name: "Cedar Elm", botanical_name: "Ulmus crassifolia", category: "Trees", caliper: '2.5"', current_height: "9-11 ft", quantity_available: 35, unit_price: 185, native_status: true, foliage_type: "deciduous", sun_requirement: "full sun", water_requirement: "low", usda_zones: "6-9", description: "Drought-tolerant native elm ideal for Texas landscapes.", images: [IMG.oak] },
  { vendor: 0, common_name: "Desert Willow", botanical_name: "Chilopsis linearis", category: "Trees", container_size: "15 gallon", current_height: "6-8 ft", quantity_available: 22, unit_price: 95, native_status: true, foliage_type: "deciduous", sun_requirement: "full sun", water_requirement: "low", usda_zones: "7-9", description: "Ornamental tree with trumpet-like pink blooms.", images: [IMG.oak] },
  // Lone Star Nursery Supply
  { vendor: 1, common_name: "Texas Sage", botanical_name: "Leucophyllum frutescens", category: "Shrubs", container_size: "5 gallon", quantity_available: 120, unit_price: 32, wholesale_eligible: true, native_status: true, foliage_type: "evergreen", sun_requirement: "full sun", water_requirement: "low", description: "Silvery-leaved shrub with purple blooms after rain.", bulk_price_tiers: [{ min_qty: 25, max_qty: 99, unit_price: 28 }, { min_qty: 100, max_qty: 0, unit_price: 24 }], images: [IMG.sage], featured: true },
  { vendor: 1, common_name: "Wax Myrtle", botanical_name: "Morella cerifera", category: "Shrubs", container_size: "5 gallon", quantity_available: 80, unit_price: 28, native_status: true, foliage_type: "evergreen", sun_requirement: "part sun", water_requirement: "medium", description: "Fast-growing evergreen screen plant.", images: [IMG.sage] },
  { vendor: 1, common_name: "Yaupon Holly", botanical_name: "Ilex vomitoria", category: "Shrubs", container_size: "7 gallon", quantity_available: 64, unit_price: 45, native_status: true, foliage_type: "evergreen", sun_requirement: "part sun", water_requirement: "medium", description: "Versatile native holly with red berries.", images: [IMG.sage] },
  { vendor: 1, common_name: "Texas Mountain Laurel", botanical_name: "Dermatophyllum secundiflorum", category: "Shrubs", container_size: "10 gallon", quantity_available: 18, unit_price: 120, native_status: true, foliage_type: "evergreen", sun_requirement: "full sun", water_requirement: "low", description: "Slow-growing evergreen with fragrant purple flowers.", images: [IMG.sage] },
  { vendor: 1, common_name: "Lantana", botanical_name: "Lantana camara", category: "Flowers", container_size: "1 gallon", quantity_available: 200, unit_price: 9, wholesale_eligible: true, native_status: false, foliage_type: "deciduous", sun_requirement: "full sun", water_requirement: "low", description: "Heat-loving bloomer for mass color.", bulk_price_tiers: [{ min_qty: 50, max_qty: 0, unit_price: 7 }], images: [IMG.sage] },
  // Hill Country Growers
  { vendor: 2, common_name: "Mexican Feather Grass", botanical_name: "Nassella tenuissima", category: "Ornamental Grasses", container_size: "1 gallon", quantity_available: 150, unit_price: 12, wholesale_eligible: true, native_status: false, foliage_type: "deciduous", sun_requirement: "full sun", water_requirement: "low", description: "Fine-textured golden grass for movement and contrast.", bulk_price_tiers: [{ min_qty: 25, max_qty: 0, unit_price: 9 }], images: [IMG.grass], featured: true },
  { vendor: 2, common_name: "Purple Fountain Grass", botanical_name: "Pennisetum setaceum", category: "Ornamental Grasses", container_size: "1 gallon", quantity_available: 90, unit_price: 14, sun_requirement: "full sun", water_requirement: "low", description: "Burgundy foliage with fluffy plumes.", images: [IMG.grass] },
  { vendor: 2, common_name: "Agave", botanical_name: "Agave americana", category: "Groundcover", container_size: "5 gallon", quantity_available: 40, unit_price: 38, native_status: true, foliage_type: "evergreen", sun_requirement: "full sun", water_requirement: "low", description: "Architectural succulent, drought tolerant.", images: [IMG.agave] },
];

export async function seedDemoData() {
  const me = await base44.auth.me();
  const existingVendors = await base44.entities.VendorProfile.list().catch(() => []);
  const existingProducts = await base44.entities.Product.list(1).catch(() => []);
  if (existingVendors.length || existingProducts?.length) return { ok: false, reason: "already_seeded" };

  const createdVendors = [];
  for (const v of VENDORS) {
    const created = await base44.entities.VendorProfile.create({ ...v, is_test_fixture: true, selling_status: "active" });
    createdVendors.push(created);
  }

  const productsToCreate = PRODUCTS.map((p) => {
    const vendor = createdVendors[p.vendor];
    return {
      is_test_fixture: true,
      common_name: p.common_name, botanical_name: p.botanical_name, category: p.category,
      description: p.description, caliper: p.caliper, container_size: p.container_size,
      current_height: p.current_height, physical_quantity: p.quantity_available,
      quantity_available: p.quantity_available, quantity_reserved: 0, quantity_sold: 0,
      unit_price: p.unit_price, minimum_order_quantity: p.minimum_order_quantity || 1,
      wholesale_eligible: !!p.wholesale_eligible, pickup_eligible: true, delivery_eligible: vendor.delivery_available,
      native_status: !!p.native_status, foliage_type: p.foliage_type || "",
      usda_zones: p.usda_zones || "", sun_requirement: p.sun_requirement || "",
      water_requirement: p.water_requirement || "", mature_height: p.mature_height || "",
      mature_spread: p.mature_spread || "", featured: !!p.featured, listing_status: "active",
      bulk_price_tiers: p.bulk_price_tiers || [], images: p.images || [],
      vendor_id: vendor.id, vendor_owner_id: me.id, vendor_name: vendor.business_name,
      vendor_city: vendor.city, vendor_state: vendor.state, verified_vendor: vendor.verification_status === "verified",
    };
  });
  await base44.entities.Product.bulkCreate(productsToCreate);
  return { ok: true, vendors: createdVendors.length, products: productsToCreate.length };
}