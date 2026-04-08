/**
 * A Transport implementation that communicates with a Web Worker via postMessage.
 */
export class WorkerTransport {
    constructor(worker) {
        this.worker = worker;
        this.messageHandlers = [];
        this.closeHandlers = [];
        this.errorHandlers = [];

        this.worker.onmessage = (event) => {
            const message =
                typeof event.data === 'string'
                    ? event.data
                    : JSON.stringify(event.data);
            for (const handler of this.messageHandlers) {
                handler(message);
            }
        };

        this.worker.onerror = (event) => {
            for (const handler of this.errorHandlers) {
                handler(new Error(event.message || 'Worker error'));
            }
        };
    }

    send(message) {
        this.worker.postMessage(message);
    }

    onMessage(callback) {
        this.messageHandlers.push(callback);
    }

    onClose(callback) {
        this.closeHandlers.push(callback);
    }

    onError(callback) {
        this.errorHandlers.push(callback);
    }

    close() {
        this.worker.terminate();
        for (const handler of this.closeHandlers) {
            handler();
        }
    }
}
