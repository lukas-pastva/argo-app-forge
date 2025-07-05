import React, { useEffect, useState } from "react";

/* cycling order */
const modes = ["auto","light","dark"];

/* helper – returns "dark" or "light" for the current local time */
const themeByClock = () => {
  const h = new Date().getHours();
  return (h < 6 || h >= 18) ? "dark" : "light";
};

export default function ThemeToggle(){

  const [mode,setMode] = useState(localStorage.getItem("theme-mode") || "auto");

  /* apply theme + schedule next clock switch ------------------------ */
  useEffect(()=>{
    const root = document.documentElement;

    const apply = () => {
      root.dataset.theme = mode==="auto" ? themeByClock() : mode;
    };
    apply();

    /* in auto-mode flip at next 06:00 / 18:00 */
    let timer = null;
    if (mode==="auto"){
      const now   = new Date();
      const next  = new Date(now);
      next.setHours( (now.getHours() < 6) ? 6 : (now.getHours() < 18 ? 18 : 30), 0, 0, 0);
      timer = setTimeout(apply, next - now);
    }
    return () => clearTimeout(timer);
  },[mode]);

  /* icon glyphs */
  const icon = mode==="light" ? "☀️"
             : mode==="dark"  ? "🌙"
             :                  "🕑";

  return (
    <div className="theme-toggle"
         title={`Theme: ${mode}`}
         onClick={()=>{
           const next = modes[(modes.indexOf(mode)+1)%modes.length];
           setMode(next);
           localStorage.setItem("theme-mode",next);
         }}>
      {icon}
    </div>
  );
}
