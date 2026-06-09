export interface InteractionEvent {
  page: string;
  component: string;
  action: string;
  detail?: string;
  timestamp: string;
}

const MAX_ENTRIES = 30;
let history: InteractionEvent[] = [];

export function trackAction(page: string, component: string, action: string, detail?: string) {
  history.push({ page, component, action, detail, timestamp: new Date().toISOString() });
  if (history.length > MAX_ENTRIES) history.shift();
}

export function getActionHistory(): InteractionEvent[] {
  return [...history];
}

export function clearActionHistory() {
  history = [];
}
