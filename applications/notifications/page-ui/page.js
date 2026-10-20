import { supabase } from "/core/authentication/client.js";
import { createNotificationService } from "/core/notifications/service.js";
import { mountInbox } from "./inbox.js";
mountInbox(createNotificationService(supabase));
