import React, { lazy, Suspense, useState } from "react";
import Spinner from "./components/Spinner.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";
import {
  stepsMeta,
  StateProvider,
  useInitState,
} from "./state/initState.jsx";

// lazy‑load every wizard step (one component == one file)
const Step0Welcome  = lazy(() => import("./steps/Step0Welcome.jsx"));
const Step1Details  = lazy(() => import("./steps/Step1Details.jsx"));
const Step2Apps     = lazy(() => import("./steps/Step2Apps.jsx"));
const Step3Zip      = lazy(() => import("./steps/Step3Zip.jsx"));
const Step4Secrets  = lazy(() => import("./steps/Step4Secrets.jsx"));
const Step5Deploy   = lazy(() => import("./steps/Step5DeployKey.jsx"));
const Step6SSH      = lazy(() => import("./steps/Step6SSH.jsx"));
const Step7Scripts  = lazy(() => import("./steps/Step7Scripts.jsx"));
const Step8Overview = lazy(() => import("./steps/Step8Overview.jsx"));

const steps = [
  Step0Welcome,
  Step1Details,
  Step2Apps,
  Step3Zip,
  Step4Secrets,
  Step5Deploy,
  Step6SSH,
  Step7Scripts,
  Step8Overview,
];

export default function App() {
  const ctx = useInitState();              // global state helpers
  const [step, setStep] = useState(0);

  // keyboard handler – registers/unregisters internally
  ctx.useEnterAdvance(step, setStep, steps.length);

  const Current = steps[step];

  return (
    <StateProvider value={ctx}> {/* context provider */}
      <div className="app-wrapper">
        <ThemeToggle />

        {/* top pill‑navigator */}
        <div className="steps-nav">
          {stepsMeta.map((s, i) => (
            <div
              key={i}
              className={
                "step-pill " +
                (i === step ? "active" : i < step ? "completed" : "disabled")
              }
              title={s.desc}
              onClick={() => {
                if (i <= step) setStep(i);
              }}
            >
              <span className="num">{i + 1}</span>
              <span className="lbl">{s.label}</span>
            </div>
          ))}
        </div>

        {/* body */}
        <Suspense fallback={<Spinner size={48} />}> <Current step={step} setStep={setStep} /> </Suspense>

        {ctx.msg && <div className="copy-msg">{ctx.msg}</div>}
      </div>
    </StateProvider>
  );
}
