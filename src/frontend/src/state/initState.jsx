import React, { createContext, useContext, useReducer, useEffect } from "react";
import { NAME_RE, REPO_RE, DOMAIN_RE } from "../utils/regex.js";
import { rand, genPass, genCookie } from "../utils/random.js";

export const stepsMeta = [
  { label: "Welcome", desc: "Tiny tour of the whole flow." },
  { label: "Details", desc: "Main domain & Git repo." },
  { label: "Apps", desc: "Pick the Helm apps you need." },
  { label: "ZIP + Repo", desc: "Download ZIP, push to repo." },
  { label: "Secrets", desc: "SSH keys, tokens & passwords." },
  { label: "Deploy key", desc: "Add the SSH key to the repo." },
  { label: "SSH VMs", desc: "Log into every RKE2 node." },
  { label: "Scripts", desc: "Helper install scripts." },
  { label: "Overview", desc: "Everything in one place." },
];

// ‑‑ initial shape --------------------------------------------------------
const init = {
  bucket: "",
  domain: "",
  repo: "",
  apps: [],
  sel: new Set(),
  open: new Set(),
  keys: null,
  token: "",
  pwds: null,
  oauth2Secrets: {},
  s3: { id: "", key: "", url: "" },
  scripts: [],
  msg: "",
};

// crude reducer – merges payload -----------------------------------------
function reducer(state, action) {
  switch (action.type) {
    case "set":
      return { ...state, ...action.payload };
    case "toast":
      return { ...state, msg: action.payload };
    default:
      return state;
  }
}

const Ctx = createContext(null);
export const StateProvider = Ctx.Provider;
export const useInitState = () => useContext(Ctx);

// custom hook that bundles helpers ----------------------------------------
export function InitStateProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, init);

  /* tiny toast helper (auto‑clears) */
  function toast(txt) {
    dispatch({ type: "toast", payload: txt });
    setTimeout(() => dispatch({ type: "toast", payload: "" }), 2000);
  }

  /* advance‑on‑Enter key binding */
  function useEnterAdvance(step, setStep, max) {
    useEffect(() => {
      const onKey = (e) => {
        if (e.key !== "Enter") return;
        if (document.querySelector(".modal-overlay")) return;
        if (step < max - 1) setStep(step + 1);
      };
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }, [step, setStep, max]);
  }

  const value = {
    ...state,
    set: (payload) => dispatch({ type: "set", payload }),
    toast,
    useEnterAdvance,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// usually imported as:  const ctx = useInitState();
