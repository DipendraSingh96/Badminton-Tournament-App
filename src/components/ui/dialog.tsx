"use client"

import * as React from "react"
import { Dialog } from "@base-ui/react/dialog"

/**
 * The product's dialog for a change that needs a few choices before it's
 * made (a withdrawal, an awarded match). Built like the confirmation dialog:
 * a title, the choices, and the actions at the bottom right, Cancel first.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** One line under the title saying what this does. */
  description?: string
  children: React.ReactNode
  /** The buttons: Cancel, then the action. */
  footer: React.ReactNode
  /** For looking at a document: as wide as a page. */
  wide?: boolean
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          data-slot="form-dialog"
          className={`fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] ${wide ? "w-[820px]" : "w-[480px]"} max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg border bg-card p-4 text-sm text-card-foreground shadow-lg outline-none transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none`}
        >
          <div className="flex flex-col gap-2">
            <Dialog.Title className="font-sans text-sm font-semibold normal-case">{title}</Dialog.Title>
            {description ? <Dialog.Description className="text-muted-foreground">{description}</Dialog.Description> : null}
          </div>
          <div className="scroll-pane flex min-h-0 flex-col gap-4 overflow-y-auto">{children}</div>
          <div className="flex justify-end gap-2">{footer}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
