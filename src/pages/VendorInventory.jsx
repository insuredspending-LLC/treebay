import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Image } from "@/components/ui/image";
import { Plus, Pencil, Loader2, Package, Pause, Play, Archive, AlertTriangle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import StatusBadge from "@/components/StatusBadge";
import EmptyState from "@/components/EmptyState";
import { formatCurrency, formatNumber } from "@/lib/treebay";

export default function VendorInventory() {
  const { vendorProfiles } = useAppUser();
  const vendor = vendorProfiles[0];
  const { toast } = useToast();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  const ownedIds = (vendorProfiles || []).map((v) => v.id);
  const load = async () => {
    if (!ownedIds.length) { setLoading(false); return; }
    try { const all = await base44.entities.Product.list("-created_date", 300) || []; setProducts(all.filter((p) => ownedIds.includes(p.vendor_id))); } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [ownedIds.join(",")]);

  const updateStatus = async (p, status) => {
    try { await base44.entities.Product.update(p.id, { listing_status: status }); load(); toast({ title: "Updated" }); }
    catch (e) { toast({ title: "Could not update", description: e.message, variant: "destructive" }); }
  };

  const adjustQty = async (p, delta) => {
    const prevQty = p.quantity_available || 0;
    const prevStatus = p.listing_status;
    const q = Math.max(0, prevQty + delta);
    setProducts((list) => list.map((x) => x.id === p.id ? { ...x, quantity_available: q, listing_status: q === 0 ? "sold_out" : "active" } : x));
    try { await base44.entities.Product.update(p.id, { quantity_available: q, listing_status: q === 0 ? "sold_out" : "active" }); }
    catch (e) {
      setProducts((list) => list.map((x) => x.id === p.id ? { ...x, quantity_available: prevQty, listing_status: prevStatus } : x));
      toast({ title: "Could not update", variant: "destructive" });
    }
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div><h1 className="text-xl font-bold">Inventory</h1><p className="text-sm text-muted-foreground">{products.length} listings</p></div>
        <Button asChild><Link to="/vendor/inventory/new"><Plus className="w-4 h-4 mr-1" /> Add product</Link></Button>
      </div>

      {products.length === 0 ? <EmptyState icon={Package} title="No inventory yet" description="Add your first listing to start selling." action={<Button asChild><Link to="/vendor/inventory/new">Add product</Link></Button>} /> : (
        <div className="space-y-2">
          {products.map((p) => (
            <Card key={p.id} className="p-3 flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-muted shrink-0">
                {p.images?.[0] ? <Image src={p.images[0]} alt={p.common_name} fittingType="fill" className="w-full h-full" /> : <div className="w-full h-full flex items-center justify-center"><Package className="w-5 h-5 text-muted-foreground/40" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{p.common_name}</p>
                <p className="text-xs text-muted-foreground truncate">{[p.caliper, p.container_size].filter(Boolean).join(" · ")}</p>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={p.listing_status} />
                  <span className="text-xs text-muted-foreground">{formatCurrency(p.unit_price)}</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustQty(p, -1)}>−</Button>
                  <span className="text-sm font-semibold w-8 text-center">{formatNumber(p.quantity_available)}</span>
                  <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustQty(p, 1)}>+</Button>
                </div>
                {p.quantity_available <= 5 && p.quantity_available > 0 && <span className="text-[10px] text-amber-600 flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" /> Low</span>}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9"><Pencil className="w-4 h-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild><Link to={`/vendor/inventory/${p.id}`}>Edit product</Link></DropdownMenuItem>
                  {p.listing_status === "active" ? <DropdownMenuItem onClick={() => updateStatus(p, "paused")}><Pause className="w-4 h-4 mr-2" /> Pause</DropdownMenuItem>
                    : <DropdownMenuItem onClick={() => updateStatus(p, "active")}><Play className="w-4 h-4 mr-2" /> Activate</DropdownMenuItem>}
                  <DropdownMenuItem onClick={() => updateStatus(p, "sold_out")}>Mark sold out</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => updateStatus(p, "archived")}><Archive className="w-4 h-4 mr-2" /> Archive</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}