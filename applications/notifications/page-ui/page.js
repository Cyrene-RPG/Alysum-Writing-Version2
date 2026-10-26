import { supabase } from "/core/authentication/client.js";
import { createNotificationService } from "/core/notifications/service.js";
import { mountInbox } from "./inbox.js?v=2";
mountInbox(createNotificationService(supabase));
