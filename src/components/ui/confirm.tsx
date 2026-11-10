"use client"

import * as React from "react"
import { AlertDialog } from "@base-ui/react/alert-dialog"
import { Button } from "@/components/ui/button"

/** What a confirmation asks. */
export interface ConfirmRequest {
  /** The question, e.g. "Clear Hall 1?". */
  title: string
  /** What happens if it goes ahead. */
  body?: string
  /** The action's own name on its button, e.g. "Clear hall". */
  action: string
  /** An action that removes data: its button is the destructive one and Cancel has the focus. */
  destructive?: boolean
}

type Confirm = (request: ConfirmRequest) => Promise<boolean>

const ConfirmContext = React.createContext<Confirm | null>(null)

/** Ask before going ahead: resolves true when the action is chosen, false on Cancel or Esc. */
export function useConfirm(): Confirm {
  const confirm = React.useContext(ConfirmContext)
  if (!confirm) throw new Error("useConfirm needs a ConfirmProvider above it")
  return confirm
}

/**
 * The product's confirmation dialog, in place of the browser's own. One is
 * shown at a time; focus returns to whatever opened it.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = React.useState<ConfirmRequest | null>(null)
  const [open, setOpen] = React.useState(false)
  const resolver = React.useRef<((ok: boolean) => void) | null>(null)
  const cancel = React.useRef<HTMLButtonElement>(null)
  const go = React.useRef<HTMLButtonElement>(null)
  // Whatever had the focus when the question was asked: it gets it back.
  const opener = React.useRef<HTMLElement | null>(null)

  const confirm = React.useCallback<Confirm>((next) => {
    // A second question while one is open: the first is answered "no".
    resolver.current?.(false)
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setRequest(next)
    setOpen(true)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  function answer(ok: boolean) {
    resolver.current?.(ok)
    resolver.current = null
    setOpen(false)
  }

  return (
    <ConfirmContext value={confirm}>
      {children}
      <AlertDialog.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : answer(false))}>
        <AlertDialog.Portal>
          <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
          <AlertDialog.Popup
            data-slot="confirm"
            initialFocus={request?.destructive ? cancel : go}
            finalFocus={opener}
            className="fixed top-1/2 left-1/2 z-50 flex w-[400px] max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border bg-card p-4 text-sm text-card-foreground shadow-lg outline-none transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none"
          >
            <div className="flex flex-col gap-2">
              <AlertDialog.Title className="font-sans text-sm font-semibold normal-case">{request?.title}</AlertDialog.Title>
              {request?.body ? (
                <AlertDialog.Description className="text-muted-foreground">{request.body}</AlertDialog.Description>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button ref={cancel} variant="secondary" onClick={() => answer(false)}>
                Cancel
              </Button>
              <Button ref={go} variant={request?.destructive ? "destructive" : "default"} onClick={() => answer(true)}>
                {request?.action}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext>
  )
}
