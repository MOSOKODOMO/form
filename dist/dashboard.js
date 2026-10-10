import {authorize,dashboardPath,run} from './workspace-client.js';
await run(async()=>{const session=await authorize('router'); if(session) location.replace(dashboardPath(session.access));});
