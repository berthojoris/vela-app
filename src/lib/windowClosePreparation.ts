// Shared hook avoids a dependency cycle between IPC and workspace recovery.
let preparation: () => Promise<void> = () => Promise.resolve();

export function setWindowClosePreparation(prepare: () => Promise<void>): void {
  preparation = prepare;
}

export function prepareWindowClose(): Promise<void> {
  return preparation();
}
