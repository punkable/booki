/* Slow native readings shared by the dock cards and their panels. */
import { dock as api } from "../api.js";
import { sharedReading } from "./async-cache.js";

export const deviceReading = sharedReading(() => api.deviceBatteries());
export const aiReading = sharedReading(() => api.aiUsage());
