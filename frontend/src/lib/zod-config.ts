import { z } from 'zod';

// Shared by browser and server module graphs; avoid even Zod's Function capability probe.
z.config({ jitless: true });
