import { bind, Subscribe } from "@react-rxjs/core";
import { createSignal } from "@react-rxjs/utils";
import { useCallback } from "react";
import { combineLatest, debounceTime, Observable } from "rxjs";
import { map } from "rxjs/operators";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const fields = [
  {
    name: "account-balance",
    title: "Account Balance USD:",
    defaultValue: 1000,
    type: "number",
    required: true,
    lockable: false,
  },
  {
    name: "risk-percent",
    title: "Risk (%) :",
    defaultValue: 2,
    type: "number",
    step: 0.01,
    min: 0,
    max: 100,
    required: true,
    lockable: true,
  },
  // {
  //   name: "risk-usd",
  //   title: "Risk USD:",
  //   defaultValue: "",
  //   type: "number",
  // },
  {
    name: "entry-price",
    title: "Entry Price (USD):",
    type: "number",
    required: true,
  },
  {
    name: "entry-fee",
    title: "Entry Fee (%):",
    defaultValue: "1",
    type: "number",
    min: 0,
    max: 100,
    lockable: true,
  },
  {
    name: "stoploss",
    title: "Stoploss (USD):",
    type: "number",
  },
  {
    name: "stop-fee",
    title: "Stop Fee %:",
    defaultValue: 1,
    type: "number",
    min: 0,
    max: 100,
    lockable: true,
  },
];

const states = fields.reduce<{
  [key in string]: {
    field: (typeof fields)[number];
    useValue: () => any;
    // valueChange$: Observable<any>;
    setValue: (payload: any) => void;
    value$: Observable<any>;
    lock$?: Observable<boolean>;
    useLock?: () => boolean;
    toggleLock?: () => void;
  };
}>((acc, field) => {
  const [valueChange$, setValue] = createSignal<any>();
  const initValue = localStorage.getItem(field.name);

  const [useValue, value$] = bind(
    valueChange$,
    initValue || field.defaultValue
  );

  value$
    .pipe(debounceTime(250))
    .subscribe((v) => localStorage.setItem(field.name, v as any));

  acc[field.name] = {
    field: field,
    useValue: useValue,
    // valueChange$: valueChange$,
    setValue: setValue,
    value$: value$.pipe(debounceTime(200)),
  };

  if (field.lockable) {
    const lockKey = `${field.name}.lock`;
    const [lockChange$, setLock] = createSignal<boolean>();
    const lockInitValue = localStorage.getItem(lockKey);

    const [useLock, lockValue$] = bind(lockChange$, Boolean(lockInitValue));

    acc[field.name].lock$ = lockValue$;
    acc[field.name].toggleLock = () => setLock(!lockValue$.getValue());
    acc[field.name].useLock = useLock;

    lockValue$
      .pipe(debounceTime(250))
      .subscribe((v) => localStorage.setItem(lockKey, String(v)));
  }

  return acc;
}, {});

const [useRiskInUSD, riskInUSD$] = bind(
  combineLatest(
    states["account-balance"].value$,
    states["risk-percent"].value$
  ).pipe(
    map((values: any) => {
      const [account_balance, risk_percent] = values as number[];
      return (account_balance * risk_percent) / 100;
    })
  ),
  0
);

const [useTrend, _trend$] = bind(
  combineLatest(states["entry-price"].value$, states["stoploss"].value$).pipe(
    map((values: any) => {
      const [entryPrice, stoploss] = values as string[];
      if (!entryPrice || !stoploss) {
        return undefined;
      }
      return entryPrice > stoploss ? "Bullish" : "Bearish";
    })
  ),
  undefined
);

const riskPerTrade$ = combineLatest(
  states["entry-price"].value$,
  states["stoploss"].value$
).pipe(
  map((values: any) => {
    const [entryPrice, stoploss] = values as number[];

    return Math.abs(entryPrice - stoploss);
  })
);

const [usePositionSizeUSD, positionSizeUSD$] = bind(
  combineLatest(states["entry-price"].value$, riskInUSD$, riskPerTrade$).pipe(
    map((values: any) => {
      const [entryPrice, riskInUSD, riskPerTrade] = values as number[];

      return (entryPrice * riskInUSD) / riskPerTrade;
    })
  ),
  undefined
);
const [usePositionSizeCrypto, _positionSizeCrypto$] = bind(
  combineLatest(positionSizeUSD$, states["entry-price"].value$).pipe(
    map((values: any) => {
      const [positionSizeUSD, entryPrice] = values as number[];

      return positionSizeUSD / entryPrice;
    })
  ),
  undefined
);
function ComputePositionSize() {
  const _states = Object.entries(states).reduce((acc, [fieldName, methods]) => {
    acc[fieldName] = methods.useValue();
    return acc;
  }, {} as { [key in string]: any });

  const _lockStates = Object.entries(states).reduce(
    (acc, [fieldName, methods]) => {
      if (methods.useLock) {
        acc[fieldName] = methods.useLock();
      }
      return acc;
    },
    {} as { [key in string]: boolean }
  );

  const riskInUSD = useRiskInUSD();
  const trend = useTrend();
  const positionSizeUSD = usePositionSizeUSD();
  const positionSizeCrypto = usePositionSizeCrypto();

  const reset = useCallback(
    () =>
      Object.entries(states).forEach(([key, methods]) => {
        if (!_lockStates[key]) {
          methods.setValue(methods.field.defaultValue || "");
        }
      }),
    [_lockStates]
  );
  const copy = useCallback((value: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`Copied ${value || ""}`, {});
  }, []);

  return (
    <Subscribe>
      <div className="flex flex-col w-full gap-4 md:w-4/5 lg:w-3/5  mx-auto">
        <h5 className="mx-auto text-md text-[#1d82f6] font-bold ">
          {trend && `You are ${trend}!`} &thinsp;
        </h5>

        <div className="flex gap-4 flex-col">
          {fields.map((f) => {
            return (
              <div
                key={`${f.name}-field`}
                className="flex gap-2 bg-[#2e2f30] rounded-md"
              >
                <label
                  htmlFor={f.name}
                  className="text-[#a1a5ab] basis-40 py-4 pl-4 text-sm my-auto font-semibold"
                >
                  {f.title}
                </label>
                <div className="bg-[#272829] w-full text-sm font-medium flex-1 rounded-r-md flex">
                  <input
                    name={f.name}
                    type={f.type}
                    disabled={_lockStates[f.name]}
                    value={_states[f.name] as any}
                    onChange={(e) => states[f.name].setValue(e.target.value)}
                    className="w-full outline-none py-4 px-2 bg-inherit disabled:text-[#1d82f6]"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                  ></input>
                  <div className="flex gap-2 text-base">
                    {f.lockable && (
                      <button
                        className="opacity-25 hover:opacity-100 transition delay-75"
                        onClick={() => {
                          if (states[f.name].toggleLock) {
                            states[f.name].toggleLock!();
                          }
                        }}
                      >
                        {_lockStates[f.name] ? "🔒" : "🔓"}
                      </button>
                    )}
                    <button
                      className="opacity-25 hover:opacity-10 transition delay-75"
                      onClick={() => copy(_states[f.name])}
                    >
                      📋
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <div>
          <button onClick={() => reset()}>Reset all</button>
        </div>
        <div>
          <p>Risk USD: {riskInUSD}</p>
          <p>Position Size USD: {positionSizeUSD}</p>
          <p>Position Size Crypto: {positionSizeCrypto}</p>
        </div>
      </div>
    </Subscribe>
  );
}

function App() {
  return (
    <>
      <main className="container px-4 mx-auto text-white gap-16 flex flex-col">
        <div className="items-center flex flex-col mx-auto gap-8 pt-16">
          <h1 className="text-4xl lg:text-6xl font-bold">
            Crypto Position Size Calculator!
          </h1>
          <p className="text-md mx-auto">
            Calculate your crypto position size according to account balance,
            risk, entry price, stop loss and exchange trading fees.
          </p>
        </div>
        <div className="flex flex-row">
          <ComputePositionSize />
        </div>
      </main>
      <ToastContainer
        autoClose={200}
        hideProgressBar
        stacked
        position="bottom-center"
        draggable={false}
        closeButton={false}
        theme="dark"
        className={"mb-4 md:mb-4"}
        toastClassName={
          "text-center rounded-md w-fit mx-auto px-2 py-1 text-white min-h-fit"
        }
      />
    </>
  );
}

export default App;
