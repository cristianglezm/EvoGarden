const INIT_TIMEOUT_MS = 15000;

/**
 * Tells the page that this worker cannot do its job: the same as an uncaught error, which the page
 * shows as a critical failure. Done by hand because an error thrown inside an async handler is not
 * delivered to the page.
 */
export function reportFatal(error: Error): void {
    const report = (globalThis as { reportError?: (error: unknown) => void }).reportError;
    if (typeof report === 'function') report.call(globalThis, error);
    else
        setTimeout(() => {
            throw error;
        });
}

/** Starts the wasm service of this thread; says whether it did, and never throws. */
export async function initializeWasm(service: { initialize(): Promise<unknown> }, workerName: string): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${workerName} WASM Initialization timed out.`)), INIT_TIMEOUT_MS);
        });
        await Promise.race([service.initialize(), timeout]);
        return true;
    } catch (error) {
        console.error(`${workerName}: FEService initialization failed.`, error);
        return false;
    } finally {
        clearTimeout(timer);
    }
}
