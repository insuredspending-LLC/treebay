import { useEffect, useLayoutEffect, useRef } from "react";
import { useOutlet, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

// Keeps bottom-tab root pages mounted (hidden) so their state and scroll
// survive tab switches; detail (non-tab) routes render fresh with a fade.
export default function KeepAliveOutlet({ keepPaths = [] }) {
  const outlet = useOutlet();
  const { pathname } = useLocation();
  const cache = useRef({});
  const scrollMap = useRef({});
  const keepSet = new Set(keepPaths);
  const isTab = keepSet.has(pathname);

  if (isTab) cache.current[pathname] = outlet;

  // Track scroll position for the active path so we can restore it on return.
  useEffect(() => {
    const onScroll = () => { scrollMap.current[pathname] = window.scrollY; };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [pathname]);

  // Restore scroll: tabs return to their saved position, detail pages reset to top.
  useLayoutEffect(() => {
    if (isTab) window.scrollTo(0, scrollMap.current[pathname] ?? 0);
    else window.scrollTo(0, 0);
  }, [pathname, isTab]);

  return (
    <>
      {Object.entries(cache.current).map(([p, el]) => (
        <div key={p} className={p === pathname ? "" : "hidden"} aria-hidden={p !== pathname}>
          {el}
        </div>
      ))}
      <AnimatePresence mode="wait">
        {!isTab && (
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {outlet}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}