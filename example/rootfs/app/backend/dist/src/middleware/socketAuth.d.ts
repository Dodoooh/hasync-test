import { Socket } from 'socket.io';
import { ExtendedError } from 'socket.io/dist/namespace';
export declare function rateLimitConnection(socket: Socket): boolean;
export declare function socketAuthMiddleware(socket: Socket, next: (err?: ExtendedError) => void): void;
declare module 'socket.io' {
    interface Socket {
        user?: {
            username: string;
            role: string;
        };
        clientId?: string;
    }
}
//# sourceMappingURL=socketAuth.d.ts.map