/**
 * Interface for sending and receiving JSON-RPC messages.
 *
 * Implement this to use a custom communication channel (e.g. Web Workers,
 * MessagePort, or HTTP). See {@link WebSocketTransport} for a reference
 * implementation.
 */
export interface Transport {
    send(message: string): void;
    onMessage(callback: (message: string) => void): void;
    onClose(callback: () => void): void;
    onError(callback: (error: Error) => void): void;
    close(): void;
}

/** A {@link Transport} that communicates over a browser-native WebSocket. */
export class WebSocketTransport implements Transport {
    public connection: WebSocket;

    constructor(uri: string) {
        this.connection = new WebSocket(uri);
    }

    send(message: string): void {
        this.connection.send(message);
    }

    onMessage(callback: (message: string) => void): void {
        this.connection.addEventListener('message', (event) => {
            callback(typeof event.data === 'string' ? event.data : '');
        });
    }

    onClose(callback: () => void): void {
        this.connection.addEventListener('close', callback);
    }

    onError(callback: (error: Error) => void): void {
        this.connection.addEventListener('error', () => {
            callback(new Error('WebSocket error'));
        });
    }

    close(): void {
        this.connection.close();
    }
}

interface JSONRPCRequest {
    jsonrpc: '2.0';
    id: number;
    method: string;
    params: any;
}

interface JSONRPCNotification {
    jsonrpc: '2.0';
    method: string;
    params: any;
}

interface JSONRPCResponse {
    jsonrpc: '2.0';
    id: number;
    result?: any;
    error?: { code: number; message: string; data?: any };
}

interface PendingRequest {
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
}

export class JSONRPCClient {
    private transport: Transport;
    private nextId = 0;
    private pending = new Map<number, PendingRequest>();
    private notificationHandlers: Array<(data: any) => void> = [];
    private errorHandlers: Array<(error: Error) => void> = [];
    private closeHandlers: Array<() => void> = [];
    private ready: Promise<void>;

    constructor(transport: Transport) {
        this.transport = transport;
        this.ready = new Promise<void>((resolve) => {
            if (transport instanceof WebSocketTransport) {
                const ws = transport.connection;
                if (ws.readyState === WebSocket.OPEN) {
                    resolve();
                } else {
                    ws.addEventListener('open', () => resolve());
                }
            } else {
                resolve();
            }
        });

        transport.onError((error) => {
            for (const handler of this.errorHandlers) {
                handler(error);
            }
        });

        transport.onClose(() => {
            for (const [, pending] of this.pending) {
                clearTimeout(pending.timer);
                pending.reject(new Error('Connection closed'));
            }
            this.pending.clear();
            for (const handler of this.closeHandlers) {
                handler();
            }
        });

        transport.onMessage((raw) => {
            let msg: any;
            try {
                msg = JSON.parse(raw);
            } catch {
                return;
            }

            if ('id' in msg && msg.id != null && this.pending.has(msg.id)) {
                const pending = this.pending.get(msg.id)!;
                this.pending.delete(msg.id);
                clearTimeout(pending.timer);
                if (msg.error) {
                    pending.reject(
                        new Error(msg.error.message || 'JSON-RPC error'),
                    );
                } else {
                    pending.resolve(msg.result);
                }
            } else if ('method' in msg) {
                for (const handler of this.notificationHandlers) {
                    handler(msg);
                }
            }
        });
    }

    async request(
        req: { method: string; params: any },
        timeout: number,
    ): Promise<any> {
        await this.ready;
        const id = this.nextId++;
        const message: JSONRPCRequest = {
            jsonrpc: '2.0',
            id,
            method: req.method,
            params: req.params,
        };
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`Request ${req.method} timed out`));
            }, timeout);
            this.pending.set(id, { resolve, reject, timer });
            this.transport.send(JSON.stringify(message));
        });
    }

    async notify(notification: { method: string; params: any }): Promise<void> {
        await this.ready;
        const message: JSONRPCNotification = {
            jsonrpc: '2.0',
            method: notification.method,
            params: notification.params,
        };
        this.transport.send(JSON.stringify(message));
    }

    onNotification(handler: (data: any) => void): void {
        this.notificationHandlers.push(handler);
    }

    onError(handler: (error: Error) => void): void {
        this.errorHandlers.push(handler);
    }

    onClose(handler: () => void): void {
        this.closeHandlers.push(handler);
    }

    close(): void {
        for (const [id, pending] of this.pending) {
            clearTimeout(pending.timer);
            pending.reject(new Error('Client closed'));
        }
        this.pending.clear();
        this.transport.close();
    }
}
