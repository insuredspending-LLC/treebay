import { useEffect, useRef, useState } from "react";
import { Loader2, ChevronDown } from "lucide-react";

// Native-like pull-to-refresh bound to the window scroll. Wraps page content;
// when the user swipes down at the top, content translates and an indicator
// appears. On release past the threshold, `onRefresh` is awaited.
// Hidden (keep-alive) pages are skipped via an offsetParent check so only the
// active page reacts.
export default function PullToRefresh({ onRefresh, children }) {
  const wrapRef = useRef(null);
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const active = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const refreshingRef = useRef(false);
  refreshingRef.current = refreshing;

  useEffect(() => {
    const THRESHOLD = 70;
    let dy = 0;
    const onStart = (e) => {
      if (!wrapRef.current || wrapRef.current.offsetParent === null) { active.current = false; return; }
      if (window.scrollY <= 0 && !refreshingRef.current) {
        startY.current = e.touches[0]?.clientY ?? 0;
        active.current = true;
      } else {
        active.current = false;
      }
    };
    const onMove = (e) => {
      if (!active.current) return;
      dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (dy > 0) {
        e.preventDefault();
        setPull(Math.min(dy * 0.5, 100));
      }
    };
    const onEnd = async () => {
      if (!active.current) return;
      active.current = false;
      if (dy > THRESHOLD) {
        setRefreshing(true);
        setPull(40);
        try { await onRefreshRef.current?.(); } finally { setRefreshing(false); setPull(0); }
      } else {
        setPull(0);
      }
      dy = 0;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative" style={{ transform: `translateY(${pull}px)`, transition: pull === 0 && !refreshing ? "transform 0.2s ease" : "none" }}>
      <div className="absolute left-0 right-0 flex justify-center pointer-events-none" style={{ top: -40, height: 40, opacity: Math.min(1, pull / 60) }}>
        <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin text-primary" /> : <ChevronDown className={"w-4 h-4 text-primary transition-transform " + (pull > 60 ? "rotate-180" : "")} />}
        </div>
      </div>
      {children}
    </div>
  );
}