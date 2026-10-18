import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { Modal } from "./ui.jsx";

const ConfirmContext = createContext(null);

// Provee `confirm({ title, message, confirmLabel, danger })` -> Promise<boolean>,
// replicando el `confirmDialog` del frontend original.
export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);

  const confirm = useCallback(
    ({ title, message, confirmLabel = "Confirmar", danger = false }) =>
      new Promise((resolve) => {
        setRequest({ title, message, confirmLabel, danger, resolve });
      }),
    []
  );

  const close = useCallback(
    (value) => {
      setRequest((current) => {
        current?.resolve(value);
        return null;
      });
    },
    []
  );

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {request ? (
        <Modal
          title={request.title}
          onClose={() => close(false)}
          footer={
            <>
              <button className="btn btn--ghost" onClick={() => close(false)}>
                Cancelar
              </button>
              <button
                className={`btn ${request.danger ? "btn--danger" : ""}`}
                onClick={() => close(true)}
              >
                {request.confirmLabel}
              </button>
            </>
          }
        >
          <p style={{ margin: 0, color: "var(--body)" }}>{request.message}</p>
        </Modal>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de <ConfirmProvider>");
  return ctx.confirm;
}
