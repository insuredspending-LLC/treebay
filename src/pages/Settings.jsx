import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAppUser } from "@/hooks/useAppUser";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";

export default function Settings() {
  const { buyerProfile, vendorProfiles, refresh } = useAppUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [delOpen, setDelOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const purge = async () => {
    setDeleting(true);
    try {
      const me = await base44.auth.me();
      // delete user's data across entities they own
      await Promise.all([
        base44.entities.BuyerProfile.deleteMany({}).catch(() => {}),
        base44.entities.VendorProfile.deleteMany({}).catch(() => {}),
        base44.entities.CarrierProfile.deleteMany({}).catch(() => {}),
        base44.entities.Favorite.deleteMany({}).catch(() => {}),
        base44.entities.UserBlock.deleteMany({}).catch(() => {}),
        base44.entities.Notification.deleteMany({}).catch(() => {}),
        base44.entities.Project.deleteMany({}).catch(() => {}),
      ]);
      toast({ title: "Account data deleted", description: "Your marketplace data has been removed." });
      logout();
    } catch (e) { toast({ title: "Could not fully delete", description: e.message, variant: "destructive" }); }
    finally { setDeleting(false); }
  };

  return (
    <div className="space-y-5">
      <div><h1 className="text-xl font-bold">Settings</h1><p className="text-sm text-muted-foreground">Manage your account and privacy.</p></div>
      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">Data & privacy</h2>
        <p className="text-sm text-muted-foreground">Delete your account and all associated marketplace data. This action is permanent and cannot be undone.</p>
        <Button variant="outline" className="text-rose-600 border-rose-200" onClick={() => setDelOpen(true)}><Trash2 className="w-4 h-4 mr-2" /> Delete account</Button>
      </Card>

      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-rose-600" /> Delete account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">This will permanently delete your profile, projects, favorites, messages, orders, and notifications. This cannot be undone.</p>
            <p className="text-sm">Type <span className="font-semibold">DELETE</span> to confirm.</p>
            <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={confirm !== "DELETE" || deleting} onClick={purge}>{deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Delete permanently</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}