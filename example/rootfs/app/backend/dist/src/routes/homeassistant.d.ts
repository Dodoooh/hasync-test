import { Router } from 'express';
import { HomeAssistantService } from '../services/homeassistant';
import { AuthMiddleware } from '../middleware/auth';
export declare function createHomeAssistantRouter(haService: HomeAssistantService, authMiddleware: AuthMiddleware): Router;
//# sourceMappingURL=homeassistant.d.ts.map