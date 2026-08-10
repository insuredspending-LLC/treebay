import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { FlaskConical, Loader2 } from "lucide-react";
import { formatCurrency, apiError } from "@/lib/treebay";
import SimulatorState from "./SimulatorState";

const GROUPS = [
  { label: "Payment", items: [
    ["TEST_SUCCESS", "Payment succeeds"],
    ["TEST_DECLINED", "Payment declined"],
    ["TEST_TIMEOUT", "Payment timeout"],
    ["PAYMENT_RETRY_SUCCESS", "Retry payment (succeeds)"],
  ]},
  { label: "Fulfillment", items: [
    ["VENDOR_CONFIRM", "Advance one fulfillment step"],
    ["VENDOR_TIMEOUT", "Vendor confirmation timeout"],
  ]},
  { label: "Delivery", items: [
    ["DELIVERY_DELAY", "Delivery delayed"],
    ["DELIVERY_FAIL", "Delivery failed"],
  ]},
  { label: "Money & system", items: [
    ["REFUND", "Refund order"],
    ["CANCEL", "Cancel order"],
    ["MAINTENANCE", "Run transaction maintenance"],
  ]},
];

export default function TestSimulator({ orders, onChanged }) {
  const { toast } = useToast();
  const [orderId, setOrderId] = useState("");
  const [running, setRunning] = useState("");
  const [last, setLast] = useState(null);

  const run = async (scenario) => {
    if (scenario !== "MAINTENANCE" && !orderId) {
      toast({ title: "Select an order first", variant: "destructive" });
      return;
    }
    setRunning(scenario);
    try {
      const { data } = await base44.functions.invoke("runTestScenario", { scenario, orderId: orderId || undefined });
      setLast(data);
      toast({ title: scenario.replace(/_/g, " "), description: data.state ? `Order is now ${data.state.order_status}` : "Completed" });
      onChanged?.();
    } catch (e) {
      toast({ title: "Scenario failed", description: apiError(e), variant: "destructive" });
    } finally {
      setRunning("");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <FlaskConical className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="font-semibold">Transaction simulator</h2>
            <p className="text-xs text-muted-foreground">Every scenario runs through the live payment, inventory and fulfillment engines — nothing here is faked.</p>
          </div>
        </div>
        <Select value={orderId} onValueChange={setOrderId}>
          <SelectTrigger><SelectValue placeholder="Select an order to act on" /></SelectTrigger>
          <SelectContent>
            {orders.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.order_number} · {o.order_status} · {formatCurrency(o.total)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {GROUPS.map((g) => (
        <Card key={g.label} className="p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {g.items.map(([scenario, label]) => (
              <Button key={scenario} variant="outline" size="sm" className="justify-start"
                onClick={() => run(scenario)} disabled={!!running}>
                {running === scenario ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                {label}
              </Button>
            ))}
          </div>
        </Card>
      ))}

      {last && <SimulatorState result={last} />}
    </div>
  );
}